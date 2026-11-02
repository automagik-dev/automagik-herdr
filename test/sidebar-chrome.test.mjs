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

async function footer({ sidebar }) {
  const root = mkdtempSync(join(tmpdir(), "hb-footer-"));
  state.appHome = root;
  if (sidebar) { mkdirSync(join(root, "mods/spaces-agents"), { recursive: true }); writeFileSync(join(root, "mods/spaces-agents/mod.json"), "{}\n"); }
  ui.props = { footer: true };
  const cx = makeCx();
  const view = new Footer();
  view.init({}, cx);
  await cx.settle();
  rmSync(root, { recursive: true, force: true });
  const drawn = view.render();
  index(drawn);
  return all(drawn).map((n) => n.id).filter((id) => TABS.has(id));
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
