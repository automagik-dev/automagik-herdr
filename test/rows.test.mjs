import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASLEEP_MS, liveFrom, poseOf, nextWake, helpersOf, buildTree, placeTrees, visibleRows, botFold, categoryFold, knownBots, projectId,
  secondLine, argvToAsk, argvEntry,
} from "../mods/am-sidebar/rows.js";
import { parseBots } from "../mods/am-sidebar/model.js";

const look = { character: "star", colour: "blue" };
const bot = (id, more = {}) => ({ id, name: id.slice(2), kind: "member", look, role: `${id} role`, instructions: "", agent: "claude", ...more });
// The C7 test project: a main bot, two categories, a captain with two members, one
// uncategorised member and one planned bot.
const FILE = {
  version: 1,
  categories: [{ id: "shared", title: "Shared", sub: "one of each" }, { id: "eng", title: "Engineering" }, { id: "empty", title: "Empty" }],
  bots: [
    bot("b-mainmainma", { kind: "main", look: { character: "octopus", colour: "deepseek" } }),
    bot("b-pmpmpmpmpm", { category: "shared" }),
    bot("b-captaincap", { category: "eng", role: "Captain", model: "GPT-6.1 Terra" }),
    bot("b-devdevdevd", { lead: "b-captaincap", category: "shared" }),
    bot("b-testtestte", { lead: "b-captaincap" }),
    bot("b-loneloneln"),
    bot("b-plannedpla", { category: "eng", planned: { wave: 3, note: "waits for auth v2" }, agent: undefined }),
  ],
};
const file = parseBots(JSON.stringify(FILE)).file;
const KEY = "/repo/proj";
const T = (address, more = {}) => ({ address, state: "live", labels: {}, parent: null, status: null, status_ms: null, created_ms: 1, program: { key: "claude", name: "Claude Code", agent: true }, ...more });
const NOW = 1_800_000_000_000;

test("liveFrom: label + live + agent in front; newest holder wins and is flagged; remote counts", () => {
  const terms = [
    T("t1", { labels: { bot: "b-mainmainma" }, status: "working", status_ms: NOW - 5 }),
    T("t2", { labels: { bot: "b-captaincap" }, created_ms: 10 }),
    T("t3", { labels: { bot: "b-captaincap" }, created_ms: 20, status: "idle", status_ms: NOW - 1000 }),
    T("box/t4", { labels: { bot: "b-devdevdevd" }, status: "done" }),
    T("t5", { labels: { bot: "b-testtestte" }, program: { key: "shell", agent: false } }),
    T("t6", { labels: { bot: "b-loneloneln" }, state: "exited" }),
    T("t7", { labels: { bot: "b-unknownbot" } }),
    T("t8", { labels: { bot: "b-pmpmpmpmpm" }, program: null, foreground: { argv: ["/usr/bin/codex"] } }),
    T("t9", { labels: { bot: "b-plannedpla" }, program: null, foreground: { argv: ["-zsh"] } }),
  ];
  const live = liveFrom(terms, knownBots([{ key: KEY, file }]));
  assert.deepEqual(Object.keys(live).sort(), ["b-captaincap", "b-devdevdevd", "b-mainmainma", "b-pmpmpmpmpm"]);
  assert.deepEqual({ ...live["b-captaincap"], program: undefined }, { terminal: "t3", duplicate: true, status: "idle", status_ms: NOW - 1000, program: undefined, argv: null });
  assert.equal(live["b-mainmainma"].duplicate, false);
  assert.equal(live["b-devdevdevd"].terminal, "box/t4");
  // No filter: any label counts.
  assert.ok(liveFrom(terms)["b-unknownbot"]);
});

test("poseOf: Decision 7's mapping, asleep at exactly ten idle minutes", () => {
  const at = (status, ago) => poseOf({ status, status_ms: ago === null ? null : NOW - ago }, NOW);
  assert.equal(at("working", 0), "working");
  assert.equal(at("blocked", 0), "needs-you");
  assert.equal(at("error", 0), "failed");
  assert.equal(at("done", ASLEEP_MS * 2), "done");
  assert.equal(at("idle", ASLEEP_MS - 1000), "idle");
  assert.equal(at("idle", ASLEEP_MS), "asleep");
  assert.equal(at(null, ASLEEP_MS * 3), "idle", "no status yet: idle, no asleep timer");
  assert.equal(at("idle", null), "idle");
  assert.equal(poseOf(null, NOW), "asleep", "not running");
});

