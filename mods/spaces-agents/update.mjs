#!/usr/bin/env node
// Installs, updates and rolls back the pack as one unit (A14, D3, D10): one release tarball holds
// every pack mod folder plus layouts/automagik.json; it is checked against the release's
// SHA256SUMS, each folder is built in a staging folder beside mods/ (the mod's private paths
// carried in), then renamed into place, and the folders it replaced are kept together as one
// rollback set. Only folders the ownership record lists are replaced; any other folder in mods/
// is left alone, or adopted on an explicit --adopt (moved to backup/ first, never replaced).
// Node only (the CLI, and the mod through `exec("node", [<pack>/update.mjs, "check"])`, Herdr's
// runtime having no fetch); the rules over plain data live in release.js. Apache-2.0.
//
//   node update.mjs check             [--mods <dir>]   one JSON line: current, latest, update
//   node update.mjs update [--check] [--json] [--mods <dir>]   install the latest release (apply: the same, JSON)
//   node update.mjs rollback          [--mods <dir>]   swap the kept set back; one JSON line
//   node update.mjs install --from <tgz> --version <v> [--mods <dir>] [--adopt] [--setup]
//       a tarball already checked against SHA256SUMS (install.sh); one JSON line. --setup also
//       merges free keys, writes the mod manager's catalog.json, places the layout (D8) and runs
//       `herdr-app check` on every installed mod (exit 3 when one fails). Exit 4: installed, but a
//       step after the swap (the record, the kept set) did not finish; its warning says where things are.
//
// <dir> defaults to $HERDR_APP_HOME/mods (~/.config/herdr-app/mods), never this file's own
// folder, so running it from a checkout never replaces the checkout. Everything else lives in
// <app home>/automagik-herdr/, outside mods/ (a folder left inside mods/ is loaded as a mod):
//   installed-by-install.sh   the ownership record (release.js parseMarker)
//   .prev/                    the set the last install, update or rollback replaced (.prev/.pack lists it)
//   backup/<mod>-<date>/      a folder the person owned, moved aside on --adopt; never replaced
//   backup/layouts-<date>/    the rename migration's backups and journal (migrateHome.mjs)
//
// Across the rename (Group 6a, D12) an old-named folder the record lists hands its private paths
// to its am-* folder and leaves with the kept set; a person's own is left, or adopted on --adopt.
// After the folders, layouts and keys.json follow the renamed folders (migrateHome.mjs), and a
// rollback across the rename reverts those edits from the journal.
//
// Needs Node 22.7 or later: the installed pack has no package.json, so Node loads release.js
// (shared with the mod, whose loader takes .js) as ESM by detecting its syntax.

import { execFile, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync,
  statSync, symlinkSync, writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  CATALOG_URL, PACK_KEYS, PACK_LAYOUT, PACK_NAME, POCKET_LINK, V020_LAYOUT_SHA256, formatMarker, latestRelease, parseMarker, parseSums,
  pickUpdate, updatesOff,
} from "./release.js";
import { ABSORBED, RENAMES, editTarget, own } from "./migrate.js";
import { apply as applyMigration, pending, plan as migrationPlan, revert as revertMigration } from "./migrateHome.mjs";

export { CHECK_EVERY_MS, FIRST_CHECK_MS, LATEST_URL, NO_UPDATE_ENV, PACK_MODS, PACK_NAME, RETRY_MS, SUMS_NAME, compareVersions, latestRelease,
  noticeText, parseSums, pickUpdate, tarballName, updatesOff } from "./release.js";

const run = promisify(execFile);
const DOWNLOAD_TIMEOUT_MS = 120_000;
/** Catalog URLs the pack itself has written (the current one, and the `main` one an early pack wrote). */
const PACK_CATALOG_URLS = [CATALOG_URL, CATALOG_URL.replace("/dev/catalog/", "/main/catalog/")];
/** The version of a pack with no VERSION file: one installed before releases, older than any. */
export const UNRELEASED = "0.0.0";

export const appHomeOf = (env = process.env) => (env.HERDR_APP_HOME || join(homedir(), ".config", "herdr-app")).replace(/\/+$/, "");
export const defaultModsDir = (env = process.env) => join(appHomeOf(env), "mods");
/** Where the record, the kept set, backups and staging live: beside mods/, on the same file system. */
export const stateDirOf = (modsDir) => join(dirname(resolve(modsDir)), "automagik-herdr");
export const prevSetOf = (modsDir) => join(stateDirOf(modsDir), ".prev");
export const markerOf = (modsDir) => join(stateDirOf(modsDir), "installed-by-install.sh");
const backupOf = (modsDir) => join(stateDirOf(modsDir), "backup");

