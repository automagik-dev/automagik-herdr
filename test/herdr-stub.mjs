// A stand-in for Herdr's `herdr` module, enough for bots.js under `node --test`: exec and
// files on this machine (a "remote" machine runs here too), spaces and shared values set by
// the test, and a log of every exec and read with the machine it was sent to. Not Herdr
// itself: the in-app checks in the README still apply.
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";

export const state = {
  // offline: machines whose calls reject; hung: machines whose calls never answer.
  spaces: [], shared: new Map(), setSharedCalls: 0, offline: new Set(), hung: new Set(), calls: [],
  // Start and Attach: terminals() rows, hc's answers by command (hcAnswer), hc calls made, run() calls.
  terminals: [], focused: null, agents: [], hcCalls: [], runs: [], hcAnswer: () => ({ code: 0, stdout: "{}", stderr: "" }),
};

export const terminals = () => state.terminals;
export const focused = () => state.focused;
export const knownAgents = async () => state.agents;
// state.runFault(name, args): an error to throw for that call (theme.js's app.theme), or nothing.
export function run(name, args) {
  state.runs.push([name, args]);
  const fault = state.runFault?.(name, args);
  if (fault) throw fault;
  return null;
}
// The theme list app.theme can use (theme.js), as Herdr's themes() answers it.
export const themes = () => state.themeList ?? [];
export async function hc(args) { state.hcCalls.push(args); return state.hcAnswer(args); }

// The briefing hook (launch.js afterBind): the app home it computes the script path from,
// and every notification posted.
state.appHome = "/nonexistent/herdr-app";
state.notes = [];
export const appHome = () => state.appHome;
export function notify(n) { state.notes.push(n); return `n${state.notes.length}`; }

export const spaces = () => state.spaces;
export const home = () => homedir();
export const shared = (key) => state.shared.get(key);
export function setShared(key, value) { state.setSharedCalls += 1; state.shared.set(key, value); return null; }

export function exec(command, args = [], { cwd, on } = {}) {
  state.calls.push({ kind: "exec", command, args, cwd, on: on ?? null });
  if (on && state.offline.has(on)) return Promise.reject(new Error(`${on} is unreachable`));
  if (on && state.hung.has(on)) return new Promise(() => {});
  return new Promise((resolve, reject) => execFile(command, args, { cwd }, (err, stdout, stderr) => {
    if (err && typeof err.code !== "number") reject(err);
    else resolve({ code: err ? err.code : 0, stdout, stderr });
  }));
}

export async function readTextFile(path, { on } = {}) {
  state.calls.push({ kind: "read", path, on: on ?? null });
  if (on && state.offline.has(on)) throw new Error(`${on} is unreachable`);
  if (on && state.hung.has(on)) return new Promise(() => {});
  // state.readFault(path): an error to throw for a file that is there (Herdr's 1 MiB cap, a permission).
  const fault = state.readFault?.(path);
  if (fault) throw fault;
  try { return await readFile(path, "utf8"); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
}

export async function writeTextFile(path, text, expected) {
  state.calls.push({ kind: "write", path, expected });
  // A test can change the file between a caller's read and this write (a race).
  if (state.beforeWrite) await state.beforeWrite(path);
  let now = null;
  try { now = await readFile(path, "utf8"); } catch {}
  if (now !== expected) throw new Error("stale snapshot");
  await writeFile(path, text);
  return null;
}

export const watchFolder = () => new Promise(() => {});
