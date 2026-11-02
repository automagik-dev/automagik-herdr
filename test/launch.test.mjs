// Start and Attach: the pure argument building and messages (launchArgs.js), then launch.js
// over the Herdr stand-ins with a scratch git project: it runs the real CLI against a fake hc
// (test/fake-hc.mjs) first on PATH. The real hc is never run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { state } from "./use-stubs.mjs";
import { hcName, parentArgs, startRefusal, startArgs, agentInForeground, isClaude, newest, attachRefusal, parseCommand } from "../mods/spaces-agents/launchArgs.js";
const { startBot, attachBot, liveTerminalOf, botOfTerminal } = await import("../mods/spaces-agents/launch.js");

const ID = { main: "b-aaaaaaaaaa", cap: "b-bbbbbbbbbb", dev: "b-cccccccccc", plan: "b-eeeeeeeeee" };
const bot = (id, kind, extra = {}) => ({ id, name: `Bot ${id.slice(2, 4)}`, kind, look: { character: "star", colour: "blue" }, role: "r", instructions: "i", agent: "claude", ...extra });
const team = () => ({
  version: 1,
  categories: [],
  bots: [
    bot(ID.main, "main", { name: "Genie" }),
    bot(ID.cap, "member", { name: "Captain" }),
    bot(ID.dev, "member", { name: "Dev", lead: ID.cap }),
    bot(ID.plan, "member", { name: "Studio", agent: undefined, planned: { wave: 3 } }),
  ],
});

// ---- pure ----

test("start args: a main bot runs with --no-parent, labels, name, cwd and the agent after --", () => {
  const args = startArgs({ botId: ID.main, name: "genie", cwd: "/p", space: "sp1", tab: "tb1", parent: parentArgs(team(), ID.main, () => "t9"), argv: ["claude", "--x"] });
  assert.deepEqual(args, ["run", "--bg", "--json", "--name", "genie", "--cwd", "/p", "--label", "bot=b-aaaaaaaaaa",
    "--label", "herdr.space=sp1", "--label", "herdr.tab=tb1", "--no-parent", "--", "claude", "--x"]);
  assert.equal(args.includes("--no-notify"), false);
});

test("start args: a member whose lead is live gets it as parent and outlives it", () => {
  const live = { [ID.cap]: "t7", [ID.main]: "t1" };
  assert.deepEqual(parentArgs(team(), ID.dev, (id) => live[id] ?? null), ["--parent", "t7", "--outlive-parent"]);
  // No lead field: the main bot is the lead.
  assert.deepEqual(parentArgs(team(), ID.cap, (id) => live[id] ?? null), ["--parent", "t1", "--outlive-parent"]);
});

test("start args: a member whose lead is down gets --no-parent; a lead that falls back uses the main bot", () => {
  assert.deepEqual(parentArgs(team(), ID.dev, () => null), ["--no-parent"]);
  const f = team();
  f.bots[2].lead = ID.plan; // a planned lead: A1 falls back to the main bot
  assert.deepEqual(parentArgs(f, ID.dev, (id) => (id === ID.main ? "t1" : "t8")), ["--parent", "t1", "--outlive-parent"]);
});

test("start: a planned bot, one with no agent, or a member with no main bot is refused", () => {
  assert.match(startRefusal(team(), ID.plan), /planned \(wave 3\)/);
  const f = team();
  delete f.bots[1].agent;
  assert.match(startRefusal(f, ID.cap), /no coding agent/);
  const g = team();
  g.bots.shift();
  assert.match(startRefusal(g, ID.cap), /no main bot/);
  assert.equal(startRefusal(team(), ID.dev), null);
});

test("names: slugged to hc's alphabet, suffixed when taken", () => {
  assert.equal(hcName("Genie the Great!", ID.main), "genie-the-great");
  assert.equal(hcName("Genie", ID.main, new Set(["genie"])), "genie-aaaa");
  assert.equal(hcName("Genie", ID.main, new Set(["genie", "genie-aaaa"])), null);
  assert.equal(hcName("x".repeat(40), ID.main).length, 32);
  assert.equal(hcName("ñ", ID.main), "bot");
});

test("attach refusal names both folders and the fix; same project passes", () => {
  const msg = attachRefusal({ botName: "Genie", projectKey: "/repos/a", sessionFolder: "/repos/b/src", sessionKey: "/repos/b" });
  assert.match(msg, /\/repos\/b\/src/);
  assert.match(msg, /\/repos\/a/);
  assert.match(msg, /Create the bot in \/repos\/b instead, or Start Genie fresh/);
  assert.equal(attachRefusal({ botName: "G", projectKey: "/repos/a", sessionFolder: "/repos/a-wt", sessionKey: "/repos/a" }), null);
});