const isFile = (path) => { try { return statSync(path).isFile(); } catch { return false; } };
const isLink = (path) => { try { return lstatSync(path).isSymbolicLink(); } catch { return false; } };
const exists = (path) => { try { lstatSync(path); return true; } catch { return false; } };
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const today = () => new Date().toISOString().slice(0, 10);
/** A folder name the pack may own: lowercase words and dashes, never Pocket Link's. */
const packFolder = (name) => /^[a-z0-9][a-z0-9-]*$/.test(name) && name !== POCKET_LINK;
/** The other name of a renamed folder (old → am-*, am-* → old), or undefined. */
const OLD_OF = Object.fromEntries(Object.entries(RENAMES).map(([old, now]) => [now, old]));
const twinOf = (name) => (Object.hasOwn(RENAMES, name) ? RENAMES[name] : Object.hasOwn(OLD_OF, name) ? OLD_OF[name] : undefined);

/** The version a pack folder carries in its VERSION file (UNRELEASED when it has none). */
export function readVersion(packDir) {
  try { return readFileSync(join(packDir, "VERSION"), "utf8").trim() || UNRELEASED; } catch { return UNRELEASED; }
}

export const readMarker = (modsDir) => { try { return parseMarker(readFileSync(markerOf(modsDir), "utf8")); } catch { return null; } };
const readSet = (modsDir) => { try { return parseMarker(readFileSync(join(prevSetOf(modsDir), ".pack"), "utf8")); } catch { return null; } };

/** The installed pack's version: the ownership record's, else the VERSION in mods/spaces-agents. */
export const installedVersion = ({ modsDir = defaultModsDir() } = {}) => readMarker(modsDir)?.version ?? readVersion(join(modsDir, PACK_NAME));

/**
 * Checks `buf` against the SHA256SUMS line for `name` (`sums`: the file's text or parseSums' Map).
 * Returns the hex digest; throws when the name is missing or the digest differs.
 */
export function verifySha256(buf, sums, name) {
  const table = sums instanceof Map ? sums : parseSums(sums);
  const want = table.get(name);
  if (!want) throw new Error(`${name} is not in SHA256SUMS: refusing it`);
  const got = sha256(buf);
  if (got !== want) throw new Error(`${name} does not match SHA256SUMS (sha256 ${got}, expected ${want}): refusing it`);
  return got;
}

