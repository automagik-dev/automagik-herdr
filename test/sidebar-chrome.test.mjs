// The footer rail (sidebar-chrome) under a stub runtime: the Bots tab comes first and shows only
// while the sidebar mod is installed, and its popup offers New bot and Bot settings as the sidebar
// mod's own forms. Not Herdr itself: the in-app check in the mod's RECIPE still applies.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerHooks } from "node:module";

const here = (f) => new URL(f, import.meta.url).href;
const stubs = { herdr: here("./footer-herdr.mjs"), "gpui-kit": here("./gpui-stub.mjs"), "gpui-base": here("./gpui-stub.mjs") };
const fromMod = (context) => context.parentURL?.includes("/mods/sidebar-chrome/");
registerHooks({
  resolve: (specifier, context, next) =>
    stubs[specifier] && fromMod(context) ? { url: stubs[specifier], shortCircuit: true } : next(specifier, context),
});

const { state, ui } = await import(stubs.herdr);
const { default: Footer, BOT_FORMS, botsMenuItems } = await import("../mods/sidebar-chrome/main.js");
const { all, index, nodes, textOf } = await import(stubs["gpui-kit"]);

const TABS = new Set(["bots", "mods", "automations", "quota", "pocket", "settings", "machine"]);

function makeCx() {
  const cx = { pending: [], spawn(fn) { const p = Promise.resolve().then(() => fn(cx)); cx.pending.push(p); return p; },
    timer: { every: () => ({ cancel() {} }) }, notify() {}, stop_propagation() {} };
  cx.settle = async () => { while (cx.pending.length) await Promise.allSettled(cx.pending.splice(0)); };
  return cx;
}

async function footer({ sidebar, files = {} }) {
  const root = mkdtempSync(join(tmpdir(), "hb-footer-"));
  state.appHome = root;
  if (sidebar) { mkdirSync(join(root, "mods/spaces-agents"), { recursive: true }); writeFileSync(join(root, "mods/spaces-agents/mod.json"), "{}\n"); }
  for (const [path, body] of Object.entries(files)) { mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), body); }
  ui.props = { footer: true };
  const cx = makeCx();
  const view = new Footer();
  view.init({}, cx);
  await cx.settle();
  rmSync(root, { recursive: true, force: true });
  const drawn = view.render();
  index(drawn);
  // Contributed buttons are keyed <mod>/<id>; their badge is <key>#badge.
  return all(drawn).map((n) => n.id).filter((id) => TABS.has(id) || (typeof id === "string" && id.includes("/") && !id.includes("#")));
}

test("the rail: Bots first, ahead of Mods, Automations and Quota, while the sidebar mod is installed", async () => {
  assert.deepEqual(await footer({ sidebar: true }), ["bots", "mods", "automations", "quota", "settings", "machine"]);
  assert.equal(nodes.get("bots").kids[0].__node.arg, "mods/sidebar-chrome/bot.svg");
});

test("the rail: no Bots tab without mods/spaces-agents/mod.json", async () => {
  assert.deepEqual(await footer({ sidebar: false }), ["mods", "automations", "quota", "settings", "machine"]);
});

test("the Bots tab opens this mod's popup", async () => {
  await footer({ sidebar: true });
  ui.overlays = [];
  nodes.get("bots").click(null, makeCx());
  assert.deepEqual(ui.overlays, [{ mod: "sidebar-chrome", kind: "popup", width: 200, height: 90, props: { botsMenu: true } }]);
});

test("the forms are the sidebar mod's own: create 1000 x 840, the bot list 560 x 0.85, modal dialogs", () => {
  assert.deepEqual(BOT_FORMS.create, { mod: "spaces-agents", kind: "dialog", modal: true, width: 1000, height: 840, props: { form: "create" } });
  assert.deepEqual(BOT_FORMS.pick, { mod: "spaces-agents", kind: "dialog", modal: true, width: 560, height: 0.85, props: { form: "pick" } });
});

function popup() {
  ui.props = { botsMenu: true, overlay: "o3" };
  const cx = makeCx();
  const view = new Footer();
  view.init({}, cx);
  assert.equal(cx.pending.length, 0, "the popup looks nothing up");
  return index(view.render());
}

test("the popup with bots (or before the sidebar has said): New bot and Bot settings, each opening its form", () => {
  for (const defined of [true, undefined]) {
    defined === undefined ? state.shared.delete("bots.defined") : state.shared.set("bots.defined", defined);
    popup();
    assert.deepEqual(botsMenuItems().map((i) => i.label), ["New bot", "Bot settings"]);
    assert.equal(textOf(nodes.get("bots-menu")), "New bot Bot settings");
  }
  for (const [id, form] of [["bots-new", "create"], ["bots-settings", "pick"]]) {
    ui.overlays = [];
    const closed = ui.closed;
    nodes.get(id).click(null, makeCx());
    assert.deepEqual(ui.overlays, [BOT_FORMS[form]]);
    assert.equal(ui.closed, closed + 1, "the popup closes");
  }
});

