// Timing bench for the sidebar's bot discovery (bots.js), not a test: a fake Herdr
// (discover-bench-herdr.mjs) with per-call latency, a synthetic window of 25 spaces (15 on
// this computer: 8 repos, 2 worktrees, 5 folders outside git 5 deep; 10 on felipe, g10, g9
// and hx470, a third of them outside git), and the sidebar's refresh path (main.js
// refreshBots: now, then every 15 s). Reports one discovery on its own, when the local and
// all reachable bot rows first show, and (current code) a restart drawn from the snapshot.
//
//   node test/discover-bench.mjs [reach|hang|fail] [checkout]
//     reach: every machine answers; hang: hx470 never answers; fail: hx470 errors after 10 s
//     checkout: another checkout to time (default this one), e.g. the code before the fix:
//       git worktree add /tmp/before b717da5 && node test/discover-bench.mjs reach /tmp/before
//   LAT='{"null":25,"felipe":28,...}' sets each machine's ms per call (default 300 here,
//   1500 elsewhere); SCALE=1 runs in real time (default 0.1: times are reported unscaled).
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const scenario = process.argv[2] ?? "reach";
const repo = process.argv[3] ?? fileURLToPath(new URL("..", import.meta.url));
const fake = new URL("./discover-bench-herdr.mjs", import.meta.url).href;
registerHooks({ resolve: (s, c, n) => (s === "herdr" ? { url: fake, shortCircuit: true } : n(s, c)) });
const { world } = await import(fake);
const botsUrl = pathToFileURL(`${repo}/mods/am-sidebar/bots.js`).href;

// ---- the world: 15 local spaces, 10 remote on four machines ----
const bots = JSON.stringify({ version: 1, categories: [], bots: [{ id: "b-aaaaaaaaaa", name: "m", kind: "main", look: { character: "star", colour: "blue" }, role: "r", instructions: "i", agent: "claude" }] });
const sp = [];
let n = 0;
const space = (machine, folder) => sp.push({ id: `s${++n}`, folder, machine });
for (let i = 1; i <= 8; i++) { world.repos[`null|/Users/me/repos/r${i}`] = `/Users/me/repos/r${i}/.git`; }
for (let i = 1; i <= 6; i++) world.files[`null|/Users/me/repos/r${i}/.herdr/bots.json`] = bots;
world.repos["null|/Users/me/repos/r1-wt"] = "/Users/me/repos/r1/.git/worktrees/r1-wt";
world.repos["null|/Users/me/repos/r2-wt"] = "/Users/me/repos/r2/.git/worktrees/r2-wt";
const remotes = { felipe: 3, g10: 3, g9: 2, hx470: 2 };
// interleave as a real sidebar would: local and remote spaces mixed
const local = [...Array.from({ length: 8 }, (_, i) => `/Users/me/repos/r${i + 1}`), "/Users/me/repos/r1-wt", "/Users/me/repos/r2-wt",
  ...Array.from({ length: 5 }, (_, i) => `/Users/me/notes/a/b/c${i + 1}`)];
const remote = [];
for (const [m, count] of Object.entries(remotes)) {
  world.repos[`${m}|/home/u/p1`] = "/home/u/p1/.git";
  world.repos[`${m}|/home/u/p2`] = "/home/u/p2/.git";
  world.files[`${m}|/home/u/p1/.herdr/bots.json`] = bots;
  for (const f of ["/home/u/p1", "/home/u/p2", "/home/u/scratch/x"].slice(0, count)) remote.push([m, f]);
}
world.files[`null|/Users/me/.config/herdr-app/am-sidebar-projects.json`] = JSON.stringify(["/Users/me/repos/r1", "/Users/me/repos/r7"]);
for (let i = 0; i < 15; i++) { space(null, local[i]); if (remote[i]) space(remote[i][0], remote[i][1]); }
world.spaces = sp;
world.latency = process.env.LAT ? JSON.parse(process.env.LAT) : { null: 300, felipe: 1500, g10: 1500, g9: 1500, hx470: 1500 };
if (process.env.SCALE) world.scale = Number(process.env.SCALE);
if (scenario === "hang") world.latency.hx470 = Infinity;
if (scenario === "fail") world.failAfter.hx470 = 10_000;

const LOCAL = 6; // local projects with bots
const REMOTE = scenario === "reach" ? 4 : 3;
const S = world.scale;
const CAP = 120_000;
const t0 = Date.now();
const now = () => Math.round((Date.now() - t0) / S);

// ---- the sidebar's refresh path (main.js refreshBots), old and new apply rules ----
const mod = await import(botsUrl);
const after = typeof mod.discoverySnapshot === "function";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * S));
const view = { bots: [], run: 0, applied: 0, tLocal: null, tAll: null, renders: 0 };
const look = () => {
  const l = view.bots.filter((p) => !p.machine && p.file.bots.length).length;
  const r = view.bots.filter((p) => p.machine && p.file.bots.length).length;
  if (view.tLocal === null && l >= LOCAL) view.tLocal = now();
  if (view.tAll === null && l >= LOCAL && r >= REMOTE) view.tAll = now();
};
function refreshBots(discover) {
  const run = ++view.run;
  const apply = (found) => {
    if (after ? run < view.applied : run !== view.run) return;
    view.applied = run; view.bots = found; view.renders += 1; look();
  };
  discover({ sleep: (ms) => sleep(ms), onUpdate: apply }).then(apply, () => {});
}
const once = Date.now();
let single = null;
// One discovery on its own, for the raw number (fresh module state).
const solo = await import(`${botsUrl}?solo`);
const p = solo.discoverProjects({ sleep, onUpdate: () => {} }).then((f) => { single = { ms: Math.round((Date.now() - once) / S), projects: f.length, calls: world.calls.length }; });
await Promise.race([p, sleep(CAP)]);
world.calls = []; world.maxInflight = {};

// Then the sidebar: refresh now and every 15 s, as main.js does.
const t1 = Date.now();
const tick = () => refreshBots(mod.discoverProjects);
tick();
const timer = setInterval(tick, 15_000 * S);
while ((view.tLocal === null || view.tAll === null) && Date.now() - t1 < CAP * S) await sleep(100);
clearInterval(timer);
const rel = (t) => (t === null ? "never (120 s cap)" : `${Math.round((t - (t1 - t0) / S) / 100) / 10} s`);
console.log(JSON.stringify({
  version: after ? "after" : "before", scenario,
  discoverOnce: single ? `${single.ms / 1000} s, ${single.projects} projects, ${single.calls} calls` : "never resolved (120 s cap)",
  sidebarLocalRows: rel(view.tLocal), sidebarAllRows: rel(view.tAll),
  maxInflightPerMachine: world.maxInflight,
}));
if (after) {
  // Restart: a fresh module given the saved snapshot draws at once.
  const text = mod.discoverySnapshot(view.bots);
  const fresh = await import(`${botsUrl}?restart`);
  const t2 = Date.now();
  const drawn = fresh.restoreDiscovery(text);
  const l = drawn.filter((q) => !q.machine && q.file.bots.length).length;
  const r = drawn.filter((q) => q.machine && q.file.bots.length).length;
  console.log(JSON.stringify({ restart: { firstPaintMs: Date.now() - t2, local: l, remote: r, bytes: text.length } }));
}
process.exit(0);