test("nextWake: the soonest idle bot's ten-minute mark still ahead, else null", () => {
  const live = {
    a: { status: "idle", status_ms: NOW - 60_000 },
    b: { status: "idle", status_ms: NOW - 120_000 },
    c: { status: "idle", status_ms: NOW - ASLEEP_MS - 1 },
    d: { status: "working", status_ms: NOW },
    e: { status: null, status_ms: NOW },
  };
  assert.equal(nextWake(live, NOW), NOW - 120_000 + ASLEEP_MS);
  assert.equal(nextWake({ c: live.c, d: live.d }, NOW), null);
});

test("helpersOf: the parent tree, depth first, never a known bot's terminal or what it started", () => {
  const terms = [
    T("t1"), T("h1", { parent: "t1", name: "build" }), T("h2", { parent: "h1", template: "reviewer" }),
    T("h3", { parent: "t1", state: "exited" }),
    T("t9", { parent: "t1", labels: { bot: "b-devdevdevd" } }), T("h9", { parent: "t9" }),
    T("h4", { parent: "t1", labels: { bot: "b-notdefined" }, program: { key: "codex", name: "Codex" } }),
  ];
  const got = helpersOf(terms, "t1", new Set(["b-devdevdevd"]));
  assert.deepEqual(got.map((h) => [h.terminal, h.name, h.depth]), [["h1", "build", 0], ["h2", "reviewer", 1], ["h4", "Codex", 0]]);
});

test("helpersOf: a bot's worker (worker.of, task, no bot label) folds under its pane with its model, effort or template", () => {
  const terms = [
    T("t1", { labels: { bot: "b-devdevdevd" } }),
    T("w1", { parent: "t1", name: "feat-login", labels: { "worker.of": "b-devdevdevd", task: "feat/login", "worker.model": "opus", "worker.effort": "high" } }),
    T("w2", { parent: "t1", name: "fix-x", labels: { "worker.of": "b-devdevdevd", task: "fix/x" } }),
    T("w3", { parent: "t1", name: "feat-y", labels: { "worker.of": "b-devdevdevd", task: "feat/y", "worker.template": "dev-sol" } }),
  ];
  const got = helpersOf(terms, "t1", new Set(["b-devdevdevd"]));
  assert.deepEqual(got.map((h) => [h.terminal, h.name, h.depth, h.model, h.effort, h.template]),
    [["w1", "feat-login", 0, "opus", "high", null], ["w2", "fix-x", 0, null, null, null], ["w3", "feat-y", 0, null, null, "dev-sol"]]);
});

test("buildTree: the C7 project as plain data", () => {
  const terms = [
    T("t1", { labels: { bot: "b-mainmainma" }, status: "working" }),
    T("t2", { labels: { bot: "b-captaincap" }, parent: "t1", status: "idle", status_ms: NOW - ASLEEP_MS - 5 }),
    // A member started under the live main bot: drawn once, as a member, never as a helper.
    T("t3", { labels: { bot: "b-devdevdevd" }, parent: "t1", status: "blocked" }),
    T("h1", { parent: "t1", name: "main-helper" }),
    T("h2", { parent: "t2", name: "cap-helper", status: "working" }),
  ];
  const projects = [{ key: KEY, machine: null, file, spaces: ["s1", "s2"] }];
  const [tree, ...more] = buildTree({ projects, live: liveFrom(terms, knownBots(projects)), terminals: terms, now: NOW });
  assert.equal(more.length, 0);
  assert.equal(tree.main.bot.id, "b-mainmainma");
  assert.equal(tree.main.pose, "working");
  assert.deepEqual(tree.main.helpers.map((h) => h.terminal), ["h1"]);
  // Categories in file order, empty ones left out; the captain under its category, the planned bot too.
  assert.deepEqual(tree.categories.map((c) => [c.id, c.title, c.sub, c.bots.map((n) => n.bot.id)]), [
    ["shared", "Shared", "one of each", ["b-pmpmpmpmpm"]],
    ["eng", "Engineering", undefined, ["b-captaincap", "b-plannedpla"]],
  ]);
  const cap = tree.categories[1].bots[0];
  assert.equal(cap.pose, "asleep", "idle past ten minutes");
  // Members nest under their lead by definition; a member's category is ignored.
  assert.deepEqual(cap.members.map((n) => [n.bot.id, n.pose, n.live?.terminal ?? null]), [["b-devdevdevd", "needs-you", "t3"], ["b-testtestte", "asleep", null]]);
  assert.deepEqual(cap.helpers.map((h) => h.terminal), ["h2"]);
  const planned = tree.categories[1].bots[1];
  assert.deepEqual([planned.planned, planned.pose, planned.live, planned.members], [true, "asleep", null, []]);
  assert.deepEqual(tree.uncategorised.map((n) => n.bot.id), ["b-loneloneln"]);
  assert.equal(tree.uncategorised[0].live, null, "a defined bot that is not running still shows");
});

