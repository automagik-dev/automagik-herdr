// The Space Row's view models (spaceRow.js) against the final feed sample
// (test/fixtures/herdr-meter-space.sample.json, a copy of the owner-approved handoff fixture):
// every format of docs/space-row-rendering.md, arrows, "–" for null and missing, a missing
// project, a truncated doc, an unknown space.version, and the pie geometry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DASH, readFeed, projectOf, lineTwo, cardsOf, botCard, namesOf, arrowOf, fmtCount, fmtMinutes, fmtShare,
  fmtUsd, fmtTokens, fmtAsOf, scaleColor, scaleK, colorOf, pieAngles, sliceAt, polar, fetchFeed, bandLabel, DETAIL_ROWS,
  projectIndex, spaceProject,
} from "../mods/am-sidebar/spaceRow.js";

const TEXT = readFileSync(new URL("./fixtures/herdr-meter-space.sample.json", import.meta.url), "utf8");
const DOC = JSON.parse(TEXT);
const P = "/work/example-project";
const clone = () => JSON.parse(TEXT);
const utc = (d) => [d.getUTCHours(), d.getUTCMinutes()];
const feed = readFeed(DOC);

test("formats follow the rules table", () => {
  assert.equal(fmtCount(7), "7");
  assert.deepEqual([9, 38, 59.4, 59.5, 60, 65, 240, 1600].map(fmtMinutes), ["9m", "38m", "59m", "1h", "1h", "1h 5m", "4h", "26h 40m"]);
  assert.deepEqual([0, 0.004, 0.01, 0.09, 0.57, 0.995].map(fmtShare), ["0%", "<1%", "1%", "9%", "57%", "100%"]);
  assert.deepEqual([0, 0.004, 2.6, 9.999, 18.4, 105.2, 1234].map(fmtUsd), ["$0.00", "<$0.01", "$2.60", "$10.00", "$18", "$105", "$1.2k"]);
  assert.deepEqual([310, 90000, 120000, 10290000, 150000000, 1.234e9].map(fmtTokens), ["310", "90.0k", "120k", "10.3M", "150M", "1.2B"]);
  assert.equal(fmtAsOf("2026-11-02T18:30:00Z", utc), "as of 18:30");
  assert.equal(fmtAsOf("not a date"), null);
});

test("null and missing are –, never 0; 0 is a value", () => {
  for (const f of [fmtCount, fmtMinutes, fmtShare, fmtUsd, fmtTokens]) {
    assert.equal(f(null), DASH);
    assert.equal(f(undefined), DASH);
    assert.equal(f("3"), DASH);
  }
  assert.equal(fmtUsd(0), "$0.00");
  assert.equal(fmtMinutes(0), "0m");
});

test("arrows: direction by value, colour by the chip; equal or null is none", () => {
  assert.deepEqual(arrowOf(7, 5, true), { dir: "up", glyph: "▲", good: true });
  assert.deepEqual(arrowOf(38, 55, false), { dir: "down", glyph: "▼", good: true });
  assert.equal(arrowOf(5, 5, true), null);
  assert.equal(arrowOf(null, 5, true), null);
  assert.equal(arrowOf(5, undefined, true), null);
});

test("readFeed takes the doc, hc doc get's {value, version} and a JSON-RPC reply", () => {
  assert.equal(feed.space.version, 1);
  assert.equal(feed.generatedAt, "2026-11-02T18:30:00Z");
  assert.equal(feed.truncated, false);
  assert.equal(readFeed(TEXT).space.version, 1);
  assert.equal(readFeed({ value: DOC, version: 9 }).space.version, 1);
  assert.equal(readFeed(JSON.stringify({ id: 1, jsonrpc: "2.0", result: { value: DOC, version: 9 } }) + "\n").space.version, 1);
});

test("an unknown space.version, no space key, or a broken doc renders nothing", () => {
  const v2 = clone(); v2.space.version = 2;
  const none = clone(); delete none.space;
  for (const bad of [v2, none, TEXT.slice(0, 700), "", null, 42, "[]", { result: { value: null } }]) {
    const f = readFeed(bad);
    assert.equal(f, null);
    assert.equal(lineTwo(f, P), null);
    assert.equal(cardsOf(f, P), null);
    assert.equal(botCard(f, P, "b-example-captain"), null);
  }
});

