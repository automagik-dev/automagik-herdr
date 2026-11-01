// Bot definitions in Herdr: which projects have them (every open space's folder plus the
// remembered projects), reading them on this machine or another, writing them here, and
// watching them. The rules themselves live in model.js. Apache-2.0.
//
// No `fs/promises` here: Herdr's writes only under its app home, and has no access().
// Files go through readTextFile/writeTextFile, folders through exec.

import { spaces, exec, readTextFile, writeTextFile, watchFolder, shared, setShared, home, appHome, hc, terminals, notify } from "herdr";
import { BOT_LABEL, BOTS_PATH, PROJECTS_FILE, projectKeyOf, parseBots, checkBots, listedProjects } from "./model.js";
import { relabel, relabelPlan } from "./launchArgs.js";

// Projects a bot was created or attached in: [{ key, machine }], machine null for this one.
const REMEMBERED = "spaces-agents.projects";
// A folder's project changes rarely (a repo made or removed): looked up again after a minute.
const KEY_TTL = 60_000;

const keys = new Map(); // JSON [machine, folder] -> { key, at }
const lastGood = new Map(); // JSON [machine, key] -> { file, warnings }

const id = (machine, key) => JSON.stringify([machine ?? null, key]);
const under = (key, rest) => `${key === "/" ? "" : key}/${rest}`;

// A call that rejects on another machine: rethrown when the machine can't be reached (the
// answer is unknown, never "no"), else `fallback` (the program or file isn't there).
// On this machine a rejection always means the program or file isn't there.
async function orUnreachable(on, call, fallback) {
  try { return await call(); } catch (e) {
    if (!on) return fallback;
    try { await exec("true", [], { on }); } catch { throw e; }
    return fallback;
  }
}
function gitOn(on) {
  return (args, cwd) => orUnreachable(on, async () => {
    const r = await exec("git", args, { cwd, on });
    return r.code === 0 ? r.stdout : null;
  }, null);
}
function existsOn(on) {
  return (p) => orUnreachable(on, async () => (await readTextFile(p, { on })) !== null, false);
}

/**
 * The project key of a folder on a machine (null: this one), cached for a minute. When the
 * machine can't be reached, the last key found for the folder; with none, it rejects.
 */
export async function keyOf(folder, machine = null) {
  const k = id(machine, folder);
  const hit = keys.get(k);
  if (hit && Date.now() - hit.at < KEY_TTL) return hit.key;
  let key;
  try {
    key = await projectKeyOf(folder, gitOn(machine), existsOn(machine));
  } catch (e) {
    if (hit) return hit.key;
    throw e;
  }
  keys.set(k, { key, at: Date.now() });
  return key;
}

// The projects the command line created, edited, started or attached bots in (model.js
// PROJECTS_FILE, local keys). Only the CLI writes the file; an unreadable one lists none.
async function listedByCli() {
  try { return listedProjects(await readTextFile(`${appHome()}/${PROJECTS_FILE}`)); } catch { return []; }
}

function remembered() {
  const list = shared(REMEMBERED);
  return Array.isArray(list) ? list.filter((p) => typeof p?.key === "string") : [];
}

/** Remembers a project so its bots are found with no open space (setShared only on a change). */
export function rememberProject(key, machine = null) {
  const list = remembered();
  if (list.some((p) => p.key === key && (p.machine ?? null) === machine)) return;
  setShared(REMEMBERED, [...list, { key, machine }]);
}

function forgetProject(key, machine) {
  const list = remembered();
  const kept = list.filter((p) => !(p.key === key && (p.machine ?? null) === machine));
  if (kept.length !== list.length) setShared(REMEMBERED, kept);
}

/**
 * Every project with definitions, once each however many spaces show it:
 * [{ key, machine, file, warnings, spaces }], `spaces` the ids of the open spaces keyed
 * to it, in sidebar order (A8 draws the tree under the first). For showing only: `file`
 * is parseBots' cleaned copy (see writeBots). A read that rejects (the machine is away)
 * keeps the last good one; a file that doesn't parse keeps the last good one too, else
 * comes back with no bots and the reason in `warnings`. A remembered project is forgotten
 * only when its file is gone (read returns null), never when the read rejects. The CLI's
 * projects (listedByCli) are found as the remembered ones are; one whose file is gone is
 * just not shown: its line in the CLI's file stays, as the view never writes that file.
 */