test("buildTree: one tree per project across worktree spaces; a lead that falls back is flagged", () => {
  const f = parseBots(JSON.stringify({ ...FILE, bots: [...FILE.bots, bot("b-orphanorph", { lead: "b-missingmis" })] })).file;
  const trees = buildTree({ projects: [{ key: KEY, file: f, spaces: ["s1"] }, { key: KEY, file: f, spaces: ["s2"] }, { key: KEY, machine: "box", file: f, spaces: ["s3"] }], now: NOW });
  assert.equal(trees.length, 2, "this computer's and box's");
  const orphan = trees[0].uncategorised.find((n) => n.bot.id === "b-orphanorph");
  assert.match(orphan.warning, /missing/);
});

test("buildTree: a project with no main bot lists its bots flat with the reason", () => {
  const noMain = parseBots(JSON.stringify({ version: 1, bots: [bot("b-aaaaaaaaaa"), bot("b-bbbbbbbbbb", { lead: "b-aaaaaaaaaa" })] })).file;
  const [tree] = buildTree({ projects: [{ key: KEY, file: noMain, warnings: ["no main bot"] }], now: NOW });
  assert.equal(tree.main, null);
  assert.deepEqual(tree.uncategorised.map((n) => [n.bot.id, n.members.length]), [["b-aaaaaaaaaa", 0], ["b-bbbbbbbbbb", 0]]);
  const rows = visibleRows(tree);
  assert.deepEqual(rows.map((r) => r.kind), ["notice", "bot", "bot"]);
  // An empty project that failed to parse.
  const [bad] = buildTree({ projects: [{ key: KEY, file: { version: 1, categories: [], bots: [] }, warnings: ["x: not JSON"] }] });
  assert.deepEqual(visibleRows(bad).map((r) => [r.kind, r.text]), [["notice", "x: not JSON"]]);
});

test("visibleRows: default is main open, categories open, bots folded; folds apply by id", () => {
  const terms = [T("t1", { labels: { bot: "b-mainmainma" } }), T("t2", { labels: { bot: "b-captaincap" } }), T("h2", { parent: "t2" }), T("h1", { parent: "t1" })];
  const projects = [{ key: KEY, file, spaces: ["s1"] }];
  const [tree] = buildTree({ projects, live: liveFrom(terms), terminals: terms, now: NOW });
  const ids = (rows) => rows.map((r) => `${r.kind}:${r.kind === "category" ? r.category.id : r.kind === "helper" ? r.helper.terminal : r.node?.bot.id}`);
  const dflt = visibleRows(tree);
  assert.deepEqual(ids(dflt), [
    "main:b-mainmainma",
    "category:shared", "bot:b-pmpmpmpmpm",
    "category:eng", "bot:b-captaincap", "planned:b-plannedpla",
    "bot:b-loneloneln",
    "helper:h1",
  ]);
  assert.deepEqual(dflt.find((r) => r.node?.bot.id === "b-captaincap").guides, ["main"]);
  assert.equal(dflt.find((r) => r.node?.bot.id === "b-captaincap").foldable, true);
  assert.equal(dflt.find((r) => r.node?.bot.id === "b-captaincap").open, false);
  assert.equal(dflt.find((r) => r.node?.bot.id === "b-pmpmpmpmpm").foldable, false);
  assert.ok(dflt.every((r) => !("count" in r)), "no fold counts");

  const open = new Map([[botFold("b-captaincap"), true], [categoryFold(tree, "shared"), false]]);
  const rows = visibleRows(tree, open);
  assert.deepEqual(ids(rows), [
    "main:b-mainmainma",
    "category:shared",
    "category:eng", "bot:b-captaincap", "bot:b-devdevdevd", "bot:b-testtestte", "helper:h2", "planned:b-plannedpla",
    "bot:b-loneloneln",
    "helper:h1",
  ]);
  assert.deepEqual(rows.find((r) => r.kind === "helper" && r.helper.terminal === "h2").guides, ["main", "member", "helper"]);
  assert.deepEqual(rows.find((r) => r.node?.bot.id === "b-devdevdevd").guides, ["main", "member"]);
  assert.deepEqual(rows.find((r) => r.kind === "helper" && r.helper.terminal === "h1").guides, ["main", "helper"]);

  assert.deepEqual(ids(visibleRows(tree, new Map([[botFold("b-mainmainma"), false]]))), ["main:b-mainmainma"]);
});