test("duplicates: the newest by created_ms counts; the live rule reads the foreground", () => {
  assert.equal(newest([{ address: "t1", created_ms: 5 }, { address: "t2", created_ms: 9 }, { address: "t3", created_ms: 7 }]).address, "t2");
  assert.equal(agentInForeground({ foreground: { argv: ["/bin/zsh", "-l"] } }), false);
  assert.equal(agentInForeground({ foreground: { argv: ["-zsh"] } }), false);
  assert.equal(agentInForeground({ foreground: { argv: ["bun", "omp"] } }), true);
  assert.equal(agentInForeground({ foreground: null }), false);
  assert.equal(isClaude(null, { foreground: { argv: ["claude", "--resume", "x"] } }), true);
  assert.equal(isClaude({ program: { key: "codex" } }, { foreground: { argv: ["codex"] } }), false);
});

test("commands: name with optional JSON or key=value arguments", () => {
  assert.deepEqual(parseCommand("new-bot"), { name: "new-bot", args: {} });
  assert.deepEqual(parseCommand("edit b-aaaaaaaaaa"), { name: "edit", args: { bot: "b-aaaaaaaaaa" } });
  assert.deepEqual(parseCommand('attach {"bot":"b-x","terminal":"t7"}'), { name: "attach", args: { bot: "b-x", terminal: "t7" } });
  assert.deepEqual(parseCommand("attach bot=b-x terminal=t7"), { name: "attach", args: { bot: "b-x", terminal: "t7" } });
});

// ---- launch.js over the stand-ins: the sidebar runs the real CLI ----
// launch.js execs `env HERDR_APP_HOME=<app> sh <app>/mods/spaces-agents/bin/run.sh <cli> …`
// through the stub's exec (a real execFile). The scratch app home's mods/spaces-agents links
// to this checkout, and this process's PATH starts with a fake hc (test/fake-hc.mjs), its HOME
// a scratch one, so the CLI never reaches a real hc, window or app home.

const run = promisify(execFile);
const FAKE_HC = new URL("./fake-hc.mjs", import.meta.url).pathname;
const MOD = new URL("../mods/spaces-agents", import.meta.url).pathname;
const exe = (path, text) => { writeFileSync(path, text); chmodSync(path, 0o755); };
const saved = { PATH: process.env.PATH, HOME: process.env.HOME, HC_FAKE_STATE: process.env.HC_FAKE_STATE,
  HC_FAKE_LOG: process.env.HC_FAKE_LOG, HC_TERMINAL_ID: process.env.HC_TERMINAL_ID, HERDR_APP_HOME: process.env.HERDR_APP_HOME };