test("line 2: forge, merges, time, first pass, spent, tokens, each with only its arrow", () => {
  const chips = lineTwo(feed, P);
  assert.deepEqual(chips.map((c) => [c.key, c.icon, c.value, c.arrow && `${c.arrow.glyph}${c.arrow.good ? "good" : "bad"}`]), [
    ["forge", "github", null, null],
    ["merges", "merge", "7", "▲good"],
    ["time", "clock", "38m", "▼good"],
    ["first_pass", "first", "57%", "▲good"],
    ["spent", "spent", "9%", "▼good"],
    ["tokens", "tokens", "10.3M", "▲bad"],
  ]);
  // A trailing slash on the space's path finds the same project.
  assert.equal(lineTwo(feed, `${P}/`).length, 6);
});

test("a project missing from the feed has no line 2 and no cards", () => {
  assert.equal(projectOf(feed, "/work/elsewhere"), null);
  assert.equal(lineTwo(feed, "/work/elsewhere"), null);
  assert.equal(cardsOf(feed, "/work/elsewhere"), null);
});

test("null sections: – with no arrow, no forge chip", () => {
  const d = clone();
  const p = d.space.projects[P];
  p.merges = null;
  p.time.median_min = null;
  p.first_pass = { share: 0.5, prev_share: null };
  delete p.spent;
  const chips = lineTwo(readFeed(d), P);
  assert.deepEqual(chips.map((c) => [c.key, c.value, c.na, c.arrow]), [
    ["merges", DASH, true, null],
    ["time", DASH, true, null],
    ["first_pass", "50%", false, null],
    ["spent", DASH, true, null],
    ["tokens", "10.3M", false, chips[4].arrow],
  ]);
  const cards = cardsOf(readFeed(d), P);
  // A whole null or missing section: the "–" header and nothing else.
  for (const [key, title] of [["merges", "Merged"], ["spent", "Spent, 24 h"]]) {
    assert.deepEqual(cards[key], { key, icon: cards[key].icon, title, big: DASH, was: null, empty: true, pie: [], foot: null });
  }
  // A section with a null field is not empty: its card still has a body.
  assert.equal(cards.time.empty, undefined);
  assert.equal(cards.time.big, DASH);
  assert.equal(cards.time.stats.length, 3);
  d.space.projects[P].time = null;
  const time = cardsOf(readFeed(d), P).time;
  assert.equal(time.empty, true);
  assert.equal(time.stats, undefined);
  assert.equal(time.sub, undefined);
});

test("a missing band label is \"band N\"; the merges detail cap is 9", () => {
  assert.equal(bandLabel(["<15m", null, ""], 0), "<15m");
  assert.deepEqual([1, 2, 5].map((i) => bandLabel(["<15m", null, ""], i)), ["band 2", "band 3", "band 6"]);
  assert.equal(bandLabel(undefined, 0), "band 1");
  const d = clone();
  delete d.space.projects[P].time.bands_labels;
  const pie = cardsOf(readFeed(d), P).time.pie;
  assert.deepEqual(pie.map((s) => s.label), ["band 1", "band 2", "band 3", "band 4", "band 5", "band 6"]);
  assert.equal(pie[1].detail.title, "band 2: 2");
  assert.equal(DETAIL_ROWS, 9);
});

test("space to project: bots.json project, else the repo's main checkout; none nested or remote", () => {
  const index = projectIndex([
    { key: "/work/a", machine: null, spaces: ["s1", "s2"], file: { bots: [] } },
    { key: "/work/b", machine: null, spaces: ["s2"], file: null },
    { key: "/work/a", machine: "vps", spaces: ["s9"], file: null },
  ]);
  assert.deepEqual([...index.space], [["s1", "/work/a"], ["s2", "/work/a"]]);
  assert.deepEqual([...index.file.keys()], ["/work/a", "/work/b"]);
  const repo = (on, dir) => JSON.stringify([on, dir]);
  // Listed by a bots.json project: its key, whatever the repo says.
  assert.equal(spaceProject({ space: { id: "s1" }, repo: repo(null, "/elsewhere/.git"), index }), "/work/a");
  // Not listed: the parent of git's common dir (a worktree's common dir is its main checkout's).
  assert.equal(spaceProject({ space: { id: "s3" }, repo: repo(null, "/work/c/.git"), index }), "/work/c");
  assert.equal(spaceProject({ space: { id: "s3" }, repo: repo(null, "/work/c/.git/"), index }), "/work/c");
  // A bare repo or submodule common dir, no repo, another machine's look: none.
  assert.equal(spaceProject({ space: { id: "s3" }, repo: repo(null, "/work/c.git"), index }), null);
  assert.equal(spaceProject({ space: { id: "s3" }, repo: null, index }), null);
  assert.equal(spaceProject({ space: { id: "s3" }, repo: repo("vps", "/work/c/.git"), index }), null);
  assert.equal(spaceProject({ space: { id: "s3" }, repo: "not json", index }), null);
  // A worktree row nested under its repo's row, and a space on another machine: no line 2.
  assert.equal(spaceProject({ space: { id: "s1" }, nested: true, repo: repo(null, "/work/a/.git"), index }), null);
  assert.equal(spaceProject({ space: { id: "s1", machine: "vps" }, index }), null);
  // The sample's project resolves to line 2 from the repo fallback alone.
  assert.equal(lineTwo(feed, spaceProject({ space: { id: "x" }, repo: repo(null, `${P}/.git`), index })).length, 6);
});

