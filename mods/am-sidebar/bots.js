// Bot definitions in Herdr: which projects have them (every open space's folder plus the
// remembered projects), reading them on this machine or another, writing them here, and
// watching them. The rules themselves live in model.js. Apache-2.0.
//
// No `fs/promises` here: Herdr's writes only under its app home, and has no access().
// Files go through readTextFile/writeTextFile, folders through exec.

import { spaces, exec, readTextFile, writeTextFile, watchFolder, shared, setShared, home, appHome, hc, terminals, notify } from "herdr";
import { BOT_LABEL, BOTS_PATH, PROJECTS_FILE, projectOf, parseBots, checkBots, listedProjects } from "./model.js";
import { relabel, relabelPlan, relabelWarning } from "./launchArgs.js";
import { CALL_TIMEOUT_MS, TimedOut, discover, within } from "./discover.js";

// Projects a bot was created or attached in: [{ key, machine }], machine null for this one.
const REMEMBERED = "am.sidebar.projects";
// A folder's project changes rarely (a repo made or removed): looked up again after a minute.
const KEY_TTL = 60_000;

const keys = new Map(); // JSON [machine, folder] -> { key, own, at, checking? } (model.js projectOf)
const lastGood = new Map(); // JSON [machine, key] -> { file, warnings }

const id = (machine, key) => JSON.stringify([machine ?? null, key]);
const under = (key, rest) => `${key === "/" ? "" : key}/${rest}`;

// A call that rejects on another machine: rethrown when the machine can't be reached (the
// answer is unknown, never "no"), else `fallback` (the program or file isn't there).
// On this machine a rejection always means the program or file isn't there. With `sleep`
// (the caller's timer), a call to another machine longer than CALL_TIMEOUT_MS rejects
// TimedOut: the machine is away.
async function orUnreachable(on, call, fallback, sleep) {
  const timed = (p) => within(p, on ? CALL_TIMEOUT_MS : 0, sleep);
  try { return await timed(call()); } catch (e) {
    if (!on) return fallback;
    if (e instanceof TimedOut) throw e;
    try { await timed(exec("true", [], { on })); } catch { throw e; }
    return fallback;
  }
}
function gitOn(on, sleep) {
  return (args, cwd) => orUnreachable(on, async () => {
    const r = await exec("git", args, { cwd, on });
    return r.code === 0 ? r.stdout : null;
  }, null, sleep);
}
function existsOn(on, sleep) {
  return (p) => orUnreachable(on, async () => (await readTextFile(p, { on })) !== null, false, sleep);
}

/**
 * The project of a folder on a machine (null: this one), as model.js projectOf's
 * `{ key, own }`, cached for a minute. When the machine can't be reached, the last answer
 * found for the folder; with none, it rejects. `opts.sleep`: see orUnreachable.
 */
export async function projectOfFolder(folder, machine = null, { sleep = null } = {}) {
  const k = id(machine, folder);
  const hit = keys.get(k);
  if (hit && Date.now() - hit.at < KEY_TTL) return { key: hit.key, own: hit.own };
  let found;
  try {
    found = await projectOf(folder, gitOn(machine, sleep), existsOn(machine, sleep));
  } catch (e) {
    if (hit) return { key: hit.key, own: hit.own };
    throw e;
  }
  keys.set(k, { ...found, at: Date.now() });
  return found;
}

/** The project key of a folder seen in passing (a pane's, a space's): the walk-up rule. */
export async function keyOf(folder, machine = null) {
  return (await projectOfFolder(folder, machine)).key;
}

/** The project of a folder someone picked as the project: its git main checkout, else itself. */
export async function ownKeyOf(folder, machine = null) {
  return (await projectOfFolder(folder, machine)).own;
}

