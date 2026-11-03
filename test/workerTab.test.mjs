import { test } from "node:test";
import assert from "node:assert/strict";
import { workerClick, workerTabName, keptSteps, openWorkerTab, rowWorker } from "../mods/am-sidebar/workerTab.js";
import { helpersOf, visibleRows, buildTree, liveFrom, knownBots } from "../mods/am-sidebar/rows.js";
import { parseBots } from "../mods/am-sidebar/model.js";

// A bot (t1, pane p1) in tab tb2 of space sp1; its worker t7 has no pane yet.
const tabs = () => [{ id: "tb1", index: 1 }, { id: "tb2", index: 2 }, { id: "tb3", index: 3 }];
const spaceRows = () => [{ id: "sp0", tabs: [{ id: "tb0", index: 1 }] }, { id: "sp1", tabs: tabs() }];
const botPane = { pane: "p1", terminal: "t1", tab: "tb2" };

// A fake of the herdr commands: run() logged, panes()/spaces() as the test sets them, hc()
// logged, sleep() counting; `onKeep` changes the panes as Herdr's background keep would.
function fakeHerdr({ panes, spaces = spaceRows(), onKeep = () => {} }) {
  const f = { runs: [], hcCalls: [], slept: 0, notes: [], panes, spaces };
  f.run = (name, args) => { f.runs.push([name, args]); if (name === "terminal.keep") onKeep(f); return null; };
  f.deps = {
    run: f.run, panes: () => f.panes, spaces: () => f.spaces,
    hc: async (args) => { f.hcCalls.push(args); return { code: 0, stdout: "", stderr: "" }; },
    sleep: async () => { f.slept += 1; },
    notify: (n) => { f.notes.push(n); return `n${f.notes.length}`; },
  };
  return f;
}

test("workerClick: a worker with a pane is focused", () => {
  const plan = workerClick({ terminal: "t7", botTerminal: "t1", name: "w", panes: [botPane, { pane: "p7", terminal: "t7", tab: "tb3" }], spaces: spaceRows() });
  assert.deepEqual(plan, { kind: "focus", terminal: "t7" });
});

test("workerClick: a worker without a pane opens as a tab right after its bot's tab", () => {
  const plan = workerClick({ terminal: "t7", botTerminal: "t1", name: "fix/login", panes: [botPane], spaces: spaceRows() });
  assert.deepEqual(plan, { kind: "open", terminal: "t7", space: "sp1", tab: "tb2", index: 3, name: "fix/login" });
});

test("workerClick: a bot without a pane, or a pane in no space, falls back to peek", () => {
  assert.deepEqual(workerClick({ terminal: "t7", botTerminal: "t1", panes: [], spaces: spaceRows() }), { kind: "peek", terminal: "t7" });
  assert.deepEqual(workerClick({ terminal: "t7", botTerminal: null, panes: [botPane], spaces: spaceRows() }), { kind: "peek", terminal: "t7" });
  assert.deepEqual(workerClick({ terminal: "t7", botTerminal: "t1", panes: [{ ...botPane, tab: "gone" }], spaces: spaceRows() }), { kind: "peek", terminal: "t7" });
  assert.deepEqual(workerClick({ terminal: "t7", botTerminal: "t1", panes: null, spaces: null }), { kind: "peek", terminal: "t7" });
});

test("workerClick: a helper on another machine falls back to peek, even with its bot shown", () => {
  const panes = [{ pane: "box/p1", terminal: "box/t1", tab: "box/tb9" }];
  const spaces = [{ id: "box/sp9", machine: "box", tabs: [{ id: "box/tb9", index: 1 }] }];
  assert.deepEqual(workerClick({ terminal: "box/t7", botTerminal: "box/t1", name: "w", panes, spaces }), { kind: "peek", terminal: "box/t7" });
  // ...and one with a pane there is still focused.
  const shown = [...panes, { pane: "box/p7", terminal: "box/t7", tab: "box/tb9" }];
  assert.deepEqual(workerClick({ terminal: "box/t7", botTerminal: "box/t1", panes: shown, spaces }), { kind: "focus", terminal: "box/t7" });
});

test("workerTabName: the worker's branch when there is one, else the hc name", () => {
  assert.equal(workerTabName({ terminal: "t7", name: "gl-231-dev", branch: "fix/gl-231-login", task: "gl-231" }), "fix/gl-231-login");
  assert.equal(workerTabName({ terminal: "t7", name: "dev-1", branch: null, task: null }), "dev-1");
  assert.equal(workerTabName({ terminal: "t7" }), "t7");
});