export async function discoverProjects() {
  const found = new Map(); // id -> { key, machine, spaces, remembered }
  const add = (key, machine, space, wasRemembered) => {
    const k = id(machine, key);
    const p = found.get(k) ?? { key, machine: machine ?? null, spaces: [], remembered: false };
    if (space) p.spaces.push(space);
    p.remembered ||= wasRemembered;
    found.set(k, p);
  };
  for (const s of spaces()) {
    // An empty folder is that machine's home. Ours is home(); another machine's isn't known
    // here without asking it, so such a space is skipped (its projects can be remembered).
    const folder = s.folder || (s.machine ? null : home());
    if (!folder) continue;
    // A machine that can't be reached and was never keyed: skipped this tick.
    try { add(await keyOf(folder, s.machine), s.machine, s.id, false); } catch {}
  }
  for (const p of remembered()) add(p.key, p.machine ?? null, null, true);
  for (const key of await listedByCli()) add(key, null, null, false);

  const out = [];
  for (const [k, p] of found) {
    const entry = (read) => out.push({ key: p.key, machine: p.machine, spaces: p.spaces, ...read });
    let text;
    try {
      text = await readTextFile(under(p.key, BOTS_PATH), { on: p.machine });
    } catch {
      if (lastGood.has(k)) entry(lastGood.get(k));
      continue;
    }
    if (text === null) {
      lastGood.delete(k);
      if (p.remembered) forgetProject(p.key, p.machine);
      continue;
    }
    try {
      const { file, warnings } = parseBots(text);
      lastGood.set(k, { file, warnings });
      entry({ file, warnings });
    } catch (e) {
      const why = `${under(p.key, BOTS_PATH)}: ${e?.message ?? e}`;
      const last = lastGood.get(k);
      entry(last ? { file: last.file, warnings: [why, ...last.warnings] } : { file: { version: 1, categories: [], bots: [] }, warnings: [why] });
    }
  }
  return out;
}

/**
 * Writes a project's definitions on this machine (Create writes only here) and remembers
 * the project. Read-edit-write, so nobody's edit is lost:
 *   const text = await readTextFile(`${key}/.herdr/bots.json`);   // null: no file yet
 *   const file = text === null ? { version: 1, categories: [], bots: [] } : parseBots(text).raw;
 *   ... edit `file` ...
 *   await writeBots(key, file, text);
 * Edit `raw`, never parseBots' `file` or discoverProjects' copy: those leave out entries
 * that can't be shown, and writing them would delete those entries. `expected` is required:
 * the text read (null when there was no file); a file changed since rejects (writeTextFile's
 * stale-snapshot rule). A file checkBots faults is refused before anything is written.
 * After an edit, the labels of the changed bots' live local panes follow (relabelLocal),
 * without the save waiting for them: resolves with { relabel }, that work's promise.
 */
export async function writeBots(projectKey, file, expected) {
  if (expected === undefined) throw new Error("writeBots: pass the text the edit started from (null for a new file)");
  const errors = checkBots(file);
  if (errors.length) throw new Error(`Not saved: ${errors.join("; ")}`);
  // writeTextFile isn't documented to make folders; Herdr's fs writes only in its home.
  if (expected === null) {
    const dir = under(projectKey, ".herdr");
    const r = await exec("mkdir", ["-p", dir]);
    if (r.code !== 0) throw new Error(`Couldn't make ${dir}: ${r.stderr.trim()}`);
  }
  await writeTextFile(under(projectKey, BOTS_PATH), `${JSON.stringify(file, null, 2)}\n`, expected);
  keys.clear(); // a folder outside git may belong to this project now
  rememberProject(projectKey, null);
  // Not awaited: the save is done; the labels follow on their own (A16).
  return { relabel: expected === null ? Promise.resolve({ done: [], failed: [] }) : relabelLocal(expected, file) };
}

/**
 * A16: after an edit (the form's save, any writeBots), the live panes on this computer of
 * every bot whose labels changed (rank, lead, category, a lead's captain status) get them
 * rewritten by launchArgs.js relabel. Another machine's panes are never touched. Never
 * rejects: panes left unlabelled are named in one notice. Resolves relabel's { done, failed }.
 */
export async function relabelLocal(beforeText, afterRaw) {
  try {
    const plan = relabelPlan(parseBots(beforeText).file, parseBots(JSON.stringify(afterRaw)).file);
    if (!plan.length) return { done: [], failed: [] };
    const io = {
      rows: async (id) => terminals().filter((t) => t?.state === "live" && typeof t.address === "string" && !t.address.includes("/")
        && t.labels?.[BOT_LABEL] === id),
      label: async (address, words) => (await hc(["label", address, ...words])).code === 0,
    };
    const out = await relabel(plan, io);
    if (out.failed.length) {
      notify({ title: "Bots", level: "warning", timeout: 15000,
        body: `Saved, but these panes' labels weren't updated: ${out.failed.join(", ")}. Edit the bot again, or Detach and Attach it, to retry.` });
    }
    return out;
  } catch (e) {
    notify({ title: "Bots", level: "warning", timeout: 15000, body: `Saved, but the panes' labels weren't updated: ${e?.message ?? e}` });
    return { done: [], failed: [] };
  }
}

/**
 * Watches a local project's `.herdr/` folder and calls onChange after each change, while
 * stillWanted() holds; run it in cx.spawn. Resolves false at once when the project has no
 * bots.json (the 15-second re-read covers it), and when the watch fails.
 * Another machine's projects can't be watched (watchFolder takes no `on`).
 */
export async function watchProject(key, stillWanted, onChange) {
  try { if ((await readTextFile(under(key, BOTS_PATH))) === null) return false; } catch { return false; }
  try {
    while (stillWanted()) {
      await watchFolder(under(key, ".herdr"));
      if (stillWanted()) await onChange();
    }
    return true;
  } catch { return false; }
}