async function download(fetch, url, timeoutMs) {
  const response = await fetch(url, { headers: { "user-agent": "automagik-herdr" }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Downloads `update`'s tarball (from pickUpdate) into `dir`, verified against its SHA256SUMS before it is written; returns its path. */
export async function downloadUpdate(update, { fetch = globalThis.fetch, dir, timeoutMs = DOWNLOAD_TIMEOUT_MS } = {}) {
  const sums = (await download(fetch, update.sums.url, timeoutMs)).toString("utf8");
  const buf = await download(fetch, update.tarball.url, timeoutMs);
  verifySha256(buf, sums, update.tarball.name);
  const target = dir ?? mkdtempSync(join(tmpdir(), "automagik-herdr-"));
  mkdirSync(target, { recursive: true });
  const path = join(target, update.tarball.name);
  writeFileSync(path, buf);
  return path;
}

/**
 * What is wrong with a tarball's entries: `names` as `tar -tzf` lists them, `lines` as `tar -tvzf`
 * does (its first character is the entry's type). Every entry must be relative, have no `..`
 * segment, be a plain file or folder, and sit in a pack folder (a lowercase name, never
 * pocket-link) or be `layouts/automagik.json`. Empty when all is well.
 */
export function unsafeEntries(names, lines) {
  if (names.length === 0) return ["the tarball is empty"];
  if (names.length !== lines.length) return ["the tarball's listing does not add up (a name with a line break?)"];
  const problems = [];
  names.forEach((name, i) => {
    const segments = name.split("/");
    const type = lines[i][0];
    if (name.startsWith("/")) problems.push(`${name}: an absolute path`);
    else if (segments.includes("..")) problems.push(`${name}: a .. segment`);
    else if (segments[0] === "layouts" ? !["layouts/", PACK_LAYOUT].includes(name) : !packFolder(segments[0]) || segments.length < 2) {
      problems.push(`${name}: outside the pack's folders`);
    } else if ((type !== "-" && type !== "d") || lines[i].includes(" link to ") || lines[i].includes(" -> ")) {
      problems.push(`${name}: not a plain file or folder`);
    }
  });
  return problems;
}

async function listEntries(tgzPath) {
  const list = async (flags) => (await run("tar", [flags, tgzPath], { maxBuffer: 64 * 1024 * 1024 })).stdout.split("\n").filter((l) => l !== "");
  return unsafeEntries(await list("-tzf"), await list("-tvzf"));
}

/** Paths under `dir` (itself included) that are neither a regular file nor a folder. */
function irregularPaths(dir) {
  const found = [];
  const walk = (path) => {
    const stat = lstatSync(path);
    if (stat.isDirectory()) for (const entry of readdirSync(path)) walk(join(path, entry));
    else if (!stat.isFile()) found.push(path);
  };
  walk(dir);
  return found;
}

/** A mod's private paths, never the pack's to judge: dot entries, node_modules and what herdr-app writes itself. */
const privateName = (name) => name.startsWith(".") || name === "node_modules" || name === "gpui-kit.d.ts" || name === "jsconfig.json";

/**
 * Copies `from`'s private paths into `to` (a staged folder), the person's over the package's. A
 * symlinked `.state` stays a link to the same place; nothing is followed or flattened.
 */
export function carryPrivate(from, to) {
  if (!from || !exists(from) || isLink(from)) return 0;
  let carried = 0;
  for (const name of readdirSync(from)) {
    if (!privateName(name)) continue;
    const src = join(from, name), dst = join(to, name);
    rmSync(dst, { recursive: true, force: true });
    if (isLink(src)) symlinkSync(readlinkSync(src), dst);
    else cpSync(src, dst, { recursive: true, verbatimSymlinks: true });
    carried += 1;
  }
  return carried;
}

/** A free name under backup/: `<mod>-<date>`, then `-2`, `-3`… */
function backupName(modsDir, mod) {
  const base = `${mod}-${today()}`;
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base}-${n}`;
    if (!exists(join(backupOf(modsDir), name))) return name;
  }
}

/**
 * Renames in order, journalled: on any failure every rename already done is reversed (the old
 * folders go back where they were) and the error is thrown. `rename` is injectable for tests.
 */
function swapAll(moves, rename) {
  const done = [];
  try {
    for (const [from, to] of moves) {
      mkdirSync(dirname(to), { recursive: true });
      rename(from, to);
      done.push([from, to]);
    }
  } catch (error) {
    for (const [from, to] of done.reverse()) renameSync(to, from);
    throw error;
  }
}

/**
 * A name under `dir` nothing has: `<prefix><pid>-<random>`. Never an earlier run's leftover (a
 * reused pid), so nothing here deletes a folder it did not make.
 */
function freshPath(dir, prefix) {
  for (;;) {
    const path = join(dir, `${prefix}${process.pid}-${randomBytes(4).toString("hex")}`);
    if (!exists(path)) return path;
  }
}

/**
 * Moves the old kept set out of the way before a swap that replaces it: to `.prev-old-<pid>-<random>`,
 * renamed back by `restoreSet` when the swap fails. Null when nothing is kept yet.
 */
function setAside(modsDir) {
  if (!exists(prevSetOf(modsDir))) return null;
  const old = freshPath(stateDirOf(modsDir), ".prev-old-");
  renameSync(prevSetOf(modsDir), old);
  return old;
}
const restoreSet = (modsDir, old) => { if (old) renameSync(old, prevSetOf(modsDir)); };

/**
 * After a swap: `next` (holding the folders it moved out of mods/) becomes the kept set, then the
 * old set is removed. Never deletes `next`; a step that fails is reported in `warnings` with where
 * the folders are, so a caller never says "nothing was installed" about an install that happened.
 */
function keepSet(modsDir, next, moved, record, old, rename, warnings) {
  if (moved.length > 0) {
    try {
      writeFileSync(join(next, ".pack"), formatMarker({ version: record?.version ?? UNRELEASED, mods: moved }));
      rename(next, prevSetOf(modsDir));
    } catch (error) {
      warnings.push(`the replaced folders could not become the kept set (${error.message}): they are in ${next}`);
      try { restoreSet(modsDir, old); } catch {}
      return;
    }
  }
  if (!old) return;
  try { rmSync(old, { recursive: true, force: true }); } catch (error) {
    warnings.push(`the older kept set could not be removed (${error.message}): it is in ${old}`);
  }
}

const writeMarker = (modsDir, record) => {
  const path = markerOf(modsDir);
  writeFileSync(`${path}.tmp`, formatMarker(record));
  renameSync(`${path}.tmp`, path);
};

/**
 * v0.2.x left `spaces-agents.before-install` (the pack found at the first install) and
 * `spaces-agents.prev` in the state folder: both move to backup/, the first recorded as adopted
 * so --uninstall puts it back.
 */
function carryV1(modsDir, record, log) {
  const state = stateDirOf(modsDir);
  for (const [old, adopted] of [[`${PACK_NAME}.before-install`, true], [`${PACK_NAME}.prev`, false]]) {
    if (!exists(join(state, old))) continue;
    const name = backupName(modsDir, `${PACK_NAME}-${adopted ? "before-install" : "v0.2-prev"}`);
    mkdirSync(backupOf(modsDir), { recursive: true });
    renameSync(join(state, old), join(backupOf(modsDir), name));
    if (adopted) record.adopted.push({ mod: PACK_NAME, path: `backup/${name}` });
    log(`kept v0.2's ${old} in ${join(backupOf(modsDir), name)}`);
  }
}

/**
 * Installs the pack in `tgzPath` (a verified release tarball) into `modsDir`, as one unit. The
 * tarball's folders must be exactly the PACK_MODS of the release.js it carries, each with main.js
 * and mod.json, plain files and folders only, and its VERSION must be `version`. Per folder:
 * not there → installed; listed in the ownership record → replaced (the old copy into the kept
 * set, its private paths carried over); anyone else's → left alone, or with `adopt` moved to
 * backup/ and replaced. A link is never replaced. Returns `{ version, mods, installed, replaced,
 * left, adopted, retired, prev }` and rewrites the record.
 */
export async function applyUpdate({ tgzPath, version, modsDir = defaultModsDir(), adopt = false, log = () => {}, rename = renameSync }) {
  if (typeof version !== "string" || version === "") throw new Error("applyUpdate needs the release's version");
  const unsafe = await listEntries(resolve(tgzPath));
  if (unsafe.length > 0) throw new Error(`${tgzPath} is not a plain pack (${unsafe.slice(0, 3).join("; ")}): refusing it`);
  const state = stateDirOf(modsDir);
  mkdirSync(state, { recursive: true });
  const staging = mkdtempSync(join(state, "staging-"));
  const next = freshPath(state, ".prev-next-");
  let swapped = false;
  try {
    await run("tar", ["-xzf", resolve(tgzPath), "-C", staging]);
    const irregular = irregularPaths(staging);
    if (irregular.length > 0) throw new Error(`${tgzPath} unpacked a link or special file (${irregular[0]}): refusing it`);
    const folders = readdirSync(staging).filter((n) => n !== "layouts").sort();
    const carrier = folders.filter((n) => isFile(join(staging, n, "update.mjs")) && isFile(join(staging, n, "release.js")));
    if (carrier.length !== 1) throw new Error(`${tgzPath} holds no one folder with update.mjs and release.js: refusing it`);
    const { PACK_MODS: listed } = await import(pathToFileURL(join(staging, carrier[0], "release.js")).href);
    if (!Array.isArray(listed) || [...listed].sort().join(",") !== folders.join(",") || !listed.every(packFolder)) {
      throw new Error(`${tgzPath}'s folders (${folders.join(", ")}) are not its PACK_MODS (${listed}): refusing it`);
    }
    for (const m of folders) {
      if (!isFile(join(staging, m, "main.js")) || !isFile(join(staging, m, "mod.json"))) throw new Error(`${tgzPath}: ${m}/ has no main.js and mod.json: refusing it`);
    }
    const carried = readVersion(join(staging, carrier[0]));
    if (carried !== version) throw new Error(`${tgzPath} carries VERSION ${carried}, not ${version}: refusing it`);

    const before = readMarker(modsDir);
    const record = {
      version, mods: [], layout: before?.layout ?? null, before: before?.before ?? "none", adopted: [...(before?.adopted ?? [])],
      migrated: [...(before?.migrated ?? [])], usagemeter: before?.usagemeter ?? null,
    };
    const owned = new Set(before?.mods ?? []);
    const kept = readSet(modsDir);
    const plan = { installed: [], replaced: [], renamed: [], left: [], adopted: [], retired: [] };
    const moves = [];
    // A folder the person owns moves to backup/ (never replaced) and is recorded, so --uninstall puts it back.
    const adoptFolder = (m) => {
      const name = backupName(modsDir, m);
      moves.push([join(modsDir, m), join(backupOf(modsDir), name)]);
      plan.adopted.push({ mod: m, backup: join(backupOf(modsDir), name) });
      record.adopted.push({ mod: m, path: `backup/${name}` });
    };
    for (const m of folders) {
      const live = join(modsDir, m), fresh = join(staging, m);
      if (isLink(live)) {
        if (owned.has(m)) throw new Error(`${live} is a link (a checkout?): update it with git instead`);
        plan.left.push(m);
        continue;
      }
      if (!exists(live)) {
        // Across the rename: the old-named folder's private paths come into its am-* folder. The
        // record's leaves with the kept set (below); a person's own is left, or adopted.
        const old = own(OLD_OF, m), oldLive = old && join(modsDir, old);
        if (old && exists(oldLive) && !isLink(oldLive)) {
          if (owned.has(old)) { carryPrivate(oldLive, fresh); plan.renamed.push([old, m]); }
          else if (adopt) { carryPrivate(oldLive, fresh); adoptFolder(old); }
          else plan.left.push(old);
        } else if (kept?.mods.includes(m)) carryPrivate(join(prevSetOf(modsDir), m), fresh);
        // (A folder a rollback or --uninstall moved into the kept set comes back with its state.)
        plan.installed.push(m);
      } else if (owned.has(m)) {
        carryPrivate(live, fresh);
        moves.push([live, join(next, m)]);
        plan.replaced.push(m);
      } else if (adopt) {
        carryPrivate(live, fresh);
        adoptFolder(m);
      } else {
        plan.left.push(m);
        continue;
      }
      moves.push([fresh, live]);
      record.mods.push(m);
    }
    // A mod another pack mod took in (space-icon, markdown-browser): the record's leaves with the
    // set (below); a person's own is left, or adopted, once the mod that took it in is shipped.
    for (const [m, into] of Object.entries(ABSORBED)) {
      const live = join(modsDir, m);
      if (owned.has(m) || !exists(live) || isLink(live) || !(folders.includes(into) || folders.includes(RENAMES[into]))) continue;
      if (adopt) adoptFolder(m);
      else plan.left.push(m);
    }
    // A folder the record lists that this release no longer ships leaves mods/ with the set.
    for (const m of owned) {
      if (folders.includes(m) || !packFolder(m) || !exists(join(modsDir, m)) || isLink(join(modsDir, m))) continue;
      moves.push([join(modsDir, m), join(next, m)]);
      plan.retired.push(m);
    }
    mkdirSync(modsDir, { recursive: true });
    const keep = [...plan.replaced, ...plan.retired];
    const old = keep.length ? setAside(modsDir) : null;
    try {
      swapAll(moves, rename);
    } catch (error) {
      restoreSet(modsDir, old);
      throw error;
    }
    swapped = true;
    // From here the new folders are live: nothing below undoes them or deletes `next`, and the
    // record is written first so it always names what mods/ holds.
    const warnings = [];
    try { writeMarker(modsDir, record); } catch (error) { warnings.push(`the ownership record could not be written (${error.message})`); }
    if (before?.v1) { try { carryV1(modsDir, record, log); writeMarker(modsDir, record); } catch (error) { warnings.push(`v0.2's kept copies stay where they were (${error.message})`); } }
    keepSet(modsDir, next, keep, before, old, rename, warnings);
    for (const m of plan.left) {
      const why = Object.hasOwn(ABSORBED, m) ? "the pack's sidebar or Markdown mod does its job now" : "--adopt moves it to backup/ and installs the pack's";
      log(`left alone: mods/${m} (not installed by automagik-herdr; ${why})`);
    }
    for (const a of plan.adopted) log(`adopted mods/${a.mod}: the original is kept in ${a.backup}`);
    for (const w of warnings) log(`warning: ${w}`);
    return { version, mods: record.mods, ...plan, prev: keep.length && !exists(next) ? prevSetOf(modsDir) : null, warnings };
  } finally {
    rmSync(staging, { recursive: true, force: true });
    if (!swapped) rmSync(next, { recursive: true, force: true });
  }
}

/**
 * Swaps the kept set back in: every folder of the current set leaves mods/ for the new kept set,
 * every folder of the kept one comes back (private paths carried over), so a second rollback
 * undoes the first. Refuses, changing nothing, when a folder in the way is not the record's.
 */
export function rollback({ modsDir = defaultModsDir(), rename = renameSync, log = () => {} } = {}) {
  const set = readSet(modsDir);
  const prev = prevSetOf(modsDir);
  if (!set || set.mods.length === 0) throw new Error(`no earlier pack kept at ${prev}: nothing to roll back to`);
  const record = readMarker(modsDir) ?? { version: UNRELEASED, mods: [], layout: null, before: "none", adopted: [] };
  const owned = new Set(record.mods);
  const next = freshPath(stateDirOf(modsDir), ".prev-next-");
  const moves = [];
  const out = [];
  for (const m of set.mods) {
    const live = join(modsDir, m);
    if (!packFolder(m) || !exists(join(prev, m))) throw new Error(`the kept set lists ${m}, which is not there: nothing rolled back`);
    if (isLink(live)) throw new Error(`${live} is a link (a checkout?): roll it back with git instead`);
    if (exists(live) && !owned.has(m)) throw new Error(`mods/${m} is not this installer's: nothing rolled back`);
  }
  for (const m of set.mods) {
    const live = join(modsDir, m);
    if (exists(live)) {
      carryPrivate(live, join(prev, m));
      moves.push([live, join(next, m)]);
      out.push(m);
    } else {
      // Across the rename: the live twin's private paths go back with it (it leaves below).
      const twin = twinOf(m), twinLive = twin && join(modsDir, twin);
      if (twin && owned.has(twin) && !set.mods.includes(twin) && exists(twinLive) && !isLink(twinLive)) carryPrivate(twinLive, join(prev, m));
    }
    moves.push([join(prev, m), live]);
  }
  for (const m of owned) {
    if (set.mods.includes(m) || !packFolder(m) || !exists(join(modsDir, m)) || isLink(join(modsDir, m))) continue;
    moves.push([join(modsDir, m), join(next, m)]);
    out.push(m);
  }
  // The kept set's folders come back out of `prev`, which then holds only what stays behind
  // (.pack and anything unlisted): it is set aside, and removed only once the swap stands.
  try {
    swapAll(moves, rename);
  } catch (error) {
    rmSync(next, { recursive: true, force: true });
    throw error;
  }
  const warnings = [];
  // A folder the person had, adopted into backup/, comes back where mods/ is free once this
  // rollback drops the pack's copy of it (Group 3, D10): its own name or its renamed twin left
  // mods/; a mod the pack absorbed comes back when the set rolled back to has no am-* mod that
  // absorbed it (am-sidebar, am-markdown). Decided from the pack's sets only, never from a
  // person's folder that shares a name.
  const left = new Set(out);
  const dropped = (m) => {
    const into = own(ABSORBED, m);
    if (into) return !set.mods.includes(own(RENAMES, into) ?? into);
    const copies = [m, twinOf(m)].filter(Boolean);
    return copies.some((c) => left.has(c)) && !copies.some((c) => set.mods.includes(c));
  };
  const adopted = [];
  for (const a of record.adopted) {
    const from = join(stateDirOf(modsDir), a.path), to = join(modsDir, a.mod);
    if (exists(to) || !exists(from) || isLink(from) || !dropped(a.mod)) { adopted.push(a); continue; }
    try { renameSync(from, to); log(`put back mods/${a.mod} from ${a.path}`); } catch (error) {
      warnings.push(`mods/${a.mod} stays in ${from} (${error.message})`);
      adopted.push(a);
    }
  }
  try { writeMarker(modsDir, { ...record, version: set.version ?? UNRELEASED, mods: set.mods, adopted }); } catch (error) { warnings.push(`the ownership record could not be written (${error.message})`); }
  let old = null;
  try { old = setAside(modsDir); } catch (error) { warnings.push(`the old kept set stays in ${prev} (${error.message})`); }
  if (old || !exists(prev)) keepSet(modsDir, next, out, record, old, rename, warnings);
  else warnings.push(`the folders rolled out are in ${next}`);
  // The migration's edits whose mod left mods/ in this rollback are reverted from the journals
  // (an edit to a mod still installed stays); then the references follow the folders now in
  // place (forward again, they move again).
  const reverted = revertRefs({ modsDir, log, warnings, left: (mod) => left.has(mod) && !set.mods.includes(mod) });
  const migration = migrateRefs({ modsDir, log, warnings });
  return { pack: modsDir, prev, mods: set.mods, version: set.version, reverted: reverted.restored, migration, warnings };
}

/**
 * The rename migration after the folders (Group 6a): layouts and keys.json follow the folders
 * the record says were renamed, each rewritten file backed up into backup/layouts-<date>/ with a
 * journal the record lists (`migrated=`). A failure is a warning: the folders are already in place.
 * Returns migrateHome's `{ done, skipped, journal }`, or null when it failed.
 */
export function migrateRefs({ modsDir, log = () => {}, warnings = [] }) {
  const home = dirname(resolve(modsDir));
  try {
    const p = migrationPlan(home);
    if (!pending(p)) {
      const kept = p.left.length ? `; ${p.left.length} reference(s) stay as they are (--adopt takes the mods you kept)` : "";
      log(`rename migration: nothing to migrate${kept}`);
      return { done: [], skipped: p.left, journal: null };
    }
    if (p.shared.length) log(`shared keys move to am.* when their mod next loads: ${p.shared.map(([o]) => o).join(", ")}`);
    // The journal goes into the record before the first rewrite, so a rollback reverts whatever
    // was rewritten even if the run stops part-way; without a record, nothing is rewritten.
    const onJournal = (dir) => {
      const record = readMarker(modsDir);
      if (!record) throw new Error("there is no ownership record to list the journal in");
      writeMarker(modsDir, { ...record, migrated: [...record.migrated, `backup/${basename(dir)}`] });
    };
    const r = applyMigration(p, { backupDir: join(backupOf(modsDir), backupName(modsDir, "layouts")), onJournal });
    for (const line of r.done) log(line);
    for (const s of r.skipped) log(`left: ${s.item} (${s.reason})`);
    return r;
  } catch (error) {
    warnings.push(`layouts and keys were not migrated to the new names (${error.message}); the backups so far are in ${backupOf(modsDir)}`);
    return null;
  }
}

/**
 * Reverts, newest journal first, every edit the record's journals list whose mod is no longer in
 * mods/ or whose pack copy `left` this rollback (an edit pointing at a mod the pack still
 * installs stays valid and stays); a journal with nothing
 * left leaves the record's `migrated=` (its backups stay).
 */
export function revertRefs({ modsDir, log = () => {}, warnings = [], left = () => false }) {
  const record = readMarker(modsDir);
  const restored = [];
  // `left(mod)`: the pack's copy of that mod left mods/ in this rollback (a person's own may be back).
  const gone = (edit) => { const mod = editTarget(edit); return !mod || left(mod) || !exists(join(modsDir, mod)); };
  try {
    const still = [];
    for (const path of [...(record?.migrated ?? [])].reverse()) {
      const r = revertMigration(join(stateDirOf(modsDir), path), { due: gone });
      restored.push(...r.restored);
      if (r.remaining) still.unshift(path);
      for (const f of r.restored) log(`restored the old names in ${f}`);
      for (const s of r.skipped) log(`left: ${s.item} (${s.reason})`);
    }
    if (record && still.length !== record.migrated.length) writeMarker(modsDir, { ...record, migrated: still });
  } catch (error) {
    warnings.push(`the rename migration was not reverted (${error.message}); the originals are in ${backupOf(modsDir)}/layouts-*`);
  }
  return { restored };
}

/** A keys.json that will not parse stops the run before any folder moves. */
export function preflightKeys(appHome) {
  const path = join(appHome, "keys.json");
  if (!existsSync(path)) return;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
  } catch (error) {
    throw new Error(`${path} is unreadable (${error.message}): nothing was installed`);
  }
}

