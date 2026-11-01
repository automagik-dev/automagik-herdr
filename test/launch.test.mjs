// Start and Attach: the pure argument building and messages (launchArgs.js), then launch.js
// over the Herdr stand-ins with a scratch git project. hc itself is never run: the stub
// answers `hc get` and `hc run` and records every call.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { state } from "./use-stubs.mjs";
import { hcName, parentArgs, startRefusal, startArgs, agentInForeground, isClaude, newest, labelMoves, attachRefusal, parseCommand } from "../mods/spaces-agents/launchArgs.js";
const { startBot, attachBot, liveTerminalOf } = await import("../mods/spaces-agents/launch.js");

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

test("label moves: off every other holder, then onto the target", () => {
  assert.deepEqual(labelMoves(["t3", "t5", "t3", "t9"], "t9", ID.main),
    [["label", "t3", "bot="], ["label", "t5", "bot="], ["label", "t9", "bot=b-aaaaaaaaaa"]]);
  assert.deepEqual(labelMoves([], "t9", ID.main), [["label", "t9", "bot=b-aaaaaaaaaa"]]);
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

// ---- launch.js over the stand-ins ----

const run = promisify(execFile);
async function project(t, file = team()) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "herdr-bots-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const main = join(root, "proj");
  mkdirSync(join(main, ".herdr"), { recursive: true });
  await run("git", ["init", "-q", main]);
  await run("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init"], { cwd: main });
  const tree = join(root, "proj-wt");
  await run("git", ["worktree", "add", "-q", "-b", "wt", tree], { cwd: main });
  const other = join(root, "other");
  mkdirSync(other);
  writeFileSync(join(main, ".herdr", "bots.json"), JSON.stringify(file));
  return { main, tree, other };
}
const gets = {};
function reset() {
  for (const k of Object.keys(gets)) delete gets[k];
  Object.assign(state, {
    spaces: [], shared: new Map(), setSharedCalls: 0, offline: new Set(), calls: [], terminals: [], focused: null, hcCalls: [], runs: [],
    agents: [{ key: "claude", name: "Claude Code", run: ["claude"], installed: true }],
    hcAnswer: (args) => {
      if (args[0] === "get") return gets[args[1]] ? { code: 0, stdout: JSON.stringify(gets[args[1]]), stderr: "" } : { code: 1, stdout: "", stderr: "no such terminal" };
      if (args[0] === "run") return { code: 0, stdout: JSON.stringify({ address: "t42" }), stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    },
  });
}
const row = (address, labels, extra = {}) => ({ address, labels, state: "live", program: { key: "claude", agent: true }, ...extra });

test("liveTerminalOf: label plus an agent in front; a shell doesn't count; duplicates read with hc get", async () => {
  reset();
  state.terminals = [row("t1", { bot: ID.main }), row("t2", { bot: ID.cap }, { program: { key: "shell", agent: false } })];
  assert.deepEqual(await liveTerminalOf(ID.main), { terminal: "t1", duplicate: false });
  assert.equal(await liveTerminalOf(ID.cap), null);
  assert.deepEqual(state.hcCalls, []);
  // No program on the rows: hc get's foreground decides.
  state.terminals = [row("t4", { bot: ID.dev }, { program: undefined }), row("t5", { bot: ID.dev }, { program: undefined }), row("t6", { bot: ID.dev }, { program: undefined })];
  Object.assign(gets, {
    t4: { address: "t4", created_ms: 10, foreground: { argv: ["claude"] } },
    t5: { address: "t5", created_ms: 30, foreground: { argv: ["claude"] } },
    t6: { address: "t6", created_ms: 99, foreground: { argv: ["/bin/zsh"] } },
  });
  assert.deepEqual(await liveTerminalOf(ID.dev), { terminal: "t5", duplicate: true });
});

test("startBot: a member with a live lead runs under it, in the project's space and active tab", async (t) => {
  reset();
  const { main } = await project(t);
  state.spaces = [{ id: "s0", folder: "/elsewhere", machine: null, active: true, tabs: [{ id: "x", active: true }] },
    { id: "s1", folder: main, machine: null, active: false, tabs: [{ id: "a", active: false }, { id: "b", active: true }] }];
  state.terminals = [row("t7", { bot: ID.cap }, { name: "dev" })];
  const r = await startBot(main, ID.dev);
  assert.deepEqual(r, { terminal: "t42" });
  const runArgs = state.hcCalls.find((a) => a[0] === "run");
  assert.deepEqual(runArgs, ["run", "--bg", "--json", "--name", "dev-cccc", "--cwd", main, "--label", `bot=${ID.dev}`,
    "--label", "herdr.space=s1", "--label", "herdr.tab=b", "--parent", "t7", "--outlive-parent", "--", "claude"]);
  assert.deepEqual(state.shared.get("spaces-agents.projects"), [{ key: main, machine: null }]);
});

test("startBot: lead down -> --no-parent; a live bot is focused, not started; planned refused", async (t) => {
  reset();
  const { main } = await project(t);
  state.spaces = [{ id: "s1", folder: main, machine: null, active: true, tabs: [] }];
  await startBot(main, ID.dev);
  const runArgs = state.hcCalls.find((a) => a[0] === "run");
  assert.ok(runArgs.includes("--no-parent") && !runArgs.includes("--parent"));
  assert.equal(runArgs.some((a) => a.startsWith("herdr.tab=")), false);
  reset();
  state.terminals = [row("t3", { bot: ID.main })];
  assert.deepEqual(await startBot(main, ID.main), { focused: "t3" });
  assert.deepEqual(state.runs, [["agent.focus", { terminal: "t3" }]]);
  assert.equal(state.hcCalls.some((a) => a[0] === "run"), false);
  assert.match((await startBot(main, ID.plan)).refused, /planned/);
});

test("attachBot: a Claude pane whose session is in another project is refused, nothing written", async (t) => {
  reset();
  const { main, other } = await project(t);
  state.terminals = [row("t1m", {}, { cwd: "/Users/x/workspace" })];
  gets.t1m = { address: "t1m", foreground: { argv: ["claude", "--resume", "s"], cwd: other }, labels: {} };
  const r = await attachBot(main, ID.main, "t1m");
  assert.match(r.refused, new RegExp(`runs in ${other}`));
  assert.match(r.refused, new RegExp(`project ${main}`));
  assert.deepEqual(state.hcCalls.filter((a) => a[0] === "label"), []);
  assert.equal(state.shared.get("spaces-agents.projects"), undefined);
});

test("attachBot: a Claude session in the project's worktree passes; the label moves off the old holder", async (t) => {
  reset();
  const { main, tree } = await project(t);
  state.terminals = [row("t1m", {}, { cwd: "/Users/x/workspace" }), row("t3", { bot: ID.main })];
  gets.t1m = { address: "t1m", foreground: { argv: ["claude"], cwd: tree }, labels: {} };
  assert.deepEqual(await attachBot(main, ID.main, "t1m"), { ok: true });
  assert.deepEqual(state.hcCalls.filter((a) => a[0] === "label"), [["label", "t3", "bot="], ["label", "t1m", `bot=${ID.main}`]]);
  assert.deepEqual(await attachBot(main, ID.main, "far/t9"), { refused: "Attach works on this computer's panes only; far/t9 is on another machine." });
});

// ---- fix loop 1 ----

test("startBot: two Starts at once open one pane; a Start right after focuses the new one", async (t) => {
  reset();
  const { main } = await project(t);
  state.spaces = [{ id: "s1", folder: main, machine: null, active: true, tabs: [] }];
  const [a, b] = await Promise.all([startBot(main, ID.main), startBot(main, ID.main)]);
  assert.equal(state.hcCalls.filter((x) => x[0] === "run").length, 1);
  assert.deepEqual([a, b].map((r) => Object.keys(r)[0]).sort(), ["refused", "terminal"]);
  assert.match((a.refused ?? b.refused), /already starting/);
  // The new pane has the label but no agent in front yet: focused, not started twice.
  state.terminals = [row("t42", { bot: ID.main }, { program: { key: "shell", agent: false } })];
  assert.deepEqual(await startBot(main, ID.main), { focused: "t42" });
  assert.equal(state.hcCalls.filter((x) => x[0] === "run").length, 1);
});

test("attachBot: a pane already playing another bot is refused, naming it", async (t) => {
  reset();
  const { main } = await project(t);
  state.terminals = [row("t5", { bot: ID.cap }, { cwd: main })];
  gets.t5 = { address: "t5", foreground: { argv: ["claude"], cwd: main } };
  const r = await attachBot(main, ID.main, "t5");
  assert.match(r.refused, /t5 already plays Captain \(b-bbbbbbbbbb\)/);
  assert.deepEqual(state.hcCalls.filter((a) => a[0] === "label"), []);
});

test("attachBot: when the label came off the old pane but the new write fails, it says the bot has no pane", async (t) => {
  reset();
  const { main } = await project(t);
  state.terminals = [row("t1", {}, { cwd: main }), row("t3", { bot: ID.main })];
  gets.t1 = { address: "t1", foreground: { argv: ["claude"], cwd: main } };
  const answer = state.hcAnswer;
  state.hcAnswer = (args) => (args[0] === "label" && args[1] === "t1" ? { code: 1, stdout: "", stderr: "core away" } : answer(args));
  const r = await attachBot(main, ID.main, "t1");
  assert.match(r.refused, /^Genie has no pane now \(its label came off t3\); attach again\. hc said: core away$/);
});

test("liveTerminalOf: another machine's labelled terminal doesn't count", async () => {
  reset();
  state.terminals = [row("far/t2", { bot: ID.main })];
  assert.equal(await liveTerminalOf(ID.main), null);
});
