#!/usr/bin/env node
// Updates the installed pack from Automagik Herdr's GitHub releases (A14): reads the latest
// release, downloads its tarball, checks it against the release's SHA256SUMS and swaps it in,
// keeping the replaced pack for one rollback. Node only (the CLI, and the mod through
// `exec("node", [<pack>/update.mjs, "check"])`, Herdr's runtime having no fetch); the rules
// over plain data live in release.js. Apache-2.0.
//
//   node update.mjs check      [--mods <dir>] [--name <folder>]   one JSON line: current, latest, update
//   node update.mjs apply      [--mods <dir>] [--name <folder>]   download, verify, swap; one JSON line
//   node update.mjs rollback   [--mods <dir>] [--name <folder>]   swap the kept pack back; one JSON line
//
// <dir> defaults to $HERDR_APP_HOME/mods (~/.config/herdr-app/mods), never this file's own
// folder, so running it from a checkout never replaces the checkout. The replaced pack and the
// extraction folder live in <app home>/automagik-herdr/, outside mods/: a folder left inside
// mods/ is loaded by Herdr as a second mod (README, Install).
//
// Needs Node 22.7 or later (20.19 on Node 20): the installed pack has no package.json, so Node
// loads release.js (shared with the mod, whose loader takes .js) as ESM by detecting its syntax,
// as Herdr's own insights mod does with analytics.js.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { PACK_NAME, latestRelease, parseSums, pickUpdate, updatesOff } from "./release.js";

export { CHECK_EVERY_MS, FIRST_CHECK_MS, LATEST_URL, NO_UPDATE_ENV, PACK_NAME, RETRY_MS, SUMS_NAME, compareVersions, latestRelease,
  noticeText, parseSums, pickUpdate, tarballName, updatesOff } from "./release.js";

const run = promisify(execFile);
const DOWNLOAD_TIMEOUT_MS = 120_000;
/** The version of a pack with no VERSION file: one installed before releases, older than any. */
export const UNRELEASED = "0.0.0";

export const appHomeOf = (env = process.env) => (env.HERDR_APP_HOME || join(homedir(), ".config", "herdr-app")).replace(/\/+$/, "");
export const defaultModsDir = (env = process.env) => join(appHomeOf(env), "mods");
/** Where the kept pack and the extraction folder live: beside mods/, on the same file system. */
export const stateDirOf = (modsDir) => join(dirname(resolve(modsDir)), "automagik-herdr");
export const prevDirOf = (modsDir, name = PACK_NAME) => join(stateDirOf(modsDir), `${name}.prev`);

const isFile = (path) => { try { return statSync(path).isFile(); } catch { return false; } };
const isLink = (path) => { try { return lstatSync(path).isSymbolicLink(); } catch { return false; } };

/** The version a pack folder carries in its VERSION file (UNRELEASED when it has none). */
export function readVersion(packDir) {
  try { return readFileSync(join(packDir, "VERSION"), "utf8").trim() || UNRELEASED; } catch { return UNRELEASED; }
}

export const installedVersion = ({ modsDir = defaultModsDir(), name = PACK_NAME } = {}) => readVersion(join(modsDir, name));

/**
 * Checks `buf` against the SHA256SUMS line for `name` (`sums`: the file's text or parseSums' Map).
 * Returns the hex digest; throws when the name is missing or the digest differs.
 */
export function verifySha256(buf, sums, name) {
  const table = sums instanceof Map ? sums : parseSums(sums);
  const want = table.get(name);
  if (!want) throw new Error(`${name} is not in SHA256SUMS: refusing it`);
  const got = createHash("sha256").update(buf).digest("hex");
  if (got !== want) throw new Error(`${name} does not match SHA256SUMS (sha256 ${got}, expected ${want}): refusing it`);
  return got;
}