/**
 * install.sh's part after the folders land: free keys only (a key in use stays the person's),
 * the mod manager's catalog.json, the layout (added when absent; replaced only when byte-identical
 * to v0.2.x's or to the last pack's, D8; otherwise kept with a note) and `herdr-app check` on
 * every installed mod. Returns the mods whose check failed.
 */
export function setupHome({ modsDir, tgzDir, record, log = () => {}, herdrApp = "herdr-app" }) {
  const appHome = dirname(resolve(modsDir));
  const keysPath = join(appHome, "keys.json");
  const mine = existsSync(keysPath) ? JSON.parse(readFileSync(keysPath, "utf8")) : {};
  let added = 0;
  for (const [section, entries] of Object.entries(PACK_KEYS)) {
    for (const [key, action] of Object.entries(entries)) {
      const current = mine[section]?.[key];
      if (current === undefined) { (mine[section] ??= {})[key] = action; added += 1; log(`key + ${key} → ${action} (${section})`); }
      else if (current !== action) log(`key = ${key} stays ${current} (${section})`);
    }
  }
  if (added) writeFileSync(keysPath, JSON.stringify(mine, null, 2) + "\n");
  // The mod manager's catalog: it reads data/am-mods/catalog.json, then data/mod-manager/'s
  // (core.js catalogUrl). Each one there that still holds a URL the pack wrote gets the current
  // one; a URL the person set, a file it can't read or a link stays theirs. With neither, the
  // pack's goes in data/mod-manager/.
  const catalogs = ["am-mods", "mod-manager"].map((d) => join(appHome, "data", d, "catalog.json"));
  for (const file of catalogs.filter(exists)) {
    let url = null;
    try { url = isLink(file) ? "(a link)" : JSON.parse(readFileSync(file, "utf8"))?.url ?? null; } catch { url = "(unreadable)"; }
    if (url && !PACK_CATALOG_URLS.includes(url)) log(`kept your mod manager catalog (${url}) in ${file}`);
    else if (url !== CATALOG_URL) writeFileSync(file, JSON.stringify({ url: CATALOG_URL }, null, 2) + "\n");
  }
  if (!catalogs.some(exists)) {
    mkdirSync(dirname(catalogs[1]), { recursive: true });
    writeFileSync(catalogs[1], JSON.stringify({ url: CATALOG_URL }, null, 2) + "\n");
  }

  const shipped = join(tgzDir, PACK_LAYOUT);
  const ref = join(stateDirOf(modsDir), "automagik.json");
  const live = join(appHome, PACK_LAYOUT);
  if (isFile(shipped)) {
    const body = readFileSync(shipped);
    const had = isFile(live) ? readFileSync(live) : null;
    const lastPack = isFile(ref) ? readFileSync(ref) : null;
    if (!had || sha256(had) === V020_LAYOUT_SHA256 || (lastPack && had.equals(lastPack))) {
      if (!had || !had.equals(body)) {
        mkdirSync(dirname(live), { recursive: true });
        writeFileSync(live, body);
        log(had ? `replaced the automagik layout (${live}): it was the one an older release shipped` : `added the automagik layout (${live})`);
      }
    } else {
      log(`kept your automagik layout (${live}): it differs from the one v0.2 shipped; the pack's is in ${ref}`);
    }
    record.layout = !had || record.layout === "added" ? "added" : "kept";
    writeFileSync(ref, body);
    writeMarker(modsDir, record);
  }

  const failed = [];
  let haveHerdr = true;
  for (const m of record.mods) {
    if (!haveHerdr) break;
    try {
      execFileSync(herdrApp, ["check", join(modsDir, m)], { stdio: "pipe" });
      log(`check passed: ${m}`);
    } catch (error) {
      if (error.code === "ENOENT") { haveHerdr = false; log("herdr-app is not on PATH: no mod was checked"); break; }
      failed.push(m);
      log(`check FAILED: ${m}: ${String(error.stderr || error.stdout || error.message).trim().split("\n")[0]}`);
    }
  }
  return failed;
}

