// R3 row order (sidebar-rules D2, D8) over the recorded fixtures: the golden order per space,
// the invariants every space keeps, and the fixtures' redaction.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fixtures, golden, view, openAll } from "./sidebar-fixture.mjs";
import { spaceRowOrder, buildTree } from "../mods/am-sidebar/rows.js";
import { parseBots } from "../mods/am-sidebar/model.js";

const ALL = fixtures();
const TREE = new Set(["main", "category", "bot", "helper", "notice"]);
const rank = (d) => (TREE.has(d.kind) ? 0 : d.kind === "agent" ? 1 : 2);

test("fixtures: there is at least one, each a State with its golden file", () => {
  assert.ok(ALL.length >= 1);
  for (const { name, state } of ALL) {
    for (const k of ["terminals", "spaces", "projects", "registry"]) assert.ok(Array.isArray(state[k]), `${name}: ${k}`);
    assert.equal(golden(name).fixture, name);
  }
});

test("fixtures are redacted: no home path, no instructions text, no tokens", () => {
  for (const { name, text, state } of ALL) {
    assert.doesNotMatch(text, /\/Users\/|\/home\//, `${name}: a path outside ~`);
    assert.doesNotMatch(JSON.stringify(golden(name)), /\/Users\/|\/home\//, `${name}.golden: a path outside ~`);
    for (const p of state.projects) for (const b of p.file.bots) assert.equal(b.instructions ?? "", "", `${name}: ${b.id} instructions`);
    // No session ids, command lines or screen text: none of the fields that carry them.
    assert.doesNotMatch(text, /"(argv|foreground|records|screen|claude_session|codex_thread|token)"|--resume|sk-[A-Za-z0-9]{8}/, name);
  }
});

// This repo is public, so a fixture is anonymised. Structure checked here: machines are
// machine-N, folders are herdr-bots' or a project-x placeholder, worktrees are branch-N.
const PLACEHOLDER = /^~\/workspace\/repos\/project-[a-z]+$/;
const BRANCH = /^branch-\d+$/;
const HERDR_BOTS = /^~\/workspace\/repos\/herdr-bots(\/.*)?$/;
const MACHINE = /^machine-\d+$/;
function folderOk(f) {
  if (f === "" || f === "~" || HERDR_BOTS.test(f)) return true;
  const w = /^(.*)\.worktrees\/([^/]+)$/.exec(f);
  return w ? PLACEHOLDER.test(w[1]) && BRANCH.test(w[2]) : PLACEHOLDER.test(f);
}

test("fixtures are anonymised: machines machine-N, folders herdr-bots or project-x, worktrees branch-N", () => {
  for (const { name, state } of ALL) {
    const machines = [...state.spaces.map((s) => s.machine), ...state.projects.map((p) => p.machine)].filter((m) => m != null);
    for (const t of state.terminals) for (const a of [t.address, t.parent]) if (a?.includes("/")) machines.push(a.split("/")[0]);
    for (const s of state.spaces) for (const id of [s.id, ...s.tabs.flatMap((t) => [t.id, ...t.panes.flatMap((p) => [p.pane, p.terminal])])]) {
      if (id?.includes("/")) machines.push(id.split("/")[0]);
    }
    for (const m of machines) assert.match(m, MACHINE, `${name}: machine ${m}`);
    const folders = [...state.terminals.map((t) => t.cwd), ...state.spaces.map((s) => s.folder), ...state.projects.map((p) => p.key), ...state.registry];
    for (const f of folders.filter((x) => x != null)) assert.ok(folderOk(f), `${name}: folder ${f}`);
  }
});

// Every string of a fixture, its words and runs of up to 8 words, lowercased.
function candidates(value) {
  const out = new Set();
  const walk = (v) => {
    if (typeof v === "string") {
      const s = v.toLowerCase();
      out.add(s);
      const words = s.split(/[\s/·|,:()"]+/).filter(Boolean);
      for (const w of words) { out.add(w); for (const p of w.split(".")) out.add(p); }
      for (let n = 2; n <= 8; n++) for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return out;
}

// Optional, local only: SIDEBAR_PRIVATE_LIST=<file outside the repo, one private string per line> checks none is in a fixture.
test("fixtures hold none of the strings in SIDEBAR_PRIVATE_LIST (local check)", (t) => {
  const list = process.env.SIDEBAR_PRIVATE_LIST;
  if (!list) { t.skip("SIDEBAR_PRIVATE_LIST is not set: the private-string check runs only locally"); return; }
  const repo = fileURLToPath(new URL("../", import.meta.url));
  assert.ok(!resolve(list).startsWith(repo), "SIDEBAR_PRIVATE_LIST must point outside the repo");
  const words = readFileSync(list, "utf8").split("\n").map((l) => l.trim().toLowerCase()).filter(Boolean);
  for (const { name, state } of ALL) {
    for (const [what, value] of [[name, state], [`${name}.golden`, golden(name)]]) {
      const found = candidates(value);
      assert.deepEqual(words.filter((w) => found.has(w)), [], `${what}: holds a private string`);
    }
  }
});

test("R3 golden: each recorded space's rows under the default folds", () => {
  for (const { name, state } of ALL) {
    const want = golden(name).rows;
    const got = Object.fromEntries(view(state).map((v) => [v.space.id, { name: v.space.name, rows: v.rows.map((d) => `${d.kind} ${d.id}`) }]));
    assert.deepEqual(got, want, name);
  }
});

test("R3: the owner's Automagik Herdr space draws the main bot (t1dp) above the plain omp agent t187", () => {
  const { state } = ALL.find((f) => f.name === "owner-2026-11-02");
  const v = view(state).find((x) => x.space.name === "Automagik Herdr");
  assert.deepEqual(v.rows.map((d) => [d.kind, d.id, d.terminal]), [["main", "b:b-ikfvbmibgh", "t1dp"], ["agent", "a:t187", "t187"]]);
});

test("R3 invariants, every fixture space, all folds open: tree, then agents, then shells; each live terminal once", () => {
  for (const { name, state } of ALL) {
    for (const v of view(state, { open: openAll })) {
      const where = `${name} / ${v.space.name}`;
      const ranks = v.rows.map(rank);
      assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `${where}: a bot below an agent or shell`);
      const terms = v.rows.map((d) => d.terminal).filter(Boolean);
      assert.equal(new Set(terms).size, terms.length, `${where}: a terminal listed twice`);
      for (const p of v.panes) assert.ok(terms.includes(p.address), `${where}: ${p.address} not drawn`);
    }
  }
});

test("R3, parked terminals (live, no pane): each tied to a bot is drawn exactly once in the sidebar; one tied to none is not", () => {
  for (const { name, state } of ALL) {
    const inPane = new Set(state.spaces.flatMap((s) => s.tabs.flatMap((t) => t.panes.map((p) => p.terminal))));
    const known = new Set(state.projects.flatMap((p) => p.file.bots.map((b) => b.id)));
    const byAddress = new Map(state.terminals.map((t) => [t.address, t]));
    // Tied: a live bot's own terminal, or anything started (by hc parent, at any depth) from one.
    const tied = (t, seen = new Set()) => Boolean(t) && !seen.has(t.address)
      && ((known.has(t.labels?.bot) && t.program?.agent) || tied(byAddress.get(t.parent), seen.add(t.address)));
    const drawn = new Map();
    for (const v of view(state, { open: openAll })) for (const d of v.rows) if (d.terminal) drawn.set(d.terminal, (drawn.get(d.terminal) ?? 0) + 1);
    const parked = state.terminals.filter((t) => t.state === "live" && !inPane.has(t.address));
    assert.ok(parked.some((t) => tied(t)), `${name}: the fixture holds parked bots`);
    for (const t of parked) {
      // One tied to no bot (no parent, or its parent gone) has no row: tidy reports it (sidebar-rules Group 2).
      assert.equal(drawn.get(t.address) ?? 0, tied(t) ? 1 : 0, `${name}: parked ${t.address}`);
    }
  }
});

test("the alpha mode's golden space order (D6) is recorded as data: each space once, in its machine group", () => {
  for (const { name, state } of ALL) {
    const alpha = golden(name).goldenSpaceOrder.alpha;
    for (const [group, ids] of Object.entries(alpha)) {
      for (const id of ids) assert.equal(state.spaces.find((s) => s.id === id)?.machine ?? "this computer", group, `${name}: ${id}`);
    }
    assert.deepEqual(Object.values(alpha).flat().sort(), state.spaces.map((s) => s.id).sort(), name);
  }
});

// The plain-data cases the recording doesn't hold.
const look = { character: "star", colour: "blue" };
const bot = (id, more = {}) => ({ id, name: id, kind: "member", look, role: "r", instructions: "", agent: "claude", ...more });
const FILE = parseBots(JSON.stringify({
  version: 1, categories: [{ id: "eng", title: "Engineering" }, { id: "ops", title: "Ops" }],
  bots: [
    bot("b-mainmainma", { kind: "main" }),
    bot("b-opsopsopso", { category: "ops" }),
    bot("b-captaincap", { category: "eng", rank: "captain" }),
    bot("b-devdevdevd", { lead: "b-captaincap", rank: "dev" }),
  ],
})).file;
const live = { "b-mainmainma": { terminal: "t1" }, "b-captaincap": { terminal: "t2" }, "b-devdevdevd": { terminal: "t3" } };
const T = (address, parent = null) => ({ address, parent, state: "live", labels: {}, program: { key: "codex", agent: true } });
const terminals = [T("t1"), T("t2"), T("t3"), T("t9", "t3"), T("t10", "t9"), T("t20"), T("t21", "t20")];
const tree = buildTree({ projects: [{ key: "/p", file: FILE, spaces: ["s1"] }], live, terminals, now: 0 })[0];

test("spaceRowOrder: main bot, categories in file order with captains then members, helpers beneath, agents, shells", () => {
  const rows = spaceRowOrder({
    tree, open: openAll(tree),
    agents: [{ terminal: "t20", subs: [{ terminal: "t21", depth: 0 }] }],
    shells: [{ terminal: "t30" }],
  });
  assert.deepEqual(rows.map((d) => `${d.kind} ${d.id} ${d.depth}`), [
    "main b:b-mainmainma 0", "category c:[null,\"/p\"]:eng 1", "bot b:b-captaincap 1", "bot b:b-devdevdevd 2",
    "helper h:t9 4", "helper h:t10 5", "category c:[null,\"/p\"]:ops 1", "bot b:b-opsopsopso 1",
    "agent a:t20 0", "agent a:t21 1", "shell s:t30 0",
  ]);
});

test("spaceRowOrder: a bot's helper (folded or not) or pane is never listed again as an agent or shell", () => {
  const rows = spaceRowOrder({
    tree, // default folds: the captain is folded, its member and helpers hidden
    agents: [{ terminal: "t9", subs: [{ terminal: "t10", depth: 0 }] }, { terminal: "t2" }, { terminal: "t20" }],
    shells: [{ terminal: "t3" }, { terminal: "t30" }],
  });
  assert.deepEqual(rows.filter((d) => !TREE.has(d.kind)).map((d) => d.id), ["a:t20", "s:t30"]);
});

test("spaceRowOrder: no tree places agents then shells; nothing given draws nothing", () => {
  assert.deepEqual(spaceRowOrder({ agents: [{ terminal: "a" }], shells: [{ terminal: "s" }] }).map((d) => d.id), ["a:a", "s:s"]);
  assert.deepEqual(spaceRowOrder(), []);
});
