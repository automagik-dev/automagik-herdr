// Bot definitions in Herdr: which projects have them (every open space's folder plus the
// remembered projects), reading them on this machine or another, writing them here, and
// watching them. The rules themselves live in model.js. Apache-2.0.

import { spaces, exec, readTextFile, writeTextFile, watchFolder, shared, setShared, home } from "herdr";
import * as fs from "fs/promises";
import { BOTS_PATH, projectKeyOf, parseBots, checkBots } from "./model.js";

// Projects a bot was created or attached in: [{ key, machine }], machine null for this one.
const REMEMBERED = "spaces-agents.projects";
// A folder's project changes rarely (a repo made or removed): looked up again after a minute.
const KEY_TTL = 60_000;

const keys = new Map(); // JSON [machine, folder] -> { key, at }
const lastGood = new Map(); // JSON [machine, key] -> { file, warnings }

const id = (machine, key) => JSON.stringify([machine ?? null, key]);
const filePath = (key) => `${key === "/" ? "" : key}/${BOTS_PATH}`;

function gitOn(on) {
  return (args, cwd) => exec("git", args, { cwd, on }).then((r) => (r.code === 0 ? r.stdout : null), () => null);
}
function existsOn(on) {
  if (!on) return (p) => fs.access(p).then(() => true, () => false);
  return (p) => readTextFile(p, { on }).then((t) => t !== null, () => false);
}

/** The project key of a folder on a machine (null: this one), cached for a minute. */
export async function keyOf(folder, machine = null) {
  const k = id(machine, folder);
  const hit = keys.get(k);
  if (hit && Date.now() - hit.at < KEY_TTL) return hit.key;
  const key = await projectKeyOf(folder, gitOn(machine), existsOn(machine));
  keys.set(k, { key, at: Date.now() });
  return key;
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
 * to it, in sidebar order (A8 draws the tree under the first). A file that can't be read
 * now (the machine is away) or parsed keeps its last good read; a remembered project is
 * forgotten only when its file is gone (read returns null), never when the read rejects.
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
    // An empty folder is that machine's home; another machine's home isn't known here.
    const folder = s.folder || (s.machine ? null : home());
    if (!folder) continue;
    try { add(await keyOf(folder, s.machine), s.machine, s.id, false); } catch {}
  }
  for (const p of remembered()) add(p.key, p.machine ?? null, null, true);

  const out = [];
  for (const [k, p] of found) {
    let text;
    try {
      text = await readTextFile(filePath(p.key), { on: p.machine });
    } catch {
      const last = lastGood.get(k);
      if (last) out.push({ key: p.key, machine: p.machine, spaces: p.spaces, ...last });
      continue;
    }
    if (text === null) {
      lastGood.delete(k);
      if (p.remembered) forgetProject(p.key, p.machine);
      continue;
    }
    try {
      const read = parseBots(text);
      lastGood.set(k, read);
      out.push({ key: p.key, machine: p.machine, spaces: p.spaces, ...read });
    } catch (e) {
      const last = lastGood.get(k);
      const why = `${filePath(p.key)}: ${e?.message ?? e}`;
      if (last) out.push({ key: p.key, machine: p.machine, spaces: p.spaces, file: last.file, warnings: [why, ...last.warnings] });
    }
  }
  return out;
}

/**
 * Writes a project's definitions on this machine (Create writes only here) and remembers
 * the project. Refuses a file checkBots faults. `expected`: the text the caller read and
 * edited (null: the file is new); left out, the file as it is now. A file changed since
 * rejects (writeTextFile's stale-snapshot rule) rather than losing someone's edit.
 */
export async function writeBots(projectKey, file, expected) {
  const errors = checkBots(file);
  if (errors.length) throw new Error(`Not saved: ${errors.join("; ")}`);
  const path = filePath(projectKey);
  await fs.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  const before = expected === undefined ? await readTextFile(path) : expected;
  await writeTextFile(path, `${JSON.stringify(file, null, 2)}\n`, before);
  keys.clear(); // a folder outside git may belong to this project now
  rememberProject(projectKey, null);
}

/**
 * Watches a local project's `.herdr/` folder and calls onChange after each change, while
 * stillWanted() holds; run it in cx.spawn. Resolves false at once when there is no such
 * folder (the 15-second re-read covers it), and when the watch fails.
 * Another machine's projects can't be watched (watchFolder takes no `on`).
 */
export async function watchProject(key, stillWanted, onChange) {
  const dir = `${key === "/" ? "" : key}/.herdr`;
  try { await fs.access(dir); } catch { return false; }
  try {
    while (stillWanted()) {
      await watchFolder(dir);
      if (stillWanted()) await onChange();
    }
    return true;
  } catch { return false; }
}
