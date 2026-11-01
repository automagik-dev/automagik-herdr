// A stand-in for Herdr's `herdr` module, enough for bots.js under `node --test`: exec and
// files on this machine, spaces and shared values set by the test. Not Herdr itself: the
// in-app checks in the README still apply.
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";

export const state = { spaces: [], shared: new Map(), setSharedCalls: 0, offline: new Set() };

export const spaces = () => state.spaces;
export const home = () => homedir();
export const shared = (key) => state.shared.get(key);
export function setShared(key, value) { state.setSharedCalls += 1; state.shared.set(key, value); return null; }

export function exec(command, args = [], { cwd, on } = {}) {
  if (on && state.offline.has(on)) return Promise.reject(new Error(`${on} is unreachable`));
  return new Promise((resolve, reject) => execFile(command, args, { cwd }, (err, stdout, stderr) => {
    if (err && typeof err.code !== "number") reject(err);
    else resolve({ code: err ? err.code : 0, stdout, stderr });
  }));
}

export async function readTextFile(path, { on } = {}) {
  if (on && state.offline.has(on)) throw new Error(`${on} is unreachable`);
  try { return await readFile(path, "utf8"); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
}

export async function writeTextFile(path, text, expected) {
  const now = await readTextFile(path);
  if (now !== expected) throw new Error("stale snapshot");
  await writeFile(path, text);
  return null;
}

export const watchFolder = () => new Promise(() => {});
