// The rename migration on an app home (Group 6a, D12): layouts, keys.json and app-home paths
// follow the folders the ownership record says the pack renamed. Every file it rewrites is
// copied into a dated backup folder first, and `journal.json` there lists each edit (before and
// after), which `revert` reads to undo exactly those edits and nothing the person changed since.
// Backups: <backupDir>/layouts/<name>.json and <backupDir>/keys.json, the files as they were.
// It writes only <home>/layouts/*.json and <home>/keys.json, never through a link (a link is
// the person's: reported and left), never shared.json (Herdr owns it: the mods' shims carry the
// shared keys) and never a folder in mods/ (update.mjs moves those). Node only; the rules live
// in migrate.js. Apache-2.0.

import { randomBytes } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseMarker } from "./release.js";
import { ABSORBED, PATH_RENAMES, RENAMES, SHARED_RENAMES, activeRenames, own, rewriteKeys, rewriteLayout } from "./migrate.js";

export { KEY_RENAMES, RENAMES } from "./migrate.js";

const lstat = (path) => { try { return lstatSync(path); } catch { return null; } };
const exists = (path) => lstat(path) !== null;
const isLink = (path) => Boolean(lstat(path)?.isSymbolicLink());
const readJson = (path) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return undefined; } };
/** Written beside `path` under a fresh name, created exclusively (never through a planted file or link), then renamed over it. */
function writeAtomic(path, text) {
  const tmp = `${path}.am-tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  writeFileSync(tmp, text, { flag: "wx" });
  try { renameSync(tmp, path); } catch (error) { rmSync(tmp, { force: true }); throw error; }
}
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const why = (error) => String(error?.message ?? error).split("\n")[0];
export const JOURNAL = "journal.json";
const REVERTED = "journal.reverted.json";

/** The only files the migration writes: keys.json and a layout directly in layouts/, neither a link. */
function writable(home, file) {
  if (typeof file !== "string") return false;
  const path = resolve(file);
  const inLayouts = dirname(path) === join(home, "layouts") && path.endsWith(".json") && !isLink(join(home, "layouts"));
  return (path === join(home, "keys.json") || inLayouts) && !isLink(path);
}

/**
 * What the migration would do on app home `home`, from what is on disk and the ownership record:
 * `{ home, folders, layouts, keys, shared, paths, left }`.
 * - folders: [old, new] for record-listed old folders still in mods/ (update.mjs moves them when a
 *   release ships the new name; the migration itself never moves a mod);
 * - layouts: `{file, edits, body}` per layout naming a renamed folder;
 * - keys: [before, after] actions and sections in keys.json (`edits` and `body` on `keysFile`);
 * - shared: [old, new] keys shared.json still has only under the old name (read, never written:
 *   the mods copy them on their first load);
 * - paths: [old, new] app-home paths to copy;
 * - left: `{item, reason}` for references not rewritten (a kept folder, a link, an unknown shape).
 */
export function plan(home) {
  home = resolve(home);
  const modsDir = join(home, "mods");
  let record = null;
  try { record = parseMarker(readFileSync(join(home, "automagik-herdr", "installed-by-install.sh"), "utf8")); } catch {}
  const owned = new Set(record?.mods ?? []);
  const present = (name) => exists(join(modsDir, name));
  const { active } = activeRenames(owned, present);
  const out = { home, folders: [], layouts: [], keys: [], keysFile: null, shared: [], paths: [], left: [] };
  // A reference is reported only when its folder is someone else's or gone with no successor;
  // one naming a pack folder not renamed yet is simply not due.
  const report = (file) => ({ mod, ref }) => {
    if (owned.has(mod) && present(mod)) return;
    const into = own(ABSORBED, mod);
    const reason = present(mod) ? `mods/${mod} is not the pack's (--adopt takes it)`
      : into ? `${mod} is part of ${own(active, mod) ?? into} now, so this shows nothing: you can remove it`
        : `no installed mod replaces ${mod}`;
    out.left.push({ item: `${file}: ${ref}`, reason });
  };
  const linked = (file) => out.left.push({ item: file, reason: "a link (the person's own): left as it is" });

  for (const [old, now] of Object.entries(RENAMES)) {
    if (owned.has(old) && present(old) && !present(now)) out.folders.push([old, now]);
  }

  const layoutsDir = join(home, "layouts");
  let names = [];
  if (isLink(layoutsDir)) linked(layoutsDir);
  else try { names = readdirSync(layoutsDir).filter((n) => n.endsWith(".json")).sort(); } catch {}
  for (const name of names) {
    const file = join(layoutsDir, name);
    if (isLink(file)) { linked(file); continue; }
    try {
      const parsed = readJson(file);
      const result = parsed === undefined ? null : rewriteLayout(parsed, active);
      if (!result) { out.left.push({ item: file, reason: "not a layout this migration recognises: left as it is" }); continue; }
      result.left.forEach(report(file));
      if (result.edits.length) out.layouts.push({ file, edits: result.edits, body: json(result.layout) });
    } catch (error) {
      out.left.push({ item: file, reason: `could not be read as a layout (${why(error)}): left as it is` });
    }
  }

  const keysFile = join(home, "keys.json");
  if (isLink(keysFile)) linked(keysFile);
  else if (existsSync(keysFile)) {
    try {
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
    } catch (error) {
      out.left.push({ item: keysFile, reason: `could not be read (${why(error)}): left as it is` });
    }
  }

  const shared = readJson(join(home, "shared.json"));
  if (shared && typeof shared === "object") {
    for (const [old, now] of Object.entries(SHARED_RENAMES)) if (own(shared, old) != null && own(shared, now) == null) out.shared.push([old, now]);
  }

  for (const [old, now, follows] of PATH_RENAMES) {
    if (own(active, follows) && exists(join(home, old)) && !exists(join(home, now))) out.paths.push([old, now]);
  }
  return out;
}

