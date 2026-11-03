// A fake `herdr` for discover-bench.mjs (timing bots.js discovery, not a test): a world of
// folders on machines, every exec and read answered after a per-machine latency (scaled),
// a machine that can hang forever or fail after a while.
export const world = {
  scale: 0.1, // real ms = configured ms * scale (results are reported back unscaled)
  latency: { null: 300 }, // machine -> ms per call; Infinity: never answers
  failAfter: {}, // machine -> ms after which a call rejects (an unreachable machine)
  repos: {}, // "machine|folder" -> git common dir (folder inside a repo)
  files: {}, // "machine|path" -> text
  spaces: [], shared: new Map(), calls: [], inflight: {}, maxInflight: {},
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms * world.scale));
async function answer(on, fn) {
  const m = on ?? null;
  world.calls.push(m);
  world.inflight[m] = (world.inflight[m] ?? 0) + 1;
  world.maxInflight[m] = Math.max(world.maxInflight[m] ?? 0, world.inflight[m]);
  try {
    if (world.failAfter[m] !== undefined) { await wait(world.failAfter[m]); throw new Error(`${m} is unreachable`); }
    const ms = world.latency[m] ?? world.latency.null;
    if (ms === Infinity) await new Promise(() => {});
    await wait(ms);
    return fn();
  } finally { world.inflight[m] -= 1; }
}
export function exec(command, args = [], { cwd, on } = {}) {
  return answer(on, () => {
    if (command === "true") return { code: 0, stdout: "", stderr: "" };
    if (command === "git" && args.includes("--git-common-dir")) {
      const dir = Object.keys(world.repos).find((k) => { const [mm, f] = k.split("|"); return (mm === String(on ?? null)) && (cwd === f || cwd.startsWith(`${f}/`)); });
      return dir ? { code: 0, stdout: `${world.repos[dir]}\n`, stderr: "" } : { code: 128, stdout: "", stderr: "fatal: not a git repository" };
    }
    return { code: 1, stdout: "", stderr: "" };
  });
}
export function readTextFile(path, { on } = {}) {
  return answer(on, () => world.files[`${on ?? null}|${path}`] ?? null);
}
export const writeTextFile = async () => null;
export const watchFolder = () => new Promise(() => {});
export const spaces = () => world.spaces;
export const shared = (k) => world.shared.get(k);
export const setShared = (k, v) => { world.shared.set(k, v); return null; };
export const home = () => "/Users/me";
export const appHome = () => "/Users/me/.config/herdr-app";
export const hc = async () => ({ code: 0, stdout: "{}", stderr: "" });
export const terminals = () => [];
export const notify = () => null;