/** Whether a folder is there now; false also when its machine can't be asked. */
export async function folderExists(folder, machine = null) {
  try { return (await exec("test", ["-d", folder], { on: machine })).code === 0; } catch { return false; }
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

// Discovery's lookup (knownKeyOf): a folder keyed before answers at once with that key, and
// is looked up again in the background (one look at a time) once the answer is a minute old,
// so no refresh waits on a folder it has seen, whatever its machine is doing.
async function knownKeyOf(folder, machine, sleep) {
  const hit = keys.get(id(machine, folder));
  if (!hit) return (await projectOfFolder(folder, machine, { sleep })).key;
  if (Date.now() - hit.at >= KEY_TTL && !hit.checking) {
    hit.checking = true;
    projectOfFolder(folder, machine, { sleep }).catch(() => {}).finally(() => { hit.checking = false; });
  }
  return hit.key;
}

// One project's bots.json for discover.js: { file, warnings }, null when there is none (a
// remembered project is forgotten then); rejects when the machine can't answer.
async function readProject(p) {
  const k = id(p.machine, p.key);
  const text = await readTextFile(under(p.key, BOTS_PATH), { on: p.machine });
  if (text === null) {
    lastGood.delete(k);
    if (p.remembered) forgetProject(p.key, p.machine);
    return null;
  }
  try {
    const { file, warnings } = parseBots(text);
    lastGood.set(k, { file, warnings });
    return { file, warnings };
  } catch (e) {
    const why = `${under(p.key, BOTS_PATH)}: ${e?.message ?? e}`;
    const last = lastGood.get(k);
    return last ? { file: last.file, warnings: [why, ...last.warnings] } : { file: { version: 1, categories: [], bots: [] }, warnings: [why] };
  }
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
 * Each machine is asked on its own, a few lookups at once (discover.js). `opts.sleep(ms)`
 * (the caller's timer: a mod has no setTimeout) bounds each call to another machine to
 * CALL_TIMEOUT_MS, after which that machine's projects show their last good file;
 * `opts.onUpdate(list)` gets the list as soon as a machine is done, this computer's
 * projects first, before a slow machine answers.
 */
export async function discoverProjects({ sleep = null, onUpdate = null } = {}) {
  // An empty folder is that machine's home. Ours is home(); another machine's isn't known
  // here without asking it, so such a space is skipped (its projects can be remembered).
  const shown = spaces().map((s) => ({ id: s.id, machine: s.machine ?? null, folder: s.folder || (s.machine ? null : home()) }));
  return discover({ spaces: shown, remembered: remembered() }, {
    listed: listedByCli,
    keyOf: (folder, machine) => knownKeyOf(folder, machine, sleep),
    read: readProject,
    last: (p) => lastGood.get(id(p.machine, p.key)),
    cachedKey: (folder, machine) => keys.get(id(machine, folder))?.key,
  }, { sleep, onUpdate });
}

// ---- The last discovery, kept between runs (main.js keeps it in its localStorage) ----

/**
 * The text that restoreDiscovery draws from after a restart: the folders' keys and the
 * projects found (`found`, discoverProjects' list).
 */
export function discoverySnapshot(found) {
  return JSON.stringify({
    keys: [...keys].map(([k, v]) => [...JSON.parse(k), v.key, v.own]),
    projects: found.map((p) => ({ key: p.key, machine: p.machine ?? null, file: p.file, warnings: p.warnings })),
  });
}

/**
 * At startup, a discoverySnapshot text (null, or anything unreadable: nothing): its keys and
 * projects become the ones known (each folder looked up again at the next discovery, each
 * project read again; a machine away keeps showing them), and the projects come back as
 * discoverProjects would list them for the spaces open now, to draw before it has answered.
 */
export function restoreDiscovery(text) {
  let saved;
  try { saved = JSON.parse(text); } catch { return []; }
  if (!saved || typeof saved !== "object") return [];
  const str = (v) => typeof v === "string";
  for (const e of Array.isArray(saved.keys) ? saved.keys : []) {
    if (!Array.isArray(e)) continue;
    const [machine, folder, key, own] = e;
    if (!(machine === null || str(machine)) || !str(folder) || !str(key) || !str(own)) continue;
    const k = id(machine, folder);
    if (!keys.has(k)) keys.set(k, { key, own, at: 0 });
  }
  const out = [];
  for (const p of Array.isArray(saved.projects) ? saved.projects : []) {
    if (!p || !str(p.key) || !(p.machine === null || str(p.machine))) continue;
    let file;
    try { ({ file } = parseBots(JSON.stringify(p.file))); } catch { continue; }
    const warnings = Array.isArray(p.warnings) ? p.warnings.filter(str) : [];
    const k = id(p.machine, p.key);
    if (!lastGood.has(k)) lastGood.set(k, { file, warnings });
    const on = spaces().filter((s) => {
      const folder = s.folder || (s.machine ? null : home());
      return folder && keys.get(id(s.machine ?? null, folder))?.key === p.key && (s.machine ?? null) === p.machine;
    }).map((s) => s.id);
    out.push({ key: p.key, machine: p.machine, spaces: on, file, warnings });
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
  const errors = checkBots(file, expected);
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
  return { relabel: expected === null ? Promise.resolve({ done: [], failed: [], unchecked: [] }) : relabelLocal(expected, file) };
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
    if (!plan.length) return { done: [], failed: [], unchecked: [] };
    const io = {
      rows: async (id) => terminals().filter((t) => t?.state === "live" && typeof t.address === "string" && !t.address.includes("/")
        && t.labels?.[BOT_LABEL] === id),
      label: async (address, words) => (await hc(["label", address, ...words])).code === 0,
    };
    const out = await relabel(plan, io);
    const warning = relabelWarning(out);
    if (warning) {
      notify({ title: "Bots", level: "warning", timeout: 15000,
        body: `${warning} Edit the bot again, or Detach and Attach it, to retry.` });
    }
    return out;
  } catch (e) {
    notify({ title: "Bots", level: "warning", timeout: 15000, body: `Saved, but the panes' labels weren't updated: ${e?.message ?? e}` });
    return { done: [], failed: [], unchecked: [] };
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
