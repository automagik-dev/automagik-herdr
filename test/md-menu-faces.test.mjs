// md-menu's contract, driven through a stub runtime: what the terminal printed becomes rows, a
// missing path stays hidden, and a click opens or re-points the preview the way the shared keys say.
// Not Herdr itself — the in-app check in RECIPE.md still applies.
//
// Determinism: the mod shells out (`hc`, `git`, one `sh` per open), so nothing here waits a fixed
// time. Every assertion is preceded by `until(predicate)`, and each case waits for the previous
// case's spawned work to settle before it resets the shared stub state — a late `reveal` from one
// case must not write into the next one's `slots`/`show`.
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

// Every task this file's views spawn, so a case can wait for its work to finish before the next
// one resets the shared state. The preview's folder watch never resolves, so the wait is bounded.
let spawned = [];
const cxFor = () => {
  const cx = {
    // Run the task now and capture it, as Herdr does: a view relies on it having started (and on
    // having taken its "before" snapshot) by the time the click handler returns.
    spawn: (fn) => {
      let p;
      try {
        p = Promise.resolve(fn(cx));
      } catch (e) {
        p = Promise.reject(e);
      }
      spawned.push(p.catch(() => {}));
      return p;
    },
    timer: { every: () => ({ cancel() {} }) },
    focus_handle: () => ({ focus() {} }),
    sleep: async () => {},
    notify: () => {},
    stop_propagation: () => {},
  };
  return cx;
};

/** Waits for `predicate` to hold, polling; never a fixed sleep. */
async function until(predicate, what, timeout = 20000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Lets the previous case's spawned work finish (bounded: a folder watch never resolves). */
async function quiesce() {
  const batch = spawned;
  spawned = [];
  await Promise.race([Promise.allSettled(batch), new Promise((r) => setTimeout(r, 2000))]);
}

async function reset({ props, panes, printed = "" }) {
  await quiesce();
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

const menuView = async (dir) => {
  const pane = { pane: "p1", tab: "t1", terminal: "t1", focused: true, cwd: dir };
  await reset({ props: { tab: "pane", target: { pane: "p1" } }, panes: [pane], printed: `opened ${dir}/NOTES.md\n` });
  state.focused = { tab: "t1", pane: "p1" };
  const view = new MdMenu();
  view.init(null, cxFor());
  await until(() => view.marks.length === 1, "the printed file to become a row");
  return view;
};

test("the menu lists the Markdown the terminal printed, and hides a path that is not there", async () => {
  const dir = folder();
  const view = await menuView(dir);
  assert.match(textOf(view.render(cxFor())), /NOTES\.md/, "the printed file is a row");
  assert.match(textOf(view.render(cxFor())), /Markdown in this terminal/);

  // A path the terminal printed but that is not on disk never becomes a row.
  const pane = { pane: "p1", tab: "t1", terminal: "t1", focused: true, cwd: dir };
  await reset({ props: { tab: "pane", target: { pane: "p1" } }, panes: [pane], printed: "see /nope/MISSING.md\n" });
  state.focused = { tab: "t1", pane: "p1" };
  const spent = new MdMenu();
  spent.init(null, cxFor());
  await until(() => spent.note === "No Markdown files in this terminal", "the empty-menu note");
  const empty = textOf(spent.render(cxFor()));
  assert.doesNotMatch(empty, /MISSING\.md/);
  assert.match(empty, /No Markdown files in this terminal/);
});

test("a click splits a new pane to the right, as md-menu, and records its slot", async () => {
  const dir = folder();
  const view = await menuView(dir);
  index(view.render(cxFor()));
  assert.ok(nodes.get("mm-0"), "the first Markdown row is drawn");
  nodes.get("mm-0").click(null, cxFor());
  // The app creates the pane within the same turn; the mod polls for it before it will record it.
  herdr.ui.panes = [...herdr.ui.panes, { pane: "p2", tab: "t1", mod: "md-menu" }];
  await until(() => state.shared.get(SLOTS) && state.shared.get(SHOW), "the slot to be recorded");

  const split = state.runs.find(([name]) => name === "pane.split");
  assert.ok(split, "the panes were split");
  const args = split[1];
  assert.equal(args.direction, "right");
  assert.equal(args.mod, "md-menu", "the preview is this mod now, not markdown-browser");
  assert.equal(args.pane, "p1", "beside the pane that was clicked");
  assert.equal(args.props.file, join(dir, "NOTES.md"));
  assert.ok(args.props.slot, "the new pane carries a slot");
  assert.deepEqual(state.shared.get(SLOTS), { p2: args.props.slot });
  assert.deepEqual(state.shared.get(SHOW), { [args.props.slot]: { file: join(dir, "NOTES.md"), on: null } });
  assert.ok(state.shared.has(LAST), "the tab's focused preview is recorded");
  await until(() => herdr.ui.closed === 1, "the popup to close once the work has started");
});

test("a second click switches the tab's preview in place instead of splitting again", async () => {
  const dir = folder();
  const pane = { pane: "p1", tab: "t1", terminal: "t1", focused: true, cwd: dir };
  const preview = { pane: "p2", tab: "t1", mod: "md-menu", focused: true };
  await reset({ props: { tab: "pane", target: { pane: "p1" } }, panes: [pane, preview], printed: `opened ${dir}/NOTES.md\n` });
  state.focused = { tab: "t1", pane: "p1" };
  state.shared.set(SLOTS, { p2: "s1" });
  const view = new MdMenu();
  view.init(null, cxFor());
  await until(() => view.marks.length === 1, "the printed file to become a row");
  index(view.render(cxFor()));
  assert.ok(nodes.get("mm-0"), "the row is drawn");
  nodes.get("mm-0").click(null, cxFor());
  await until(() => state.shared.get(SHOW)?.s1, "the slot to be re-pointed");

  assert.equal(state.runs.some(([name]) => name === "pane.split"), false, "no new pane");
  assert.deepEqual(state.shared.get(SHOW), { s1: { file: join(dir, "NOTES.md"), on: null } }, "the slot is re-pointed");
  assert.deepEqual(state.runs.find(([name]) => name === "pane.focus")?.[1], { pane: "p2" });
  await until(() => herdr.ui.closed === 1, "the popup to close");
});
