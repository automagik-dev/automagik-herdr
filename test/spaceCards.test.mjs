// The Space Row's elements (spaceCards.js) under `node --test`, with gpui stood in for
// (gpui-stub.mjs): line 2 is one clipped line of chips with only their arrows, each chip's card
// opens under it after 260 ms and closes 350 ms after the pointer leaves, only the last hovered
// card is built, a pie slice pulls out, and the bot card opens from its button only. main.js's
// wiring is checked as text. The look is checked live (herdr-app check, a scratch harness).
import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const here = (f) => new URL(f, import.meta.url).href;
const stubs = { "gpui-kit": here("./gpui-stub.mjs"), "gpui-base": here("./gpui-stub.mjs") };
const fromPack = (context) => context.parentURL?.includes("/mods/am-sidebar/");
registerHooks({
  resolve: (specifier, context, next) => (stubs[specifier] && fromPack(context) ? { url: stubs[specifier], shortCircuit: true } : next(specifier, context)),
});
const { all, textOf } = await import(stubs["gpui-kit"]);
const { OPEN_MS, CLOSE_MS, lineTwoEl, cardEl, statsButtonEl, botCardEl } = await import("../mods/am-sidebar/spaceCards.js");
const { readFeed, lineTwo, cardsOf, botCard, DASH } = await import("../mods/am-sidebar/spaceRow.js");

const DOC = JSON.parse(readFileSync(new URL("./fixtures/herdr-meter-space.sample.json", import.meta.url), "utf8"));
const P = "/work/example-project";
const feed = readFeed(DOC);
const T = { foreground: "#eeeeef", muted: "#9b999d", dim: "#6d6a71", popover: "#2c2730", border: "#ffffff18", hover: "#ffffff0e",
  ansi1: "#e64d5d", ansi2: "#009957", ansi3: "#ff9800", ansi4: "#2b85e4", ansi5: "#e44496", ansi6: "#00a592", ansi11: "#ff8a2e",
  ansi13: "#976ee6", ansi14: "#2ee6e0" };
const calls = (node, name) => node.calls.filter(([p]) => p === name);
const handler = (node, name) => calls(node, name)[0]?.[1];
const cx = () => { const c = { notified: 0, stopped: 0 }; c.notify = () => { c.notified++; }; c.stop_propagation = () => { c.stopped++; }; return c; };

test("line 2 is one clipped line: icons, values and only their arrows", () => {
  const ui = { lastCard: null, pie: null };
  const el = lineTwoEl(lineTwo(feed, P), cardsOf(feed, P), "s1", T, ui);
  const root = el.__node;
  assert.ok(calls(root, "overflow_hidden").length && calls(root, "whitespace_nowrap").length, "clips, never wraps");
  assert.equal(calls(root, "flex_wrap").length, 0);
  assert.equal(textOf(el), ["7", "▲", "38m", "▼", "57%", "▲", "9%", "▼", "10.3M", "▲"].join(" "));
  const chips = all(el).filter((n) => String(n.id ?? "").startsWith("chip-s1-"));
  assert.deepEqual(chips.map((n) => n.id), ["chip-s1-forge", "chip-s1-merges", "chip-s1-time", "chip-s1-first_pass", "chip-s1-spent", "chip-s1-tokens"]);
  for (const c of chips) assert.ok(calls(c, "flex_none").length, `${c.id} never shrinks`);
  // Arrow colours: good green, bad red (tokens went up).
  const arrows = all(el).filter((n) => n.kids[0] === "▲" || n.kids[0] === "▼").map((n) => n.props.color);
  assert.deepEqual(arrows, [T.ansi2, T.ansi2, T.ansi2, T.ansi2, T.ansi1]);
});

test("each chip's card: 260 ms intent, 350 ms close, under the chip; built only once hovered", () => {
  const ui = { lastCard: null, pie: null };
  const cards = cardsOf(feed, P);
  let el = lineTwoEl(lineTwo(feed, P), cards, "s1", T, ui);
  const hcs = all(el).filter((n) => n.kind === "hovercard");
  assert.equal(hcs.length, 5, "the forge chip has no card");
  for (const h of hcs) {
    assert.deepEqual(calls(h, "open_delay")[0], ["open_delay", OPEN_MS]);
    assert.deepEqual(calls(h, "close_delay")[0], ["close_delay", CLOSE_MS]);
    assert.deepEqual(calls(h, "anchor")[0], ["anchor", "top_left"]);
    assert.equal(textOf(h.kids[1]), "", "no card built before a hover");
  }
  assert.deepEqual([OPEN_MS, CLOSE_MS], [260, 350]);
  const merges = all(el).find((n) => n.id === "chip-s1-merges");
  const c = cx();
  handler(merges, "on_hover")(true, c);
  assert.equal(ui.lastCard, "chip-s1-merges");
  assert.equal(c.notified, 1);
  el = lineTwoEl(lineTwo(feed, P), cards, "s1", T, ui);
  const built = all(el).filter((n) => n.kind === "hovercard").map((h) => textOf(h.kids[1]));
  assert.match(built[0], /^Merged 7 was 5/);
  assert.deepEqual(built.slice(1), ["", "", "", ""]);
});