test("placeTrees: after the first shown space of a project, once; projects with no space go last", () => {
  const trees = buildTree({ projects: [
    { key: "/a", file, spaces: ["wt", "s1"] },
    { key: "/b", file, spaces: [] },
    { key: "/c", machine: "box", file, spaces: ["s9"] },
  ] });
  // The sidebar order puts the main checkout's space before its worktree's.
  const { at, rest } = placeTrees(["s1", "wt", "x", "s9"], trees);
  assert.deepEqual([...at], [["s1", projectId({ key: "/a" })], ["s9", projectId({ key: "/c", machine: "box" })]]);
  assert.deepEqual(rest, [projectId({ key: "/b" })]);
});

test("secondLine: the model a live pane runs (its command line, else the agent's default), never typed text", () => {
  const texts = { claudeSettings: JSON.stringify({ model: "sonnet" }) };
  const cap = file.bots.find((b) => b.id === "b-captaincap"); // pinned to an old free-text "GPT-6.1 Terra"
  const main = file.bots.find((b) => b.id === "b-mainmainma");
  const tree = { key: "/repo/proj/" };
  const row = (bot, kind, node = {}) => ({ kind, node: { bot, live: null, argv: null, ...node } });
  const live = { live: { terminal: "t7", duplicate: false } };
  // The row carries the command line: the model it names; with none named, the default.
  assert.equal(secondLine(row(cap, "bot", { ...live, argv: ["claude", "--model", "claude-opus-5-5"] }), tree, { texts }), "Captain · claude-opus-5-5");
  assert.equal(secondLine(row(cap, "bot", { ...live, argv: ["claude", "--resume", "x"] }), tree, { texts }), "Captain · sonnet");
  assert.equal(secondLine(row(cap, "bot", { ...live, argv: ["claude"] }), tree), "Captain");
  // Read with hc get by the caller (argvOf); not known yet: no model rather than a guess.
  assert.equal(secondLine(row(cap, "bot", live), tree, { texts, argvOf: (a) => (a === "t7" ? ["claude", "--model=opus"] : null) }), "Captain · opus");
  assert.equal(secondLine(row(cap, "bot", live), tree, { texts }), "Captain");
  // Stopped: A4's shape, no model (and never the pin's free text).
  assert.equal(secondLine(row(cap, "bot"), tree, { texts }), "not running · Captain");
  assert.equal(secondLine(row(main, "main"), tree, { texts }), "Main bot · not running · proj");
  assert.equal(secondLine(row(main, "main", { ...live, argv: ["claude", "--model", "haiku"] }), tree, { texts }), "Main bot · haiku · proj");
  const planned = file.bots.find((b) => b.id === "b-plannedpla");
  assert.equal(secondLine(row(planned, "planned"), tree, { texts }), "waits for auth v2");
  for (const kind of ["bot", "main"]) assert.doesNotMatch(secondLine(row(cap, kind, live), tree, { texts }), /GPT-6\.1 Terra/);
});