/** Whether `p` (from plan) has anything for apply to do. Shared keys are the mods' to carry. */
export const pending = (p) => p.layouts.length > 0 || p.keysFile !== null || p.paths.length > 0;

/**
 * Applies `p` (from plan(home)): copies each path, then backs up every file it rewrites into
 * `backupDir` (a new folder, under a backup/ that is no link) and writes the journal there.
 * `onJournal(backupDir)` runs next, before the first rewrite (update.mjs records the journal
 * in the ownership record there; if it throws, nothing is rewritten). A file that fails to
 * rewrite is reported and the rest carry on. Returns `{ done, skipped, journal }` (journal: the
 * backup folder when one was written, else null). A second run on the same home does nothing.
 */
export function apply(p, { backupDir, onJournal = () => {} }) {
  const { home } = p;
  const done = [];
  const skipped = [...p.left];
  for (const [old, now] of p.paths) {
    try {
      mkdirSync(dirname(join(home, now)), { recursive: true });
      cpSync(join(home, old), join(home, now), { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false });
      done.push(`copied ${old} to ${now}`);
    } catch (error) { skipped.push({ item: join(home, old), reason: `not copied (${why(error)})` }); }
  }
  const files = [...p.layouts, ...(p.keysFile ? [p.keysFile] : [])].filter((f) => {
    if (writable(home, f.file)) return true;
    skipped.push({ item: f.file, reason: "a link, or outside layouts/ and keys.json: left as it is" });
    return false;
  });
  if (files.length === 0) return { done, skipped, journal: null };
  if (isLink(dirname(backupDir)) || exists(backupDir)) throw new Error(`${backupDir} is taken, or its folder is a link: nothing rewritten`);
  mkdirSync(dirname(backupDir), { recursive: true });
  mkdirSync(join(backupDir, "layouts"), { recursive: true });
  const journal = { version: 1, layouts: [], keys: null };
  for (const f of files) {
    const keys = f === p.keysFile;
    cpSync(f.file, keys ? join(backupDir, "keys.json") : join(backupDir, "layouts", basename(f.file)), { force: false, errorOnExist: true });
    if (keys) journal.keys = { file: f.file, edits: f.edits };
    else journal.layouts.push({ file: f.file, edits: f.edits });
  }
  writeAtomic(join(backupDir, JOURNAL), json(journal));
  onJournal(backupDir);
  for (const f of files) {
    try {
      if (!writable(home, f.file)) throw new Error("it became a link");
      writeAtomic(f.file, f.body);
      done.push(`rewrote ${f.file} (${f.edits.length} ${f.edits.length === 1 ? "edit" : "edits"}; the original is in ${backupDir})`);
    } catch (error) {
      skipped.push({ item: f.file, reason: `not rewritten (${why(error)}): left as it was` });
    }
  }
  return { done, skipped, journal: backupDir };
}

/** The node a journal edit names: by its id when the layout has exactly one node with it, else by its pointer. */
function nodeOf(layout, edit) {
  if (edit.field === "terminal_menu") return layout;
  if (edit.id != null) {
    const found = [];
    const walk = (n) => { if (n && typeof n === "object") { if (n.id === edit.id) found.push(n); (Array.isArray(n.children) ? n.children : []).forEach(walk); } };
    walk(layout);
    if (found.length === 1) return found[0];
  }
  let node = layout;
  for (const part of String(edit.pointer).replace(/\/content\/mod$/, "").split("/").slice(1)) node = Object.hasOwn(Object(node), part) ? node[part] : undefined;
  return node;
}

const plainName = (s) => typeof s === "string" && s !== "__proto__";

