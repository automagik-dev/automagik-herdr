// md-menu's contract, driven through a stub runtime: what the terminal printed becomes rows, a
// missing path stays hidden, and a click opens or re-points the preview the way the shared keys say.
// Not Herdr itself — the in-app check in RECIPE.md still applies.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerHooks } from "node:module";

const stubs = {
  herdr: new URL("./md-menu-herdr.mjs", import.meta.url).href,
  "gpui-kit": new URL("./gpui-stub.mjs", import.meta.url).href,
  "gpui-base": new URL("./gpui-stub.mjs", import.meta.url).href,
};
const fromMod = (context) => context.parentURL?.includes("/mods/md-menu/");
registerHooks({
  resolve: (specifier, context, next) =>
    stubs[specifier] && fromMod(context) ? { url: stubs[specifier], shortCircuit: true } : next(specifier, context),
});

const herdr = await import(stubs.herdr);
const { state } = herdr;
const { default: MdMenu } = await import("../mods/md-menu/main.js");
const { index, textOf, nodes } = await import(stubs["gpui-kit"]);

const SLOTS = "markdown-browser.slots";
const SHOW = "markdown-browser.show";
const LAST = "markdown-browser.last";

// A context like Herdr's: spawn runs the task, timers never fire, sleeps resolve so the polling
// loops in reveal() can finish inside the test.
const cxFor = () => {
  const cx = {
    spawn: (fn) => { fn(cx); },
    timer: { every: () => ({ cancel() {} }) },
    focus_handle: () => ({ focus() {} }),
    sleep: async () => {},
    notify: () => {},
    stop_propagation: () => {},
  };
  return cx;
};
// The mod shells out (hc, git, one sh per open), so settling means real time, not microtasks.
const settle = async (ms = 400) => { const end = Date.now() + ms; while (Date.now() < end) await new Promise((r) => setTimeout(r, 5)); };

function reset({ props, panes, printed = "", on = null }) {
  state.shared.clear();
  state.runs.length = 0;
  state.hcCalls.length = 0;
  state.notes.length = 0;
  herdr.ui.props = props;
  herdr.ui.panes = panes;
  herdr.ui.closed = 0;
  state.hcAnswer = () => ({ code: 0, stdout: printed, stderr: "" });
}

// A directory to resolve paths against, with the file a terminal "printed".
const folder = () => {
  const dir = mkdtempSync(join(tmpdir(), "md-menu-"));
  writeFileSync(join(dir, "NOTES.md"), "# Notes\n");
  return dir;
};

test("the menu lists the Markdown the terminal printed, and hides a path that is not there", async () => {
  const dir = folder();
  const pane = { pane: "p1", tab: "t1", terminal: "t1", focused: true, cwd: dir };
  reset({ props: { tab: "pane", target: { pane: "p1" } }, panes: [pane], printed: `opened ${dir}/NOTES.md\n` });
  state.focused = { tab: "t1", pane: "p1" };
  const view = new MdMenu();
  view.init(null, cxFor());
  await settle();
  const drawn = textOf(view.render(cxFor()));
  assert.match(drawn, /NOTES\.md/, "the printed file is a row");
  assert.match(drawn, /Markdown in this terminal/);

  // A path the terminal printed but that is not on disk never becomes a row.
  reset({ props: { tab: "pane", target: { pane: "p1" } }, panes: [pane], printed: "see /nope/MISSING.md\n" });
  state.focused = { tab: "t1", pane: "p1" };
  const spent = new MdMenu();
  spent.init(null, cxFor());
  await settle();
  const empty = textOf(spent.render(cxFor()));
  assert.doesNotMatch(empty, /MISSING\.md/);
  assert.match(empty, /No Markdown files in this terminal/);
});

test("a click splits a new pane to the right, as md-menu, and records its slot", async () => {
  const dir = folder();
  const pane = { pane: "p1", tab: "t1", terminal: "t1", focused: true, cwd: dir };
  reset({ props: { tab: "pane", target: { pane: "p1" } }, panes: [pane], printed: `opened ${dir}/NOTES.md\n` });
  state.focused = { tab: "t1", pane: "p1" };
  const view = new MdMenu();
  view.init(null, cxFor());
  await settle();
  index(view.render(cxFor()));
  assert.ok(nodes.get("mm-0"), "the first Markdown row is drawn");
  nodes.get("mm-0").click(null, cxFor());
  // The app creates the pane within the same turn; the mod polls for it before it will record it.
  herdr.ui.panes = [...herdr.ui.panes, { pane: "p2", tab: "t1", mod: "md-menu" }];
  await settle();

  const split = state.runs.find(([name]) => name === "pane.split");
  assert.ok(split, "the panes were split");
  const args = split[1];
  assert.equal(args.direction, "right");
  assert.equal(args.mod, "md-menu", "the preview is this mod now, not markdown-browser");
  assert.equal(args.pane, "p1", "beside the pane that was clicked");
  assert.equal(args.props.file, join(dir, "NOTES.md"));
  assert.ok(args.props.slot, "the new pane carries a slot");
  assert.equal(herdr.ui.closed, 1, "the popup closes once the work has started");

  assert.deepEqual(state.shared.get(SLOTS), { p2: args.props.slot });
  assert.deepEqual(state.shared.get(SHOW), { [args.props.slot]: { file: join(dir, "NOTES.md"), on: null } });
  assert.ok(state.shared.has(LAST), "the tab's focused preview is recorded");
});

test("a second click switches the tab's preview in place instead of splitting again", async () => {
  const dir = folder();
  const pane = { pane: "p1", tab: "t1", terminal: "t1", focused: true, cwd: dir };
  const preview = { pane: "p2", tab: "t1", mod: "md-menu", focused: true };
  reset({ props: { tab: "pane", target: { pane: "p1" } }, panes: [pane, preview], printed: `opened ${dir}/NOTES.md\n` });
  state.focused = { tab: "t1", pane: "p1" };
  state.shared.set(SLOTS, { p2: "s1" });
  const view = new MdMenu();
  view.init(null, cxFor());
  await settle();
  index(view.render(cxFor()));
  nodes.get("mm-0").click(null, cxFor());
  await settle();

  assert.equal(state.runs.some(([name]) => name === "pane.split"), false, "no new pane");
  assert.deepEqual(state.shared.get(SHOW), { s1: { file: join(dir, "NOTES.md"), on: null } }, "the slot is re-pointed");
  assert.deepEqual(state.runs.find(([name]) => name === "pane.focus")?.[1], { pane: "p2" });
});