test("openWorkerTab: selects the bot's space and tab, keeps the worker as a tab, moves it after the bot's, names, focuses and labels it", async () => {
  const f = fakeHerdr({ panes: [botPane], onKeep: (f) => {
    f.panes = [...f.panes, { pane: "p7", terminal: "t7", tab: "tb4" }];
    f.spaces = [spaceRows()[0], { id: "sp1", tabs: [...tabs(), { id: "tb4", index: 4 }] }];
  } });
  const plan = workerClick({ terminal: "t7", botTerminal: "t1", name: "fix/login", panes: f.panes, spaces: f.spaces });
  assert.equal(await openWorkerTab(plan, f.deps), "tb4");
  assert.deepEqual(f.runs, [
    ["space.select", { id: "sp1" }],
    ["tab.select", { id: "tb2" }],
    ["terminal.keep", { terminal: "t7", place: "tab" }],
    ["tab.move", { id: "tb4", index: 3 }],
    ["tab.rename", { id: "tb4", name: "fix/login" }],
    ["agent.focus", { terminal: "t7" }],
  ]);
  assert.deepEqual(f.hcCalls, [["label", "t7", "herdr.space=sp1", "herdr.tab=tb4"]]);
  assert.equal(f.slept, 0);
  assert.deepEqual(f.notes, []);
});

test("openWorkerTab: waits for the background keep, then places the tab", async () => {
  let looks = 0;
  const f = fakeHerdr({ panes: [botPane] });
  const later = { pane: "p7", terminal: "t7", tab: "tb4" };
  f.deps.panes = () => (++looks >= 3 ? [botPane, later] : [botPane]);
  f.deps.spaces = () => [{ id: "sp1", tabs: [...tabs(), { id: "tb4", index: 4 }] }];
  const plan = { kind: "open", terminal: "t7", space: "sp1", tab: "tb2", index: 3, name: "w" };
  assert.equal(await openWorkerTab(plan, f.deps), "tb4");
  assert.equal(f.slept, 2);
  assert.ok(f.runs.some(([c, a]) => c === "tab.move" && a.id === "tb4" && a.index === 3));
});

test("openWorkerTab: no pane in time moves, renames and labels nothing, and says the tab is still opening", async () => {
  const f = fakeHerdr({ panes: [botPane] });
  const plan = { kind: "open", terminal: "t7", space: "sp1", tab: "tb2", index: 3, name: "fix/login" };
  assert.equal(await openWorkerTab(plan, { ...f.deps, waitMs: 1000, stepMs: 250 }), null);
  assert.deepEqual(f.runs.map(([c]) => c), ["space.select", "tab.select", "terminal.keep"]);
  assert.deepEqual(f.hcCalls, []);
  assert.equal(f.slept, 4);
  assert.equal(f.notes.length, 1);
  assert.equal(f.notes[0].title, "Worker tab still opening");
  assert.match(f.notes[0].body, /fix\/login/);
});

test("openWorkerTab: a pane kept in the bot's own tab leaves that tab's place and name alone", async () => {
  const f = fakeHerdr({ panes: [botPane], onKeep: (f) => { f.panes = [...f.panes, { pane: "p7", terminal: "t7", tab: "tb2" }]; } });
  const plan = { kind: "open", terminal: "t7", space: "sp1", tab: "tb2", index: 3, name: "fix/login" };
  assert.equal(await openWorkerTab(plan, f.deps), "tb2");
  assert.deepEqual(f.runs.slice(3), [["agent.focus", { terminal: "t7" }]]);
  assert.deepEqual(f.hcCalls, [["label", "t7", "herdr.space=sp1", "herdr.tab=tb2"]]);
});

test("keptSteps: the bot tab's index is read again; a pane kept in another space is not moved", () => {
  const plan = { kind: "open", terminal: "t7", space: "sp1", tab: "tb2", index: 3, name: "w" };
  // The bot's tab moved to slot 1 meanwhile: the worker goes to 2.
  const moved = [{ id: "sp1", tabs: [{ id: "tb2", index: 1 }, { id: "tb1", index: 2 }, { id: "tb4", index: 3 }] }];
  assert.deepEqual(keptSteps(plan, { pane: "p7", terminal: "t7", tab: "tb4" }, moved).steps[0], ["tab.move", { id: "tb4", index: 2 }]);
  const elsewhere = keptSteps(plan, { pane: "p7", terminal: "t7", tab: "tb0" }, spaceRows());
  assert.deepEqual(elsewhere.steps.map(([c]) => c), ["tab.rename", "agent.focus"]);
  // Its label names the space that holds its tab (sp0), never the bot's (sp1).
  assert.deepEqual(elsewhere.label, ["label", "t7", "herdr.space=sp0", "herdr.tab=tb0"]);
  // A tab no space holds: no label at all, and no move.
  const unknown = keptSteps(plan, { pane: "p7", terminal: "t7", tab: "tb-new" }, spaceRows());
  assert.equal(unknown.label, null);
  assert.deepEqual(unknown.steps.map(([c]) => c), ["tab.rename", "agent.focus"]);
});