async function world(t, { file = team(), terminals = () => [] } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "automagik-herdr-")));
  const main = join(root, "proj");
  mkdirSync(join(main, ".herdr"), { recursive: true });
  await run("git", ["init", "-q", main]);
  await run("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init"], { cwd: main });
  writeFileSync(join(main, ".herdr", "bots.json"), JSON.stringify(file));
  const bin = join(root, "bin");
  mkdirSync(bin);
  exe(join(bin, "hc"), `#!/bin/sh\nexec "${process.execPath}" "${FAKE_HC}" "$@"\n`);
  exe(join(bin, "claude"), "#!/bin/sh\nexit 0\n");
  const home = join(root, "home");
  mkdirSync(join(home, ".claude"), { recursive: true });
  const app = join(root, "app");
  mkdirSync(join(app, "mods"), { recursive: true });
  symlinkSync(MOD, join(app, "mods/spaces-agents"));
  const statePath = join(root, "hc.json");
  const logPath = join(root, "hc.log");
  writeFileSync(statePath, JSON.stringify({ terminals: terminals(main), next: 100 }));
  writeFileSync(logPath, "");
  Object.assign(process.env, { PATH: `${bin}:${saved.PATH}`, HOME: home, HC_FAKE_STATE: statePath, HC_FAKE_LOG: logPath });
  delete process.env.HC_TERMINAL_ID;
  delete process.env.HERDR_APP_HOME;
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    rmSync(root, { recursive: true, force: true });
  });
  Object.assign(state, { spaces: [], shared: new Map(), setSharedCalls: 0, offline: new Set(), calls: [], terminals: [], focused: null,
    hcCalls: [], runs: [], notes: [], appHome: app, agents: [{ key: "claude", name: "Claude Code", run: ["claude"], installed: true }] });
  const calls = () => readFileSync(logPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const hcState = () => JSON.parse(readFileSync(statePath, "utf8"));
  const setHc = (st) => writeFileSync(statePath, JSON.stringify(st));
  const ledger = () => { try { return readFileSync(join(app, "automagik-herdr/attach.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  return { root, main, app, calls, hcState, setHc, ledger };
}
const term = (address, { bot: b, cwd = "/x", argv = ["claude"], created = 1 } = {}) => ({ address, name: address, cwd, state: "live", parent: null,
  created_ms: created, labels: b ? { bot: b } : {}, foreground: { argv, cwd }, status: { app: "claude-code", state: "idle" } });

test("the fake hc is the one the CLI runs here: never the real one", async (t) => {
  await world(t);
  const { stdout } = await run("sh", ["-c", "command -v hc"]);
  assert.match(stdout.trim(), /automagik-herdr-.*\/bin\/hc$/);
});

test("startBot runs the CLI: hc run in the project's space and tab, an attach row by start; the sidebar sets no label", async (t) => {
  const w = await world(t, { terminals: (main) => [term("t7", { bot: ID.cap, cwd: main })] });
  state.spaces = [{ id: "s0", folder: "/elsewhere", machine: null, active: true, tabs: [{ id: "x", active: true }] },
    { id: "s1", folder: w.main, machine: null, active: false, tabs: [{ id: "a", active: false }, { id: "b", active: true }] }];
  const r = await startBot(w.main, ID.dev);
  assert.deepEqual(r, { terminal: "t100" });
  const runArgs = w.calls().find((a) => a[0] === "run");
  assert.ok(runArgs.includes(`bot=${ID.dev}`) && runArgs.includes("herdr.space=s1") && runArgs.includes("herdr.tab=b"));
  assert.deepEqual(runArgs.slice(runArgs.indexOf("--parent"), runArgs.indexOf("--parent") + 3), ["--parent", "t7", "--outlive-parent"]);
  const rows = w.ledger();
  assert.deepEqual(rows.map((x) => [x.event, x.bot, x.terminal, x.by]), [["attach", ID.cap, "t7", "import"], ["attach", ID.dev, "t100", "start"]]);
  assert.deepEqual(state.hcCalls, [], "the sidebar itself calls no hc: no label, no run");
  assert.deepEqual(state.shared.get("spaces-agents.projects"), [{ key: w.main, machine: null }]);
  // Started already: the ledger's pane is focused, never a second one.
  assert.deepEqual(await startBot(w.main, ID.dev), { focused: "t100" });
  assert.deepEqual(state.runs, [["agent.focus", { terminal: "t100" }]]);
  assert.equal(w.calls().filter((a) => a[0] === "run").length, 1);
  assert.match((await startBot(w.main, ID.plan)).refused, /planned/);
});

test("startBot: two Starts at once open one pane", async (t) => {
  const w = await world(t);
  const [a, b] = await Promise.all([startBot(w.main, ID.main), startBot(w.main, ID.main)]);
  assert.deepEqual([a, b].map((r) => r.terminal ?? r.refused).sort(), [`${ID.main} is already starting.`, "t100"]);
  assert.equal(w.calls().filter((c) => c[0] === "run").length, 1);
});

test("attachBot runs the CLI: an attach row by attach; a bot attached elsewhere is refused naming it, never moved", async (t) => {
  const w = await world(t, { terminals: (main) => [term("t1", { bot: ID.main, cwd: main }), term("t2", { cwd: main }), term("t3", { cwd: main })] });
  assert.deepEqual(await attachBot(w.main, ID.cap, "t2"), { ok: true });
  assert.deepEqual(w.ledger().at(-1) && [w.ledger().at(-1).event, w.ledger().at(-1).bot, w.ledger().at(-1).terminal, w.ledger().at(-1).by],
    ["attach", ID.cap, "t2", "attach"]);
  assert.equal(w.hcState().terminals.find((x) => x.address === "t2").labels.bot, ID.cap);
  const moved = await attachBot(w.main, ID.cap, "t3");
  assert.match(moved.refused, /Captain \(b-bbbbbbbbbb\) is attached to t2 .*--move/);
  const taken = await attachBot(w.main, ID.dev, "t1");
  assert.match(taken.refused, /t1 already plays Genie \(b-aaaaaaaaaa\)/);
  assert.match((await attachBot(w.main, ID.dev, "vps/t9")).refused, /this computer's panes only/);
  assert.deepEqual(state.hcCalls, []);
});

test("liveTerminalOf and botOfTerminal follow the ledger: a relabel moves nothing", async (t) => {
  const w = await world(t, { terminals: (main) => [term("t1", { bot: ID.main, cwd: main }), term("t2", { cwd: main })] });
  assert.deepEqual(await liveTerminalOf(ID.main), { terminal: "t1", duplicate: false });
  assert.equal(await botOfTerminal("t1"), ID.main);
  const st = w.hcState();
  st.terminals[0].labels = {};
  st.terminals[1].labels = { bot: ID.main };
  w.setHc(st);
  assert.deepEqual(await liveTerminalOf(ID.main), { terminal: "t1", duplicate: false });
  assert.equal(await botOfTerminal("t2"), null);
  assert.equal(await liveTerminalOf(ID.cap), null);
  assert.equal(await botOfTerminal("vps/t1"), null);
});

test("with no CLI under the app home, Start and Attach say so and nothing runs", async (t) => {
  await world(t);
  state.appHome = join(tmpdir(), "no-such-app-home-for-automagik-herdr");
  const r = await startBot("/p", ID.main);
  assert.ok(r.refused, "refused");
  assert.equal(await liveTerminalOf(ID.main), null);
});