test("a card's pie: hovering a slice pulls it out and shows its detail", () => {
  const ui = { lastCard: null, pie: null };
  const card = cardsOf(feed, P).merges;
  let el = cardEl(card, "m", T, ui);
  const pie = all(el).find((n) => n.id === "m-pie");
  const c = cx();
  // Just right of 12 o'clock is the first slice (feat).
  handler(pie, "on_mouse_move")({ local_position: { x: 62, y: 20 } }, c);
  assert.deepEqual(ui.pie, { id: "m-pie", index: 0 });
  el = cardEl(card, "m", T, ui);
  assert.match(textOf(el), /3 feat gh-45 42m/);
  const fills = all(el).filter((n) => n.kind === "path" && n.arg.path.steps[0] === "fill");
  assert.equal(fills.length, 3);
  // The pulled slice starts away from the centre; the others at it.
  assert.notDeepEqual(fills[0].arg.path.steps[1], ["move_to", 60, 60]);
  assert.deepEqual(fills[1].arg.path.steps[1], ["move_to", 60, 60]);
  assert.equal(fills[1].props.opacity, 0.35);
  handler(pie, "on_hover")(false, c);
  assert.equal(ui.pie.index, -1);
});

test("the bot card opens from its button only, and the button shows only on a hovered row", () => {
  const card = botCard(feed, P, "b-example-captain", undefined, "Captain");
  const ui = { lastCard: null, pie: null };
  const hidden = statsButtonEl(card, "k", false, T, ui).__node;
  const button = hidden.kids[0].__node;
  assert.equal(button.props.opacity, 0);
  assert.deepEqual(calls(hidden, "open_delay")[0], ["open_delay", 260]);
  const c = cx();
  button.click(null, c);
  calls(button, "on_mouse_down")[0][2](null, c);
  assert.equal(c.stopped, 2, "neither the click nor the press reaches the row");
  handler(button, "on_hover")(true, c);
  const shown = statsButtonEl(card, "k", true, T, ui).__node;
  assert.equal(shown.kids[0].__node.props.opacity, 1);
  assert.match(textOf(shown.kids[1]), /^Captain \$ \/ TASK \$2\.60 TIME \/ TASK 38m 24 H \$18/);
});

test("the bot card: – for null, $0.00 for 0, no bar without parts", () => {
  const leaf = botCardEl(botCard(feed, P, "b-example-leaf", undefined, "Leaf"), "l", T);
  assert.match(textOf(leaf), new RegExp(`^Leaf \\$ / TASK ${DASH} TIME / TASK ${DASH} 24 H \\$0\\.00 no breakdown yet`));
  const cap = botCardEl(botCard(feed, P, "b-example-captain", undefined, "Captain"), "c", T);
  assert.match(textOf(cap), /b-example-dev \$9\.10 b-example-test \$8\.10 other \$1\.20/);
});

test("main.js reads the feed with hc on a timer, never per render", () => {
  const main = readFileSync(new URL("../mods/am-sidebar/main.js", import.meta.url), "utf8");
  assert.match(main, /cx\.timer\.every\(FEED_EVERY_MS, \(cx\) => this\.feedTick\(cx\)\)/);
  assert.match(main, /fetchFeed\(\{ hc, exec \}\)/);
  const render = main.slice(main.indexOf("  render(cx) {"));
  assert.doesNotMatch(render, /fetchFeed|readFeed/);
});

test("an empty card draws its \u2013 header and nothing else", () => {
  const card = { key: "time", icon: "clock", title: "Worktree \u2192 merge", big: DASH, was: null, empty: true, pie: [], foot: null };
  const el = cardEl(card, "e", T, { lastCard: null, pie: null });
  assert.equal(textOf(el), `Worktree \u2192 merge ${DASH}`);
  assert.equal(all(el).some((n) => n.id === "e-pie"), false);
});

test("the merges detail lists 9 items, then +N", () => {
  const doc = JSON.parse(JSON.stringify(DOC));
  const m = doc.space.projects[P].merges;
  m.items = Array.from({ length: 12 }, (_, i) => ({ task: `gh-${i}`, type: "feat", url: null, lead_min: i }));
  const card = cardsOf(readFeed(doc), P).merges;
  const el = cardEl(card, "m9", T, { lastCard: null, pie: { id: "m9-pie", index: 0 } });
  const text = textOf(el);
  assert.match(text, /gh-8 8m \+3/);
  assert.doesNotMatch(text, /gh-9 /);
});
