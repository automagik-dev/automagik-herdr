// The rename migration on an app home (Group 6a, D12): layouts, keys.json and app-home paths
// follow the folders the ownership record says the pack renamed. Every file it rewrites is
// copied into a dated backup folder first, and `journal.json` there lists each edit (before and
// after), which `revert` reads to undo exactly those edits and nothing the person changed since.
// Backups: <backupDir>/layouts/<name>.json and <backupDir>/keys.json, the files as they were.
// It never writes shared.json (Herdr owns it: the mods' shims carry the shared keys) and never
// touches a folder in mods/ (update.mjs moves those). Node only; the rules live in migrate.js.
// Apache-2.0.

import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseMarker } from "./release.js";
import { PATH_RENAMES, RENAMES, SHARED_RENAMES, activeRenames, rewriteKeys, rewriteLayout } from "./migrate.js";

export { KEY_RENAMES, RENAMES } from "./migrate.js";

const exists = (path) => { try { lstatSync(path); return true; } catch { return false; } };
const readJson = (path) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return undefined; } };
const writeAtomic = (path, text) => { writeFileSync(`${path}.am-tmp`, text); renameSync(`${path}.am-tmp`, path); };
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
export const JOURNAL = "journal.json";
const REVERTED = "journal.reverted.json";

/**
 * What the migration would do on app home `home`, from what is on disk and the ownership record:
 * `{ folders, layouts, keys, shared, paths, left }`.
 * - folders: [old, new] for record-listed old folders still in mods/ (update.mjs moves them when a
 *   release ships the new name; the migration itself never moves a mod);
 * - layouts: `{file, edits, body}` per layout naming a renamed folder;
 * - keys: [before, after] actions and sections in keys.json (`edits` and `body` on `keysFile`);
 * - shared: [old, new] keys shared.json still has only under the old name (read, never written:
 *   the mods copy them on their first load);
 * - paths: [old, new] app-home paths to copy;
 * - left: `{item, reason}` for references not rewritten (a kept folder, an unknown shape).
 */
export function plan(home) {
  const modsDir = join(home, "mods");
  let record = null;
  try { record = parseMarker(readFileSync(join(home, "automagik-herdr", "installed-by-install.sh"), "utf8")); } catch {}
  const owned = new Set(record?.mods ?? []);
  const present = (name) => exists(join(modsDir, name));
  const { active } = activeRenames(owned, present);
  const out = { folders: [], layouts: [], keys: [], keysFile: null, shared: [], paths: [], left: [] };
  // A reference is reported only when its folder is someone else's or gone with no successor;
  // one naming a pack folder not renamed yet is simply not due.
  const report = (file) => ({ mod, ref }) => {
    if (owned.has(mod) && present(mod)) return;
    out.left.push({ item: `${file}: ${ref}`, reason: present(mod) ? `mods/${mod} is not the pack's (--adopt takes it)` : `no installed mod replaces ${mod}` });
  };

  for (const [old, now] of Object.entries(RENAMES)) {
    if (owned.has(old) && present(old) && !present(now)) out.folders.push([old, now]);
  }

  const layoutsDir = join(home, "layouts");
  let names = [];
  try { names = readdirSync(layoutsDir).filter((n) => n.endsWith(".json")).sort(); } catch {}
  for (const name of names) {
    const file = join(layoutsDir, name);
    const parsed = readJson(file);
    const result = parsed === undefined ? null : rewriteLayout(parsed, active);
    if (!result) { out.left.push({ item: file, reason: "not a layout this migration recognises: left as it is" }); continue; }
    result.left.forEach(report(file));
    if (result.edits.length) out.layouts.push({ file, edits: result.edits, body: json(result.layout) });
  }

  const keysFile = join(home, "keys.json");
  if (existsSync(keysFile)) {
    const parsed = readJson(keysFile);
    const result = parsed === undefined ? null : rewriteKeys(parsed, active);
    if (!result) out.left.push({ item: keysFile, reason: "not a keys.json this migration recognises: left as it is" });
    else {
      result.left.forEach(report(keysFile));
      if (result.edits.length) {
        out.keys = result.edits.map((e) => [`${e.before.section} ${e.before.key}: ${e.before.action}`, `${e.after.section} ${e.after.key}: ${e.after.action}`]);
        out.keysFile = { file: keysFile, edits: result.edits, body: json(result.keys) };
      }
    }
  }

  const shared = readJson(join(home, "shared.json"));
  if (shared && typeof shared === "object") {
    for (const [old, now] of Object.entries(SHARED_RENAMES)) if (shared[old] != null && shared[now] == null) out.shared.push([old, now]);
  }

  for (const [old, now, follows] of PATH_RENAMES) {
    if (active[follows] && exists(join(home, old)) && !exists(join(home, now))) out.paths.push([old, now]);
  }
  return out;
}

/** Whether `p` (from plan) has anything for apply to do. Shared keys are the mods' to carry. */
export const pending = (p) => p.layouts.length > 0 || p.keysFile !== null || p.paths.length > 0;

