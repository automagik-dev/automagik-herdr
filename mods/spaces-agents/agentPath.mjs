// The PATH an agent worker starts with, made able to run the agent's own interpreter.
//
// An npm agent such as codex is a `#!/usr/bin/env node` script: nvm and Homebrew link
// `<prefix>/bin/codex` to `<prefix>/lib/node_modules/<pkg>/bin/codex.js`, next to
// `<prefix>/bin/node`. A pane whose PATH reaches the agent (or a link to it) but not node
// starts it into `env: node: No such file or directory`. interpreterPath reads the agent's
// shebang and, when its `env` interpreter (node or bun) isn't on the PATH the worker gets,
// puts the folder of one it finds first. It never removes anything from PATH and never
// changes it when the interpreter is already there. Only absolute folders that are safe (not
// world-writable, owned by this user or root), holding a safe interpreter file, are run or
// put on PATH. Not loaded by Herdr (node: imports); the CLI and the tests share it. Apache-2.0.
import { execFileSync } from "node:child_process";
import { accessSync, closeSync, constants, lstatSync, openSync, readdirSync, readlinkSync, readSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

const executable = (p) => { try { accessSync(p, constants.X_OK); return true; } catch { return false; } };
/** PATH's folders the CLI can judge: absolute ones (a relative one depends on the worker's cwd). */
const dirsOf = (path) => String(path ?? "").split(":").filter((d) => d && isAbsolute(d));
const UID = typeof process.getuid === "function" ? process.getuid() : null;

/** Whether `p` exists, isn't world-writable, and is owned by this user or root. */
export function safe(p) {
  try {
    const st = statSync(p);
    return (st.mode & 0o002) === 0 && (UID === null || st.uid === UID || st.uid === 0);
  } catch { return false; }
}

/** The file `program` names: itself when it has a slash, else the first executable on `path`. */
export function whichOn(program, path) {
  if (program.includes("/")) return isAbsolute(program) && executable(program) ? program : null;
  for (const dir of dirsOf(path)) if (executable(join(dir, program))) return join(dir, program);
  return null;
}

/** env's options that take the next word as their argument (`-u NAME`, `-C dir`, `-P path`). */
const ENV_ARG_OPTIONS = new Set(["-u", "-C", "-P", "--unset", "--chdir"]);

/**
 * The interpreter a script's first line runs through `env`: `node` for `#!/usr/bin/env node`
 * (and `env -S node --flag`, `env -i VAR=x node`, `env -u NAME node`, a CRLF line), else null
 * (a binary, a direct `#!/bin/sh`).
 */
export function envInterpreter(firstLine) {
  const m = /^#!\s*(\S+)(.*)$/.exec(String(firstLine ?? "").replace(/\r$/, ""));
  if (!m || basename(m[1]) !== "env") return null;
  const words = m[2].trim().split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (ENV_ARG_OPTIONS.has(word)) { i++; continue; }
    if (!word || word.startsWith("-") || word.includes("=")) continue;
    return word;
  }
  return null;
}

function firstLine(file) {
  let fd;
  try {
    fd = openSync(file, "r");
    const buf = Buffer.alloc(256);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).toString("utf8").split("\n")[0];
  } catch { return null; } finally { if (fd !== undefined) closeSync(fd); }
}

/**
 * The folders to look in beside the agent: the folder of every hop of its link chain (the PATH
 * hit, each link's target, the real file), then `<prefix>/bin` when the real file sits under
 * `<prefix>/lib/node_modules/` (npm's global layout, which nvm and Homebrew both use). None
 * for a relative `file`.
 */
export function besideDirs(file) {
  if (!isAbsolute(file)) return [];
  const dirs = [];
  let at = file;
  for (let hop = 0; hop < 40; hop++) {
    dirs.push(dirname(at));
    let st;
    try { st = lstatSync(at); } catch { break; }
    if (!st.isSymbolicLink()) break;
    try { at = resolve(dirname(at), readlinkSync(at)); } catch { break; }
  }
  try {
    const real = realpathSync(file);
    dirs.push(dirname(real));
    const i = real.lastIndexOf("/lib/node_modules/");
    if (i > 0) dirs.push(join(real.slice(0, i), "bin"));
  } catch { /* a dangling link: the hops above */ }
  return [...new Set(dirs)];
}

/**
 * [major, minor, patch] from `<dir>/<name> --version` (v24.1.0 or 1.2.3), or null when it
 * doesn't run. Nothing is run unless the folder is absolute and safe and so is the file.
 */
function versionIn(dir, name) {
  const p = join(dir, name);
  if (!isAbsolute(dir) || !safe(dir) || !safe(p) || !executable(p)) return null;
  try {
    const out = execFileSync(p, ["--version"], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
    const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(out.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
  } catch { return null; }
}
const newEnough = (v) => v && (v[0] > 22 || (v[0] === 22 && v[1] >= 7));
const newer = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** nvm's folder: $NVM_DIR, else $HOME/.nvm; null when the one that applies is relative. */
function nvmDir(env) {
  const dir = env.NVM_DIR ? env.NVM_DIR : env.HOME ? join(env.HOME, ".nvm") : null;
  return dir && isAbsolute(dir) ? dir : null;
}

/** run.sh's order past PATH: nvm's newest node 22.7+, then the Homebrew folders' (22.7+). */
function runtimeNodeDir(env) {
  let best = null;
  const nvm = nvmDir(env);
  let versions = [];
  try { if (nvm) versions = readdirSync(join(nvm, "versions/node")); } catch { /* no nvm */ }
  for (const v of versions) {
    const dir = join(nvm, "versions/node", v, "bin");
    const got = versionIn(dir, "node");
    if (newEnough(got) && (!best || newer(got, best.v) > 0)) best = { dir, v: got };
  }
  if (best) return best.dir;
  for (const dir of (env.AUTOMAGIK_HERDR_RUNTIME_DIRS ?? "/opt/homebrew/bin:/usr/local/bin").split(":")) {
    if (dir && isAbsolute(dir) && newEnough(versionIn(dir, "node"))) return dir;
  }
  return null;
}

/**
 * The PATH to start `program` with: `path` itself, or `path` with the folder of the agent's
 * interpreter put first when its `#!/usr/bin/env node|bun` line names one `path` lacks.
 * Looked for beside the agent first (any version that runs: the node that installed it),
 * then as bin/run.sh does: nvm's newest node 22.7+, Homebrew's 22.7+; for bun, ~/.bun/bin.
 * `note` is one line for the person (null when PATH is unchanged and nothing is missing).
 */
export function interpreterPath(program, path, env = process.env) {
  const same = { path, note: null };
  const file = program ? whichOn(program, path) : null;
  if (!file) return same;
  let real;
  try { real = realpathSync(file); } catch { return same; }
  const interp = envInterpreter(firstLine(real));
  if (interp !== "node" && interp !== "bun") return same;
  if (whichOn(interp, path)) return same;
  let dir = besideDirs(file).find((d) => versionIn(d, interp));
  if (!dir && interp === "node") dir = runtimeNodeDir(env);
  if (!dir && interp === "bun" && env.HOME) dir = [join(env.HOME, ".bun/bin")].find((d) => versionIn(d, "bun"));
  const name = basename(program);
  if (!dir) {
    return { path, note: `${name} runs under ${interp} (its #!/usr/bin/env ${interp} line), which isn't on PATH or beside it; `
      + `the worker may fail with "env: ${interp}: No such file or directory".` };
  }
  return { path: path ? `${dir}:${path}` : dir,
    note: `${name} runs under ${interp}, which isn't on the worker's PATH: ${dir} put first on it.` };
}
