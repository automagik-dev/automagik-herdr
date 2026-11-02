import { test } from "node:test";
import assert from "node:assert/strict";
import { workerClick, workerTabName, keptSteps, openWorkerTab } from "../mods/spaces-agents/workerTab.js";
import { helpersOf, visibleRows } from "../mods/spaces-agents/rows.js";

// A bot (t1, pane p1) in tab tb2 of space sp1; its worker t7 has no pane yet.
const tabs = () => [{ id: "tb1", index: 1 }, { id: "tb2", index: 2 }, { id: "tb3", index: 3 }];
const spaceRows = () => [{ id: "sp0", tabs: [{ id: "tb0", index: 1 }] }, { id: "sp1", tabs: tabs() }];
const botPane = { pane: "p1", terminal: "t1", tab: "tb2" };

// A fake of the herdr commands: run() logged, panes()/spaces() as the test sets them, hc()
// logged, sleep() counting; `onKeep` changes the panes as Herdr's background keep would.
function fakeHerdr({ panes, spaces = spaceRows(), onKeep = () => {} }) {
  const f = { runs: [], hcCalls: [], slept: 0, panes, spaces };
  f.run = (name, args) => { f.runs.push([name, args]); if (name === "terminal.keep") onKeep(f); return null; };
  f.deps = {
    run: f.run, panes: () => f.panes, spaces: () => f.spaces,
    hc: async (args) => { f.hcCalls.push(args); return { code: 0, stdout: "", stderr: "" }; },
    sleep: async () => { f.slept += 1; },
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

test("workerTabName: the task branch when there is one, else the hc name", () => {
  assert.equal(workerTabName({ terminal: "t7", name: "dev-1", task: "fix/login" }), "fix/login");
  assert.equal(workerTabName({ terminal: "t7", name: "dev-1", task: null }), "dev-1");
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

test("openWorkerTab: no pane in time moves, renames and labels nothing", async () => {
  const f = fakeHerdr({ panes: [botPane] });
  const plan = { kind: "open", terminal: "t7", space: "sp1", tab: "tb2", index: 3, name: "w" };
  assert.equal(await openWorkerTab(plan, { ...f.deps, waitMs: 1000, stepMs: 250 }), null);
  assert.deepEqual(f.runs.map(([c]) => c), ["space.select", "tab.select", "terminal.keep"]);
  assert.deepEqual(f.hcCalls, []);
  assert.equal(f.slept, 4);
});

test("keptSteps: the bot tab's index is read again; a pane kept in another space is not moved", () => {
  const plan = { kind: "open", terminal: "t7", space: "sp1", tab: "tb2", index: 3, name: "w" };
  // The bot's tab moved to slot 1 meanwhile: the worker goes to 2.
  const moved = [{ id: "sp1", tabs: [{ id: "tb2", index: 1 }, { id: "tb1", index: 2 }, { id: "tb4", index: 3 }] }];
  assert.deepEqual(keptSteps(plan, { pane: "p7", terminal: "t7", tab: "tb4" }, moved).steps[0], ["tab.move", { id: "tb4", index: 2 }]);
  const elsewhere = keptSteps(plan, { pane: "p7", terminal: "t7", tab: "tb0" }, spaceRows());
  assert.deepEqual(elsewhere.steps.map(([c]) => c), ["tab.rename", "agent.focus"]);
});

test("helpersOf and visibleRows: a worker row carries its task branch and its bot's terminal", () => {
  const terms = [{ address: "t7", parent: "t1", state: "live", name: "dev-1", labels: { task: "fix/login", "worker.of": "b-1" } }];
  const [h] = helpersOf(terms, "t1");
  assert.equal(h.task, "fix/login");
  const node = { bot: { id: "b-1" }, planned: false, members: [], helpers: [h], live: { terminal: "t1" } };
  const rows = visibleRows({ main: node, categories: [], uncategorised: [], warnings: [] });
  const helper = rows.find((r) => r.kind === "helper");
  assert.equal(helper.ownerTerminal, "t1");
  assert.equal(helper.helper.terminal, "t7");
});