test("cards carry feed fields only, formatted", () => {
  const c = cardsOf(feed, P);
  assert.deepEqual([c.merges.big, c.merges.was], ["7", "was 5"]);
  assert.deepEqual(c.merges.pie.map((s) => [s.key, s.inside, s.color.token]), [["feat", "3", "ansi13"], ["fix", "3", "ansi11"], ["test", "1", "ansi14"]]);
  assert.deepEqual(c.merges.pie[0].detail.rows, [{ task: "gh-45", url: "https://github.com/example/example-project/pull/45", value: "42m" }]);
  assert.deepEqual([c.time.big, c.time.was], ["38m", "was 55m"]);
  assert.deepEqual(c.time.pie.map((s) => [s.label, s.inside, s.color.k]), [["<15m", "1", 0], ["15-30m", "2", 0.2], ["30m-1h", "2", 0.4], ["1-2h", "1", 0.6], ["2-6h", "1", 0.8], [">6h", "0", 1]]);
  assert.deepEqual(c.time.stats.map((s) => [s.label, s.task, s.value]), [["fastest", "gh-50", "9m"], ["average", null, "1h 1m"], ["slowest", "gh-31", "4h"]]);
  assert.equal(c.time.stats[0].url, "https://github.com/example/example-project/pull/50");
  assert.deepEqual([c.first_pass.big, c.first_pass.was], ["57%", "was 40%"]);
  assert.deepEqual(c.first_pass.pie.map((s) => [s.label, s.inside]), [["first try", "4"], ["1 fix", "2"], ["2 fixes", "1"], ["3+ fixes", "0"]]);
  assert.deepEqual([c.spent.big, c.spent.was, c.spent.sub], ["$18", "was $22", "9% of a Codex week"]);
  assert.deepEqual(c.spent.pie.map((s) => [s.key, s.legend, s.value]), [["example-codex-model", "$12", 12], ["example-claude-model", DASH, 0], ["example-deepseek-model", "$6.40", 6.4]]);
  assert.deepEqual([c.tokens.big, c.tokens.was, c.tokens.sub], ["10.3M", "was 8.7M", "cache hit 88%"]);
  assert.deepEqual(c.tokens.pie[0].detail.cells, [["input", "1.2M"], ["output", "90.0k"], ["cache read", "9.0M"], ["turns", "310"], ["reasoning", "31%"], ["cache hit", "88%"]]);
  // The same model has the same colour in both cards.
  assert.equal(c.spent.pie.find((s) => s.key === "example-codex-model").color.token, c.tokens.pie[0].color.token);
  assert.equal(c.merges.foot.startsWith("as of "), true);
});

test("a truncated doc says so in every card's footer", () => {
  const d = clone(); d.space.truncated = true;
  const f = readFeed(d);
  assert.equal(f.truncated, true);
  for (const card of Object.values(cardsOf(f, P))) assert.match(card.foot, /lists trimmed to fit$/);
  assert.match(botCard(f, P, "b-example-captain").foot, /lists trimmed to fit$/);
  assert.doesNotMatch(cardsOf(feed, P).merges.foot, /trimmed/);
});

test("bot card: three numbers, one bar, the legend with $; names by parts_kind", () => {
  const names = namesOf({ bots: [{ id: "b-example-dev", name: "Dev" }, { id: "b-example-captain", name: "Captain" }], categories: [] });
  const c = botCard(feed, P, "b-example-captain", names);
  assert.equal(c.title, "Captain");
  assert.deepEqual(c.cells, [["$ / task", "$2.60"], ["time / task", "38m"], ["24 h", "$18"]]);
  assert.deepEqual(c.legend.map((x) => [x.label, x.value, x.color.token]), [["Dev", "$9.10", "ansi4"], ["b-example-test", "$8.10", "ansi6"], ["other", "$1.20", "dim"]]);
  assert.equal(c.bar.length, 3);
  assert.ok(Math.abs(c.bar.reduce((a, x) => a + x.share, 0) - 1) < 1e-9);
  assert.equal(c.empty, false);
});