/**
 * Undoes the journal in `backupDir` (under `<home>/automagik-herdr/backup/`; neither may be a
 * link). `due(edit)` picks the edits to undo (update.mjs: those whose mod left mods/); the rest
 * stay in the journal. An edit goes back only where the file still holds what the migration
 * wrote, so anything changed since stays, and only in `<home>/layouts/*.json` and
 * `<home>/keys.json` (any other path a journal names is skipped). A journal with nothing left
 * is marked reverted (a second revert does nothing); the backups stay for manual recovery.
 * Returns `{ restored, skipped, remaining }` (remaining: edits still in the journal).
 */
export function revert(backupDir, { home = dirname(dirname(dirname(resolve(backupDir)))), due = () => true } = {}) {
  home = resolve(home);
  const restored = [];
  const skipped = [];
  const kept = { layouts: [], keys: [] };
  const journalPath = join(backupDir, JOURNAL);
  if (isLink(dirname(resolve(backupDir))) || isLink(backupDir) || isLink(journalPath)) {
    skipped.push({ item: backupDir, reason: "a link: its journal is not read" });
    return { restored, skipped, remaining: 0 };
  }
  const journal = readJson(journalPath);
  if (!journal || journal.version !== 1) return { restored, skipped, remaining: 0 };
  const refuse = (file) => skipped.push({ item: String(file), reason: "outside this app home's layouts/ and keys.json, or a link: left as it is" });
  for (const { file, edits } of Array.isArray(journal.layouts) ? journal.layouts : []) {
    if (!writable(home, file)) { refuse(file); continue; }
    try {
      const layout = readJson(file);
      if (!layout || typeof layout !== "object") { skipped.push({ item: file, reason: "gone or unreadable" }); continue; }
      let changed = 0;
      const stay = [];
      for (const e of Array.isArray(edits) ? edits : []) {
        if (typeof e?.before !== "string" || typeof e.after !== "string") continue;
        if (!due(e)) { stay.push(e); continue; }
        const node = nodeOf(layout, e);
        const holder = e.field === "content.mod" ? node?.content : node;
        const key = e.field === "content.mod" ? "mod" : "terminal_menu";
        if (holder && typeof holder === "object" && holder[key] === e.after) { holder[key] = e.before; changed += 1; }
        else skipped.push({ item: `${file}: ${e.pointer}`, reason: `no longer ${e.after}: left as it is` });
      }
      if (changed) { writeAtomic(file, json(layout)); restored.push(file); }
      if (stay.length) kept.layouts.push({ file, edits: stay });
    } catch (error) {
      // Not written: every edit of this file stays in the journal for the next revert.
      skipped.push({ item: file, reason: `not restored (${why(error)})` });
      kept.layouts.push({ file, edits });
    }
  }
  if (journal.keys) {
    const { file, edits } = journal.keys;
    if (!writable(home, file)) refuse(file);
    else {
      try {
        const keys = readJson(file);
        let changed = 0;
        if (keys && typeof keys === "object") {
          for (const edit of [...(Array.isArray(edits) ? edits : [])].reverse()) {
            const { before, after } = edit ?? {};
            if (![before?.section, before?.key, before?.action, after?.section, after?.key, after?.action].every(plainName)) continue;
            if (!due(edit)) { kept.keys.unshift(edit); continue; }
            const skip = (at, reason) => skipped.push({ item: `${file}: ${at.section} ${at.key}`, reason });
            if (own(own(keys, after.section) ?? {}, after.key) !== after.action) { skip(after, `no longer ${after.action}: left as it is`); continue; }
            if (after.section !== before.section && own(own(keys, before.section) ?? {}, before.key) !== undefined) { skip(before, "taken since: left as it is"); continue; }
            delete keys[after.section][after.key];
            if (after.section !== before.section && Object.keys(keys[after.section]).length === 0) delete keys[after.section];
            if (!Object.hasOwn(keys, before.section)) keys[before.section] = {};
            keys[before.section][before.key] = before.action;
            changed += 1;
          }
          if (changed) { writeAtomic(file, json(keys)); restored.push(file); }
        } else skipped.push({ item: file, reason: "gone or unreadable" });
      } catch (error) {
        skipped.push({ item: file, reason: `not restored (${why(error)})` });
        kept.keys = [...edits];
      }
    }
  }
  const remaining = kept.layouts.reduce((n, l) => n + l.edits.length, 0) + kept.keys.length;
  if (remaining) writeAtomic(journalPath, json({ ...journal, layouts: kept.layouts, keys: kept.keys.length ? { ...journal.keys, edits: kept.keys } : null }));
  else renameSync(journalPath, join(backupDir, REVERTED));
  return { restored, skipped, remaining };
}