test("helpersOf and visibleRows: a worker row carries its branch, task id and its bot's terminal", () => {
  const terms = [{ address: "t7", parent: "t1", state: "live", name: "dev-1", labels: { task: "fix/login", "worker.of": "b-1" } },
    { address: "t8", parent: "t1", state: "live", name: "gl-231-dev",
      labels: { task: "gl-231", branch: "fix/gl-231-login", "worker.of": "b-1" } },
    { address: "t9", parent: "t1", state: "live", name: "feat-x", labels: { branch: "feat/x", "worker.of": "b-1" } }];
  const [h, contract, plain] = helpersOf(terms, "t1");
  // Started before the task contract: its task label is the branch, and it has no task id.
  assert.deepEqual([h.branch, h.task], ["fix/login", null]);
  assert.equal(workerTabName(h), "fix/login");
  assert.deepEqual([contract.branch, contract.task], ["fix/gl-231-login", "gl-231"]);
  assert.equal(workerTabName(contract), "fix/gl-231-login", "the tab is named after the branch, not the task id");
  assert.deepEqual([plain.branch, plain.task], ["feat/x", null]);
  const node = { bot: { id: "b-1" }, planned: false, members: [], helpers: [h], live: { terminal: "t1" } };
  const rows = visibleRows({ main: node, categories: [], uncategorised: [], warnings: [] });
  const helper = rows.find((r) => r.kind === "helper");
  assert.equal(helper.ownerTerminal, "t1");
  assert.equal(helper.helper.terminal, "t7");
});

// The owner's Brain on 2026-11-03: the main bot t1bw has a pane in tab "handoff" of space
// "brain"; the captain t22w (a member bot, its own `bot=` label) and the helper t22x were
// started by t1bw's agent and have no pane. A click on either row opens a tab after t1bw's.
function brainView() {
  const look = { character: "star", colour: "blue" };
  const bot = (id, more) => ({ id, name: id, kind: "member", look, role: "r", instructions: "", agent: "claude", ...more });
  const file = parseBots(JSON.stringify({ version: 1, categories: [{ id: "quality", title: "Quality" }], bots: [
    bot("b-mvrr3pb5uj", { kind: "main", name: "Brain Orchestrator" }),
    bot("b-jcj4zzsb4u", { name: "Bench Captain", category: "quality" }),
  ] })).file;
  const T = (address, more) => ({ address, state: "live", labels: {}, parent: null, created_ms: 1,
    program: { key: "claude", name: "Claude Code", agent: true }, ...more });
  const terms = [
    T("t1bw", { labels: { bot: "b-mvrr3pb5uj" } }),
    T("t22w", { labels: { bot: "b-jcj4zzsb4u" }, parent: "t1bw", name: "bench-cap" }),
    T("t22x", { parent: "t1bw", name: "bench-helper" }),
  ];
  const projects = [{ key: "/brain", machine: null, file, spaces: ["brain"] }];
  const [tree] = buildTree({ projects, live: liveFrom(terms, knownBots(projects)), terminals: terms, now: 0 });
  const rows = visibleRows(tree, new Map([["b:b-mvrr3pb5uj", true], ["b:b-jcj4zzsb4u", true]]));
  const panes = [{ pane: "p1", terminal: "t1bw", tab: "handoff" }];
  const spaces = [{ id: "brain", tabs: [{ id: "first", index: 1 }, { id: "handoff", index: 2 }] }];
  const click = (r) => workerClick({ ...rowWorker(r), panes, spaces });
  return { rows, panes, spaces, click };
}

test("REGRESSION: a helper row of a bot with a live pane in a space opens as a tab", () => {
  const { rows, click } = brainView();
  const helper = rows.find((r) => r.kind === "helper" && r.helper.terminal === "t22x");
  assert.ok(helper, "t22x shows as t1bw's helper");
  assert.deepEqual(click(helper), { kind: "open", terminal: "t22x", space: "brain", tab: "handoff", index: 3, name: "bench-helper" });
});

test("REGRESSION: a member bot started by the main bot, with no pane, opens as a tab after its starter's tab", () => {
  const { rows, click } = brainView();
  // Its `bot=` label makes it a bot row, never a helper row: the click it had was a peek.
  assert.equal(rows.some((r) => r.kind === "helper" && r.helper.terminal === "t22w"), false);
  const captain = rows.find((r) => r.node?.bot.id === "b-jcj4zzsb4u");
  assert.deepEqual(click(captain), { kind: "open", terminal: "t22w", space: "brain", tab: "handoff", index: 3, name: "Bench Captain" });
});

test("rowWorker: a bot row with a pane is focused; one without a starter, or a planned or stopped bot, as before", () => {
  const { rows, panes, spaces } = brainView();
  const main = rows.find((r) => r.kind === "main");
  // The main bot has no hc parent: its own pane is focused, and with no pane it peeks.
  assert.deepEqual(workerClick({ ...rowWorker(main), panes, spaces }), { kind: "focus", terminal: "t1bw" });
  assert.deepEqual(workerClick({ ...rowWorker(main), panes: [], spaces }), { kind: "peek", terminal: "t1bw" });
  // A captain whose starter has no pane peeks.
  const captain = rows.find((r) => r.node?.bot.id === "b-jcj4zzsb4u");
  assert.deepEqual(workerClick({ ...rowWorker(captain), panes: [], spaces }), { kind: "peek", terminal: "t22w" });
  assert.equal(rowWorker({ kind: "bot", node: { bot: { id: "b" }, live: null } }), null);
  assert.equal(rowWorker({ kind: "planned", node: { bot: { id: "b" }, planned: true, live: { terminal: "t9" } } }), null);
  assert.equal(rowWorker({ kind: "category", id: "c" }), null);
});