/**
 * Applies `p` (from plan(home)): copies each path, then backs up every file it rewrites into
 * `backupDir` and writes the journal there before the first rewrite. Returns `{ done, skipped,
 * journal }` (journal: the backup folder when one was written, else null). A second run on the
 * same home finds nothing to do.
 */
export function apply(p, { home, backupDir }) {
  const done = [];
  const skipped = [...p.left];
  for (const [old, now] of p.paths) {
    try {
      mkdirSync(dirname(join(home, now)), { recursive: true });
      cpSync(join(home, old), join(home, now), { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false });
      done.push(`copied ${old} to ${now}`);
    } catch (error) { skipped.push({ item: join(home, old), reason: `not copied (${error.message})` }); }
  }
  const files = [...p.layouts, ...(p.keysFile ? [p.keysFile] : [])];
  if (files.length === 0) return { done, skipped, journal: null };
  mkdirSync(backupDir, { recursive: true });
  const journal = { version: 1, layouts: [], keys: null };
  for (const l of p.layouts) cpSync(l.file, join(backupDir, "layouts", basename(l.file)), { force: false, errorOnExist: true });
  if (p.keysFile) cpSync(p.keysFile.file, join(backupDir, "keys.json"), { force: false, errorOnExist: true });
  for (const l of p.layouts) journal.layouts.push({ file: l.file, edits: l.edits });
  if (p.keysFile) journal.keys = { file: p.keysFile.file, edits: p.keysFile.edits };
  writeAtomic(join(backupDir, JOURNAL), json(journal));
  for (const f of files) {
    writeAtomic(f.file, f.body);
    done.push(`rewrote ${f.file} (${f.edits.length} ${f.edits.length === 1 ? "edit" : "edits"}; the original is in ${backupDir})`);
  }
  return { done, skipped, journal: backupDir };
}

/** The node a journal edit names: by its id when the layout has exactly one node with it, else by its pointer. */
function nodeOf(layout, edit) {
  const owner = edit.pointer.replace(/\/(content\/mod|terminal_menu)$/, "");
  if (edit.field === "terminal_menu") return layout;
  if (edit.id != null) {
    const found = [];
    const walk = (n) => { if (n && typeof n === "object") { if (n.id === edit.id) found.push(n); (Array.isArray(n.children) ? n.children : []).forEach(walk); } };
    walk(layout);
    if (found.length === 1) return found[0];
  }
  let node = layout;
  for (const part of owner.split("/").slice(1)) node = node?.[part];
  return node;
}

/**
 * Undoes the journal in `backupDir`: each edit goes back only where the file still holds what the
 * migration wrote, so anything changed since stays. The journal is then marked reverted (a second
 * revert does nothing); the backups stay for manual recovery. Returns `{ restored, skipped }`.
 */
export function revert(backupDir) {
  const journal = readJson(join(backupDir, JOURNAL));
  const restored = [];
  const skipped = [];
  if (!journal || journal.version !== 1) return { restored, skipped };
  for (const { file, edits } of journal.layouts ?? []) {
    const layout = readJson(file);
    if (!layout || typeof layout !== "object") { skipped.push({ item: file, reason: "gone or unreadable" }); continue; }
    let changed = 0;
    for (const e of edits) {
      const node = nodeOf(layout, e);
      const holder = e.field === "content.mod" ? node?.content : node;
      const key = e.field === "content.mod" ? "mod" : "terminal_menu";
      if (holder && typeof holder === "object" && holder[key] === e.after) { holder[key] = e.before; changed += 1; }
      else skipped.push({ item: `${file}: ${e.pointer}`, reason: `no longer ${e.after}: left as it is` });
    }
    if (changed) { writeAtomic(file, json(layout)); restored.push(file); }
  }
  if (journal.keys) {
    const { file, edits } = journal.keys;
    const keys = readJson(file);
    let changed = 0;
    if (keys && typeof keys === "object") {
      for (const { before, after } of [...edits].reverse()) {
        const skip = (at, reason) => skipped.push({ item: `${file}: ${at.section} ${at.key}`, reason });
        if (keys[after.section]?.[after.key] !== after.action) { skip(after, `no longer ${after.action}: left as it is`); continue; }
        if (after.section !== before.section && keys[before.section]?.[before.key] !== undefined) { skip(before, "taken since: left as it is"); continue; }
        delete keys[after.section][after.key];
        if (after.section !== before.section && Object.keys(keys[after.section]).length === 0) delete keys[after.section];
        (keys[before.section] ??= {})[before.key] = before.action;
        changed += 1;
      }
      if (changed) { writeAtomic(file, json(keys)); restored.push(file); }
    } else skipped.push({ item: file, reason: "gone or unreadable" });
  }
  renameSync(join(backupDir, JOURNAL), join(backupDir, REVERTED));
  return { restored, skipped };
}