async function download(fetch, url, timeoutMs) {
  const response = await fetch(url, { headers: { "user-agent": "automagik-herdr" }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Downloads `update`'s tarball (from pickUpdate) into `dir`, verified against its SHA256SUMS; returns its path. */
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
 * does (its first character is the entry's type). Every entry must sit under `spaces-agents/`,
 * be relative, have no `..` segment and be a plain file or folder. Empty when all is well.
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
    else if (segments[0] !== PACK_NAME) problems.push(`${name}: outside ${PACK_NAME}/`);
    else if ((type !== "-" && type !== "d") || lines[i].includes(" link to ") || lines[i].includes(" -> ")) {
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

/**
 * Installs the pack in `tgzPath` (a verified release tarball holding `spaces-agents/`) as
 * `<modsDir>/<name>`: extracts it beside mods/, refuses it without main.js and mod.json, moves
 * the installed pack to `<app home>/automagik-herdr/<name>.prev` (replacing an older one) and
 * the new one in. Refuses a pack that is a link (a checkout: update it with git), a tarball with
 * an entry outside `spaces-agents/`, absolute, with `..` or not a plain file or folder (listed
 * before extracting, checked again after), and one whose VERSION is not `version`. Returns `{ pack, prev, version }` (`prev` null when nothing was installed before).
 */
export async function applyUpdate({ tgzPath, version, modsDir = defaultModsDir(), name = PACK_NAME }) {
  if (typeof version !== "string" || version === "") throw new Error("applyUpdate needs the release's version");
  const pack = join(modsDir, name);
  const unsafe = await listEntries(resolve(tgzPath));
  if (unsafe.length > 0) throw new Error(`${tgzPath} is not a plain pack (${unsafe.slice(0, 3).join("; ")}): refusing it`);
  if (isLink(pack)) throw new Error(`${pack} is a link (a checkout?): update it with git instead`);
  const state = stateDirOf(modsDir);
  mkdirSync(state, { recursive: true });
  const staging = mkdtempSync(join(state, "staging-"));
  try {
    await run("tar", ["-xzf", resolve(tgzPath), "-C", staging]);
    const fresh = join(staging, PACK_NAME);
    if (isLink(fresh) || !isFile(join(fresh, "main.js")) || !isFile(join(fresh, "mod.json"))) {
      throw new Error(`${tgzPath} holds no ${PACK_NAME}/ with main.js and mod.json: refusing it`);
    }
    const irregular = irregularPaths(fresh);
    if (irregular.length > 0) throw new Error(`${tgzPath} unpacked a link or special file (${irregular[0]}): refusing it`);
    const carried = readVersion(fresh);
    if (carried !== version) throw new Error(`${tgzPath} carries VERSION ${carried}, not ${version}: refusing it`);
    mkdirSync(modsDir, { recursive: true });
    const prev = prevDirOf(modsDir, name);
    const had = existsSync(pack);
    if (had) {
      rmSync(prev, { recursive: true, force: true });
      renameSync(pack, prev);
    }
    try {
      renameSync(fresh, pack);
    } catch (error) {
      if (had) renameSync(prev, pack);
      throw error;
    }
    return { pack, prev: had ? prev : null, version: readVersion(pack) };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * Swaps the kept pack back in; the one it replaces becomes the kept one, so a second rollback
 * undoes the first. Returns `{ pack, prev, version }`.
 */
export function rollback({ modsDir = defaultModsDir(), name = PACK_NAME } = {}) {
  const pack = join(modsDir, name);
  const prev = prevDirOf(modsDir, name);
  if (!isFile(join(prev, "main.js"))) throw new Error(`no earlier pack kept at ${prev}: nothing to roll back to`);
  if (isLink(pack)) throw new Error(`${pack} is a link (a checkout?): roll it back with git instead`);
  const swap = join(stateDirOf(modsDir), `${name}.swap-${process.pid}`);
  const had = existsSync(pack);
  if (had) renameSync(pack, swap);
  try {
    renameSync(prev, pack);
  } catch (error) {
    if (had) renameSync(swap, pack);
    throw error;
  }
  if (had) renameSync(swap, prev);
  return { pack, prev: had ? prev : null, version: readVersion(pack) };
}

/** `{ current, latest, update, disabled }`: latest is the newest release's version or null; update from pickUpdate. */
export async function checkForUpdate({ fetch = globalThis.fetch, env = process.env, modsDir = defaultModsDir(env), name = PACK_NAME } = {}) {
  const current = installedVersion({ modsDir, name });
  if (updatesOff(env)) return { current, latest: null, update: null, disabled: true };
  const release = await latestRelease({ fetch, env });
  const latest = typeof release?.tag_name === "string" ? release.tag_name.replace(/^v/, "") : null;
  return { current, latest, update: pickUpdate(current, release), disabled: false };
}

/** check, then download, verify and apply when there is an update. `{ current, latest, update, installed }`. */
export async function installUpdate({ fetch = globalThis.fetch, env = process.env, modsDir = defaultModsDir(env), name = PACK_NAME } = {}) {
  const found = await checkForUpdate({ fetch, env, modsDir, name });
  if (!found.update) return { ...found, installed: null };
  const dir = mkdtempSync(join(tmpdir(), "automagik-herdr-"));
  try {
    const tgzPath = await downloadUpdate(found.update, { fetch, dir });
    return { ...found, installed: await applyUpdate({ tgzPath, version: found.update.version, modsDir, name }) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main(argv) {
  const [command, ...rest] = argv;
  const opt = (flag) => { const i = rest.indexOf(flag); return i >= 0 ? rest[i + 1] : undefined; };
  const where = { modsDir: opt("--mods") ?? defaultModsDir(), name: opt("--name") ?? PACK_NAME };
  if (command === "check") return checkForUpdate(where);
  if (command === "apply") return installUpdate(where);
  if (command === "rollback") return rollback(where);
  throw Object.assign(new Error("usage: node update.mjs check | apply | rollback [--mods <dir>] [--name <folder>]"), { usage: true });
}

const invoked = (() => { try { return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (invoked) {
  try {
    console.log(JSON.stringify(await main(process.argv.slice(2))));
  } catch (error) {
    console.log(JSON.stringify({ error: String(error?.message ?? error) }));
    process.exit(error?.usage ? 2 : 1);
  }
}