test("the popup with no bot on this computer: a single New bot line", () => {
  state.shared.set("bots.defined", false);
  popup();
  assert.equal(textOf(nodes.get("bots-menu")), "New bot");
  assert.ok(!nodes.has("bots-settings"));
  ui.overlays = [];
  nodes.get("bots-new").click(null, makeCx());
  assert.deepEqual(ui.overlays, [BOT_FORMS.create]);
  state.shared.delete("bots.defined");
});

// Another mod's button (the Genie board's Tasks), from its own mod.json in the scratch app home.
const TASKS_MOD = {
  "mods/tasks-mock/mod.json": JSON.stringify({ place: "none", automagik: { footer: [
    { id: "tasks", label: "Tasks", icon: "mods/genie-herdr/tasks.svg", command: "mod.open", args: { name: "tasks-mock" }, badge: "genie.tasks.waiting" },
    { id: "broken", label: "No command" },
  ] } }),
  "mods/genie-herdr/tasks.svg": '<svg viewBox="0 0 24 24"><path d="M4 4h16" /></svg>',
};

test("a contributed button: after the pack's own tabs, before the app's, its icon tinted like theirs", async () => {
  state.calls.length = 0;
  assert.deepEqual(await footer({ sidebar: true, files: TASKS_MOD }), ["bots", "mods", "automations", "quota", "tasks-mock/tasks", "settings", "machine"]);
  assert.equal(nodes.get("tasks-mock/tasks").kids[0].__node.kind, "svg");
  assert.equal(nodes.get("tasks-mock/tasks").kids[0].__node.arg, "mods/genie-herdr/tasks.svg");
  assert.ok(!state.calls.some((c) => c.kind === "write"), "the scan writes nothing");
  assert.ok(!state.calls.some((c) => /pocket-link\/(?!mod\.json)/i.test(String(c.path))), "only Pocket Link's own tab lookup");
});

test("a contributed button's press runs its command: mod.open toggles the board", async () => {
  await footer({ sidebar: false, files: TASKS_MOD });
  state.runs.length = 0;
  nodes.get("tasks-mock/tasks").click(null, makeCx());
  assert.deepEqual(state.runs, [["mod.open", { name: "tasks-mock" }]]);
});

test("a contributed button's badge: a count for a number above 0, nothing for 0, a string or null", async () => {
  for (const [value, drawn] of [[3, "3"], [0, null], ["x", null], [null, null]]) {
    state.shared.set("genie.tasks.waiting", value);
    await footer({ sidebar: false, files: TASKS_MOD });
    const badge = nodes.get("tasks-mock/tasks#badge");
    assert.equal(badge ? textOf(badge) : null, drawn, `badge ${JSON.stringify(value)}`);
  }
  state.shared.delete("genie.tasks.waiting");
});

test("a contributed button with a missing icon draws the neutral glyph", async () => {
  const files = { "mods/tasks-mock/mod.json": TASKS_MOD["mods/tasks-mock/mod.json"] };
  await footer({ sidebar: false, files });
  assert.equal(nodes.get("tasks-mock/tasks").kids[0].__node.arg, "mods/sidebar-chrome/circle.svg");
});

test("a mod.json change rescans at once; a batch of other files does not", async () => {
  const batches = [(dir) => [`${dir}/tasks-mock/main.js`], (dir) => [`${dir}/tasks-mock/mod.json`]];
  state.watch = (dir) => (batches.length ? Promise.resolve(batches.shift()(dir)) : Promise.reject(new Error("done")));
  state.calls.length = 0;
  try {
    await footer({ sidebar: false, files: TASKS_MOD });
  } finally {
    delete state.watch;
  }
  const finds = state.calls.filter((c) => c.kind === "exec" && c.command === "find");
  assert.equal(finds.length, 2, "the first look, then the mod.json batch");
});

test("contributed buttons clip in their own group; the rail's own tabs always render, outside it", async () => {
  const four = (name) => ({ [`mods/${name}/mod.json`]: JSON.stringify({ automagik: { footer: [1, 2].map((n) => ({ id: `b${n}`, label: `${name} ${n}`, command: "app.help" })) } }) });
  const ids = await footer({ sidebar: true, files: { ...four("aa"), ...four("bb"), ...four("cc") } });
  assert.deepEqual(ids, ["bots", "mods", "automations", "quota", "aa/b1", "aa/b2", "bb/b1", "bb/b2", "settings", "machine"]);
  const group = nodes.get("footer-contributed");
  const calls = new Map(group.calls.map(([name, ...args]) => [name, args]));
  assert.deepEqual(calls.get("min_w"), [0]);
  assert.deepEqual(calls.get("flex_shrink"), [1]);
  assert.ok(calls.has("overflow_hidden"), "the group clips");
  const inside = new Set(all({ __node: group }).map((n) => n.id));
  for (const id of ["bots", "mods", "automations", "quota", "settings", "machine"]) {
    assert.ok(!inside.has(id), `${id} is outside the clipping group`);
    assert.ok(nodes.get(id).calls.some(([name]) => name === "flex_none"), `${id} never shrinks`);
  }
  for (const id of ["aa/b1", "bb/b2"]) assert.ok(inside.has(id), `${id} is inside the group`);
});

test("no contributed buttons: no empty group in the rail", async () => {
  await footer({ sidebar: false });
  assert.ok(!nodes.has("footer-contributed"));
});
