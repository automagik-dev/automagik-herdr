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
//       `herdr-app check` on every installed mod (exit 3 when one fails).
//
// <dir> defaults to $HERDR_APP_HOME/mods (~/.config/herdr-app/mods), never this file's own
// folder, so running it from a checkout never replaces the checkout. Everything else lives in
// <app home>/automagik-herdr/, outside mods/ (a folder left inside mods/ is loaded as a mod):
//   installed-by-install.sh   the ownership record (release.js parseMarker)
//   .prev/                    the set the last install, update or rollback replaced (.prev/.pack lists it)
//   backup/<mod>-<date>/      a folder the person owned, moved aside on --adopt; never replaced
//
// Needs Node 22.7 or later: the installed pack has no package.json, so Node loads release.js
// (shared with the mod, whose loader takes .js) as ESM by detecting its syntax.

import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync,
  statSync, symlinkSync, writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  CATALOG_URL, PACK_KEYS, PACK_LAYOUT, PACK_NAME, POCKET_LINK, V020_LAYOUT_SHA256, formatMarker, latestRelease, parseMarker, parseSums,
  pickUpdate, updatesOff,
} from "./release.js";

export { CHECK_EVERY_MS, FIRST_CHECK_MS, LATEST_URL, NO_UPDATE_ENV, PACK_MODS, PACK_NAME, RETRY_MS, SUMS_NAME, compareVersions, latestRelease,
  noticeText, parseSums, pickUpdate, tarballName, updatesOff } from "./release.js";

const run = promisify(execFile);
const DOWNLOAD_TIMEOUT_MS = 120_000;
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

/** The new kept set: `moved` (name → folder now under `next`) recorded in `.pack`, replacing the old set. */
function keepSet(modsDir, next, moved, record) {
  if (moved.length === 0) return void rmSync(next, { recursive: true, force: true });
  writeFileSync(join(next, ".pack"), formatMarker({ version: record?.version ?? UNRELEASED, mods: moved }));
  rmSync(prevSetOf(modsDir), { recursive: true, force: true });
  renameSync(next, prevSetOf(modsDir));
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
  const next = join(state, `.prev-next-${process.pid}`);
  rmSync(next, { recursive: true, force: true });
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
    const record = { version, mods: [], layout: before?.layout ?? null, before: before?.before ?? "none", adopted: [...(before?.adopted ?? [])] };
    const owned = new Set(before?.mods ?? []);
    const plan = { installed: [], replaced: [], left: [], adopted: [], retired: [] };
    const moves = [];
    for (const m of folders) {
      const live = join(modsDir, m), fresh = join(staging, m);
      if (isLink(live)) {
        if (owned.has(m)) throw new Error(`${live} is a link (a checkout?): update it with git instead`);
        plan.left.push(m);
        continue;
      }
      if (!exists(live)) plan.installed.push(m);
      else if (owned.has(m)) {
        carryPrivate(live, fresh);
        moves.push([live, join(next, m)]);
        plan.replaced.push(m);
      } else if (adopt) {
        carryPrivate(live, fresh);
        const name = backupName(modsDir, m);
        moves.push([live, join(backupOf(modsDir), name)]);
        plan.adopted.push({ mod: m, backup: join(backupOf(modsDir), name) });
        record.adopted.push({ mod: m, path: `backup/${name}` });
      } else {
        plan.left.push(m);
        continue;
      }
      moves.push([fresh, live]);
      record.mods.push(m);
    }
    // A folder the record lists that this release no longer ships leaves mods/ with the set.
    for (const m of owned) {
      if (folders.includes(m) || !packFolder(m) || !exists(join(modsDir, m)) || isLink(join(modsDir, m))) continue;
      moves.push([join(modsDir, m), join(next, m)]);
      plan.retired.push(m);
    }
    mkdirSync(modsDir, { recursive: true });
    swapAll(moves, rename);
    if (before?.v1) carryV1(modsDir, record, log);
    keepSet(modsDir, next, [...plan.replaced, ...plan.retired], before);
    writeMarker(modsDir, record);
    for (const m of plan.left) log(`left alone: mods/${m} (not installed by automagik-herdr; --adopt moves it to backup/ and installs the pack's)`);
    for (const a of plan.adopted) log(`adopted mods/${a.mod}: the original is kept in ${a.backup}`);
    return { version, mods: record.mods, ...plan, prev: plan.replaced.length + plan.retired.length ? prevSetOf(modsDir) : null };
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(next, { recursive: true, force: true });
  }
}

/**
 * Swaps the kept set back in: every folder of the current set leaves mods/ for the new kept set,
 * every folder of the kept one comes back (private paths carried over), so a second rollback
 * undoes the first. Refuses, changing nothing, when a folder in the way is not the record's.
 */
export function rollback({ modsDir = defaultModsDir(), rename = renameSync } = {}) {
  const set = readSet(modsDir);
  const prev = prevSetOf(modsDir);
  if (!set || set.mods.length === 0) throw new Error(`no earlier pack kept at ${prev}: nothing to roll back to`);
  const record = readMarker(modsDir) ?? { version: UNRELEASED, mods: [], layout: null, before: "none", adopted: [] };
  const owned = new Set(record.mods);
  const next = join(stateDirOf(modsDir), `.prev-next-${process.pid}`);
  rmSync(next, { recursive: true, force: true });
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
    }
    moves.push([join(prev, m), live]);
  }
  for (const m of owned) {
    if (set.mods.includes(m) || !packFolder(m) || !exists(join(modsDir, m)) || isLink(join(modsDir, m))) continue;
    moves.push([join(modsDir, m), join(next, m)]);
    out.push(m);
  }
  try {
    swapAll(moves, rename);
  } catch (error) {
    rmSync(next, { recursive: true, force: true });
    throw error;
  }
  keepSet(modsDir, next, out, record);
  writeMarker(modsDir, { ...record, version: set.version ?? UNRELEASED, mods: set.mods });
  return { pack: modsDir, prev, mods: set.mods, version: set.version };
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
  mkdirSync(join(appHome, "data", "mod-manager"), { recursive: true });
  writeFileSync(join(appHome, "data", "mod-manager", "catalog.json"), JSON.stringify({ url: CATALOG_URL }, null, 2) + "\n");

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
    return { ...found, installed: await applyUpdate({ tgzPath, version: found.update.version, modsDir, log }) };
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
  if (command === "rollback") return rollback({ modsDir });
  // install.sh: the tarball it downloaded and checked with shasum, through applyUpdate's checks.
  const appHome = dirname(resolve(modsDir));
  if (opts.setup) preflightKeys(appHome);
  const installed = await applyUpdate({ tgzPath: opts.from, version: opts.version, modsDir, adopt: Boolean(opts.adopt), log });
  if (!opts.setup) return { installed };
  const tgzDir = mkdtempSync(join(tmpdir(), "automagik-herdr-layout-"));
  try {
    await run("tar", ["-xzf", resolve(opts.from), "-C", tgzDir, PACK_LAYOUT]).catch(() => {});
    const failed = setupHome({ modsDir, tgzDir, record: readMarker(modsDir), log });
    if (failed.length) process.exitCode = 3;
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