/** `{ current, latest, update, disabled }`: latest is the newest release's version or null; update from pickUpdate. */
export async function checkForUpdate({ fetch = globalThis.fetch, env = process.env, modsDir = defaultModsDir(env) } = {}) {
  const current = installedVersion({ modsDir });
  if (updatesOff(env)) return { current, latest: null, update: null, disabled: true };
  const release = await latestRelease({ fetch, env });
  const latest = typeof release?.tag_name === "string" ? release.tag_name.replace(/^v/, "") : null;
  return { current, latest, update: pickUpdate(current, release), disabled: false };
}

/** check, then download, verify and apply when there is an update. `{ current, latest, update, installed }`. */
export async function installUpdate({ fetch = globalThis.fetch, env = process.env, modsDir = defaultModsDir(env), log } = {}) {
  const found = await checkForUpdate({ fetch, env, modsDir });
  if (!found.update) return { ...found, installed: null };
  const dir = mkdtempSync(join(tmpdir(), "automagik-herdr-"));
  try {
    const tgzPath = await downloadUpdate(found.update, { fetch, dir });
    const installed = await applyUpdate({ tgzPath, version: found.update.version, modsDir, log });
    installed.migration = migrateRefs({ modsDir, log, warnings: installed.warnings });
    return { ...found, installed };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const USAGE = "usage: node update.mjs check | update [--check] [--json] | apply | rollback | install --from <tgz> --version <v> [--adopt] [--setup]  (each takes [--mods <dir>])";
const FLAGS = {
  check: [], apply: [], rollback: [], update: ["--check", "--json"], install: ["--from", "--version", "--adopt", "--setup"],
};
const VALUED = new Set(["--mods", "--from", "--version"]);

/** Strict arguments: an unknown command or flag, or a flag missing its value, is a usage error before anything is read. */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const usage = () => Object.assign(new Error(USAGE), { usage: true });
  if (!Object.hasOwn(FLAGS, command)) throw usage();
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag !== "--mods" && !FLAGS[command].includes(flag)) throw usage();
    if (VALUED.has(flag)) {
      const value = rest[++i];
      if (value === undefined || value === "" || value.startsWith("-")) throw usage();
      opts[flag.slice(2)] = value;
    } else opts[flag.slice(2)] = true;
  }
  if (command === "install" && !(opts.from && opts.version)) throw usage();
  return { command, opts };
}