test("liveFrom and buildTree carry the live pane's foreground command line when the row has it", () => {
  const rows = [T("t1", { labels: { bot: "b-captaincap" }, foreground: { argv: ["claude", "--model", "opus"] } }), T("t2", { labels: { bot: "b-mainmainma" } })];
  const live = liveFrom(rows);
  assert.deepEqual([live["b-captaincap"].argv, live["b-mainmainma"].argv], [["claude", "--model", "opus"], null]);
  const [tree] = buildTree({ projects: [{ key: KEY, file }], live, terminals: rows, now: NOW });
  const cap = tree.categories.find((c) => c.id === "eng").bots.find((n) => n.bot.id === "b-captaincap");
  assert.deepEqual(cap.argv, ["claude", "--model", "opus"]);
  assert.equal(tree.main.argv, null);
});

test("argvToAsk: live known-bot panes without a command line, not read for the same pane, three at most", () => {
  const known = new Set(["b-a", "b-b", "b-c", "b-d", "b-e"]);
  const rows = [
    T("t1", { labels: { bot: "b-a" }, created_ms: 10 }),
    T("t2", { labels: { bot: "b-b" }, created_ms: 20 }),
    T("t3", { labels: { bot: "b-c" }, foreground: { argv: ["claude"] } }), // the row has it
    T("t4", { labels: { bot: "b-zz" } }), // not a known bot
    T("t5", { labels: { bot: "b-d" }, state: "exited" }),
    T("box/t6", { labels: { bot: "b-d" }, created_ms: 60 }),
    T("t7", { labels: { bot: "b-e" }, created_ms: 70 }),
  ];
  assert.deepEqual(argvToAsk(rows, known), { ask: ["t1", "t2", "box/t6"], gone: [] });
  // Read already for the same pane: skipped; a new pane at an old address: asked again.
  const cached = new Map([["t1", { argv: ["claude"], created: 10, settled: true }], ["t2", { argv: ["claude"], created: 19, settled: true }], ["t9", { argv: ["x"], created: 1, settled: true }]]);
  assert.deepEqual(argvToAsk(rows, known, cached), { ask: ["t2", "box/t6", "t7"], gone: ["t9"] });
  assert.deepEqual(argvToAsk(rows, known, cached, 1).ask, ["t2"]);
});

test("argvEntry + argvToAsk: a pane read in its sh -c wrapper is asked again on the next refresh", () => {
  const known = new Set(["b-a"]);
  const rows = [T("t1", { labels: { bot: "b-a" }, created_ms: 10 })];
  const wrapper = argvEntry({ foreground: { argv: ["sh", "-c", "claude --model opus"] } }, 10);
  assert.deepEqual(wrapper, { argv: ["sh", "-c", "claude --model opus"], created: 10, settled: false });
  assert.deepEqual(argvToAsk(rows, known, new Map([["t1", wrapper]])).ask, ["t1"]);
  const agent = argvEntry({ foreground: { argv: ["claude", "--model", "opus"] } }, 10);
  assert.equal(agent.settled, true);
  assert.deepEqual(argvToAsk(rows, known, new Map([["t1", agent]])).ask, []);
  assert.deepEqual(argvEntry({}, undefined), { argv: null, created: null, settled: false });
});

test("clickActionOf: a terminal with a pane is focused; a parked one (no pane) is peeked, never kept; remote alike", async () => {
  const { clickActionOf } = await import("../mods/am-sidebar/rows.js");
  const panes = [{ pane: "p1", terminal: "t1dp" }, { pane: "p2", terminal: "box/t4" }, { pane: "p3", terminal: null, mod: "x" }];
  assert.deepEqual(clickActionOf("t1dp", panes), { command: "agent.focus", args: { terminal: "t1dp" } });
  assert.deepEqual(clickActionOf("t1pz", panes), { command: "terminal.peek", args: { terminal: "t1pz" } });
  assert.deepEqual(clickActionOf("box/t4", panes), { command: "agent.focus", args: { terminal: "box/t4" } });
  assert.deepEqual(clickActionOf("box/t9", panes), { command: "terminal.peek", args: { terminal: "box/t9" } });
  assert.deepEqual(clickActionOf("t4", panes), { command: "terminal.peek", args: { terminal: "t4" } }, "a local t4 is not box/t4");
  assert.deepEqual(clickActionOf("t1", null), { command: "terminal.peek", args: { terminal: "t1" } });
});