test("bot card: null is –, 0 is $0.00, no parts is no bar", () => {
  const leaf = botCard(feed, P, "b-example-leaf");
  assert.deepEqual(leaf.cells, [["$ / task", DASH], ["time / task", DASH], ["24 h", "$0.00"]]);
  assert.deepEqual(leaf.bar, []);
  assert.equal(leaf.empty, true);
});

test("bot card: a missing bot or project is – everywhere", () => {
  for (const [path, id] of [[P, "b-nobody"], ["/work/elsewhere", "b-example-captain"]]) {
    const c = botCard(feed, path, id, undefined, "Someone");
    assert.equal(c.title, "Someone");
    assert.deepEqual(c.cells.map(([, v]) => v), [DASH, DASH, DASH]);
    assert.deepEqual(c.bar, []);
  }
});

test("bot card: category parts take the category's title", () => {
  const d = clone();
  d.space.projects[P].bots.main = { parts_kind: "category", parts: [{ key: "eng", usd: 3 }, { key: "ops", usd: null }] };
  const c = botCard(readFeed(d), P, "main", namesOf({ bots: [], categories: [{ id: "eng", title: "Engineering" }] }));
  assert.deepEqual(c.legend.map((x) => [x.label, x.value]), [["Engineering", "$3.00"], ["ops", DASH]]);
  assert.deepEqual(c.bar.map((x) => [x.key, x.share]), [["eng", 1]]);
});

test("cost scale: theme anchors, exact stops from the rules table", () => {
  const dark = { ansi2: "#009957", ansi3: "#ff9800", ansi1: "#e64d5d" };
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => scaleColor(scaleK(i, 6), dark)), ["#009957", "#669934", "#cc9811", "#fa8913", "#f06b38", "#e64d5d"]);
  assert.deepEqual([0, 1, 2, 3].map((i) => scaleColor(scaleK(i, 4), dark)), ["#009957", "#aa981d", "#f77f1f", "#e64d5d"]);
  assert.equal(colorOf({ token: "ansi13" }, { ansi13: "#976ee6" }), "#976ee6");
  assert.equal(colorOf({ k: 0 }, dark), "#009957");
  assert.equal(scaleColor(0.5, { dim: "#666666" }), "#666666");
});

test("fetchFeed: hc doc get first, doc.get over hc connect on an older hc, null when both fail", async () => {
  const calls = [];
  const ok = { code: 0, stdout: TEXT, stderr: "" };
  const usage = { code: 2, stdout: '{"error":{"kind":"usage","message":"unrecognized subcommand \'doc\'"}}', stderr: "" };
  assert.equal(await fetchFeed({ hc: async (a) => (calls.push(["hc", ...a]), ok), exec: async () => assert.fail("no fallback") }), TEXT);
  assert.deepEqual(calls, [["hc", "doc", "get", "herdr-meter", "--json"]]);
  let script = null;
  const viaConnect = await fetchFeed({ hc: async () => usage, exec: async (cmd, args) => { script = [cmd, ...args]; return { code: 0, stdout: `{"id":1,"result":{"value":${TEXT}}}\n` }; } });
  assert.equal(readFeed(viaConnect).space.version, 1);
  assert.equal(script[0], "sh");
  assert.match(script[2], /"method":"doc.get","params":\{"name":"herdr-meter"\}/);
  assert.match(script[2], /connect \| head -n 1$/);
  assert.equal(await fetchFeed({ hc: async () => { throw new Error("no hc"); }, exec: async () => { throw new Error("no sh"); } }), null);
  assert.equal(await fetchFeed({ hc: async () => usage, exec: async () => ({ code: 1, stdout: "" }) }), null);
});

test("pie: 12 o'clock clockwise, zero slices empty, the slice under the pointer", () => {
  const a = pieAngles([1, 0, 3]);
  assert.equal(a[0].start, 0);
  assert.equal(a[1].start, a[1].end);
  assert.ok(Math.abs(a[2].end - 2 * Math.PI) < 1e-9);
  assert.deepEqual(a.map((s) => s.show), [true, false, true]);
  // Right of centre is a quarter turn: inside the big slice (from 90 degrees on).
  assert.equal(sliceAt(a, 90, 50, 50, 50, 45), 2);
  // Just right of 12 o'clock: the first slice.
  assert.equal(sliceAt(a, 52, 20, 50, 50, 45), 0);
  assert.equal(sliceAt(a, 0, 0, 50, 50, 45), -1);
  const [x, y] = polar(50, 50, 10, Math.PI / 2);
  assert.ok(Math.abs(x - 60) < 1e-9 && Math.abs(y - 50) < 1e-9);
  assert.deepEqual(pieAngles([0, 0]).map((s) => s.end), [0, 0]);
});