async function main(argv) {
  const { command, opts } = parseArgs(argv);
  const modsDir = opts.mods ?? defaultModsDir();
  const log = (line) => process.stderr.write(`${line}\n`);
  if (command === "check" || (command === "update" && opts.check)) return checkForUpdate({ modsDir });
  if (command === "apply" || command === "update") {
    const r = await installUpdate({ modsDir, log: command === "update" ? log : undefined });
    if (command === "apply" || opts.json) return r;
    return { text: r.installed ? `Updated ${r.current} → ${r.installed.version}.` : `Up to date (${r.current}; latest ${r.latest ?? "none yet"}).` };
  }
  if (command === "rollback") {
    const r = rollback({ modsDir, log });
    if (r.warnings.length) process.exitCode = 4;
    return r;
  }
  // install.sh: the tarball it downloaded and checked with shasum, through applyUpdate's checks.
  const appHome = dirname(resolve(modsDir));
  if (opts.setup) preflightKeys(appHome);
  const installed = await applyUpdate({ tgzPath: opts.from, version: opts.version, modsDir, adopt: Boolean(opts.adopt), log });
  // Exit 4: installed, but a step after the swap did not finish (its warning says what and where).
  const done = () => { if (installed.warnings.length) process.exitCode = 4; };
  if (!opts.setup) {
    installed.migration = migrateRefs({ modsDir, log, warnings: installed.warnings });
    done();
    return { installed };
  }
  const tgzDir = mkdtempSync(join(tmpdir(), "automagik-herdr-layout-"));
  try {
    await run("tar", ["-xzf", resolve(opts.from), "-C", tgzDir, PACK_LAYOUT]).catch(() => {});
    const failed = setupHome({ modsDir, tgzDir, record: readMarker(modsDir), log });
    // After setupHome: the pack's own layout is placed first, so only the person's are migrated.
    installed.migration = migrateRefs({ modsDir, log, warnings: installed.warnings });
    done();
    if (failed.length && !process.exitCode) process.exitCode = 3;
    return { installed, checkFailed: failed };
  } finally {
    rmSync(tgzDir, { recursive: true, force: true });
  }
}

const invoked = (() => { try { return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (invoked) {
  try {
    const out = await main(process.argv.slice(2));
    console.log(typeof out?.text === "string" ? out.text : JSON.stringify(out));
  } catch (error) {
    console.log(JSON.stringify({ error: String(error?.message ?? error) }));
    process.exit(error?.usage ? 2 : 1);
  }
}
