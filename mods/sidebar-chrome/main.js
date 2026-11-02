import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout, panes, readTextFile, appHome, home, exec, openOverlay, closeOverlay, watchFolder } from "herdr";
import { badgeCount, oneAtATime, scanFooter, touchesFooter } from "./contributions.js";

// Where Pocket Link publishes whether a phone is connected (automagik-pocket's "For other mods"
// contract, schema 1). Resolved as its bridge/state.mjs does: $POCKET_LINK_STATE_DIR, else
// ${XDG_STATE_HOME:-~/.local/state}/automagik-pocket-link[-<first 8 hex of sha256(app home)>].
// A mod sees neither the environment nor a hash function, so node answers, once.
const POCKET_DIR = `
const { createHash } = require("node:crypto"), { isAbsolute, join, resolve } = require("node:path");
const abs = (p) => (typeof p === "string" && p !== "" && isAbsolute(p) ? p : null);
const [appHome, home] = process.argv.slice(1), env = process.env;
let dir = abs(env.POCKET_LINK_STATE_DIR) && resolve(env.POCKET_LINK_STATE_DIR);
if (!dir) {
  const base = abs(env.XDG_STATE_HOME) ?? join(home, ".local/state");
  dir = resolve(appHome) !== resolve(home, ".config/herdr-app")
    ? join(base, "automagik-pocket-link-" + createHash("sha256").update(resolve(appHome)).digest("hex").slice(0, 8))
    : join(base, "automagik-pocket-link");
}
process.stdout.write(join(dir, "public-status.json"));`;

// The dot's rule, from the contract: a missing, stale (90 s) or other-schema file means no dot.
function phoneConnected(text) {
  try {
    const s = JSON.parse(text);
    return s?.schema === 1 && s.running === true && s.phones_connected > 0 && Date.now() - s.updated < 90000;
  } catch { return false; }
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("am.sidebar.width", width);
  // The sidebar mod still reads the flag.
  setShared("am.sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("am.sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

// The rename shim (D12): the rail's shared keys live under am.*; the values from before the rename
// are copied over once on load, and the old keys stay (spaces-agents/migrate.js SHARED_RENAMES).
export const SHARED_OLD = Object.freeze({ "sidebar.width": "am.sidebar.width", "sidebar.collapsed": "am.sidebar.collapsed" });
function carryShared() {
  for (const [old, now] of Object.entries(SHARED_OLD)) if (shared(now) == null && shared(old) != null) setShared(now, shared(old));
}

// The Mods tab: the one already showing, else a new one. A tab, so it can be resized and
// closed like any other; the mod-manager dialog stays on cmd+shift+m.
function openMods() {
  const shown = panes().find((p) => p.mod === "mod-manager");
  if (shown) run("tab.select", { id: shown.tab });
  else run("tab.new", { name: "Mods", mod: "mod-manager" });
}

// The Bots tab's two entries: the sidebar mod's own forms, opened as their own copy of it
// (spaces-agents' init returns the form when props.form is set), so they work with no sidebar
// shown. Sizes as the sidebar opens them: the form 1000 × 840, the bot list 560 × 0.85.
export const BOT_FORMS = {
  create: { mod: "spaces-agents", kind: "dialog", modal: true, width: 1000, height: 840, props: { form: "create" } },
  pick: { mod: "spaces-agents", kind: "dialog", modal: true, width: 560, height: 0.85, props: { form: "pick" } },
};

// The popup's lines. The sidebar publishes `bots.defined` (false: no bot on this computer);
// then only New bot is offered. Unknown (the sidebar never ran) offers both.
export function botsMenuItems(defined = shared("bots.defined")) {
  const items = [{ id: "bots-new", label: "New bot", form: "create" }];
  if (defined !== false) items.push({ id: "bots-settings", label: "Bot settings", form: "pick" });
  return items;
}

function openBotsMenu() {
  openOverlay({ mod: "sidebar-chrome", kind: "popup", width: 200, height: 90, props: { botsMenu: true } });
}

export default class WorkspaceChrome extends View {
  // Pocket Link belongs to automagik-pocket, not this pack: its tab shows only while that mod is
  // installed, looked up again every 30 s (a read of its mod.json; nothing of it is written).
  // Its dot shows while a phone is connected, from the status file Pocket Link publishes.
  init(_given, cx) {
    // The Bots popup is its own copy of this mod: it draws two lines and looks nothing up.
    if (props()?.botsMenu) return;
    carryShared();
    this.pocket = false;
    this.bots = false;     // the Bots tab: only while the sidebar mod (spaces-agents) is installed
    this.phone = false;
    this.statusPath = null;
    this.hovered = null;   // the name of the tab under the pointer, shown dim in the rail
    this.contributed = []; // buttons other mods declare in their mod.json (contributions.js)
    const footer = Boolean(props()?.footer);
    const look = (cx) => cx.spawn(async (cx) => {
      let bots = false;
      try { bots = (await readTextFile(`${appHome()}/mods/spaces-agents/mod.json`)) !== null; } catch { bots = false; }
      if (bots !== this.bots) { this.bots = bots; cx.notify(); }
      let found = false;
      try { found = (await readTextFile(`${appHome()}/mods/pocket-link/mod.json`)) !== null; } catch { found = false; }
      let phone = false;
      if (found) {
        if (this.statusPath === null) {
          const r = await exec("node", ["-e", POCKET_DIR, appHome(), home()]).catch(() => null);
          if (r?.code === 0 && r.stdout.startsWith("/")) this.statusPath = r.stdout;
          else console.log("pocket dot: could not resolve the status file", r?.stderr ?? "node did not start");
        }
        if (this.statusPath) {
          try { phone = phoneConnected(await readTextFile(this.statusPath)); } catch { phone = false; }
        }
      }
      if (found !== this.pocket || phone !== this.phone) { this.pocket = found; this.phone = phone; cx.notify(); }
      if (footer) await scan(cx);
    });
    // Contributed buttons: every installed mod's mod.json, read only; redrawn only when they change.
    // One scan at a time: a trigger during a scan waits for it and gets one more run after it.
    const scan = oneAtATime(async (cx) => {
      const { buttons, problems } = await scanFooter({ exec, readText: readTextFile }, appHome()).catch(() => ({ buttons: [], problems: [] }));
      const said = problems.join("\n");
      if (said && said !== this.problems) console.log(said);
      this.problems = said;
      if (JSON.stringify(buttons) !== JSON.stringify(this.contributed)) { this.contributed = buttons; cx.notify(); }
    });
    look(cx);
    cx.timer.every(30000, look);
    // Between the 30 s looks, a mod.json or a mod folder changing rescans at once. A watch that
    // fails (Linux, past 4096 folders) leaves the timer alone.
    if (footer) cx.spawn(async (cx) => {
      const dir = `${appHome()}/mods`;
      try {
        for (;;) if (touchesFooter(await watchFolder(dir), dir)) await scan(cx);
      } catch (e) { console.log("footer: not watching the mods folder", String(e?.message ?? e)); }
    });
  }
  button(id, label, action) {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }
  // The Bots popup: New bot, and Bot settings once a bot exists. Esc closes it (Herdr).
  botsMenu(t) {
    const close = () => closeOverlay(props()?.overlay);
    return v_flex().id("bots-menu").size_full().p(4).gap(1).bg(t.popover).text_size(13).text_color(t.foreground)
      .children(botsMenuItems().map((item) => h_flex().id(item.id).h(30).px(10).items_center().rounded(6).cursor_pointer()
        .hover(s => s.bg(t.hover))
        .on_click(() => { openOverlay(BOT_FORMS[item.form]); close(); })
        .child(item.label)));
  }
  render() {
    const t = theme();
    const collapsed = narrow();
    if (props()?.botsMenu) return this.botsMenu(t);
    if (props()?.footer) {
      // A rail of tabs, one row however many there are: icon only, so none of them stacks up.
      // Icon only, so none of them stacks up; the name appears in the rail while the pointer is on
      // the tab — discrete, and never moving the icons themselves.
      const tab = (id, icon, label, active, dim, action, path = `mods/sidebar-chrome/${icon}.svg`) => h_flex().id(id).size(28).flex_none().items_center().justify_center().rounded(7)
        .bg(active ? t.selected : t.chrome).text_color(active ? t.foreground : dim ? t.dim : t.muted)
        .hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .on_hover((over, cx) => {
          const next = over ? label : this.hovered === label ? null : this.hovered;
          if (next === this.hovered) return;
          this.hovered = next;
          cx.notify();
        })
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(action).child(svg(path).size(15).flex_none());
      // Another mod's button: its icon (tinted like ours), its command, and a count while its
      // shared badge key holds a number above 0.
      const contributed = (b) => {
        const count = b.badge ? badgeCount(shared(b.badge)) : null;
        return tab(b.key, null, b.label, false, false, () => run(b.command, b.args), b.glyph)
          .when(count !== null, el => el.child(div().id(`${b.key}#badge`).h(12).min_w(12).px(3).flex_none().flex().items_center().justify_center()
            .rounded_full().bg(t.accent).text_color(t.accent_foreground).text_size(8.5).font_semibold().child(count)));
      };
      const automations = !find(layout(), "automations-panel")?.hidden;
      const quota = !find(layout(), "am-quota-panel")?.hidden;
      // Ours on the left, the app's on the right: a spacer carries the hovered name, then a rule.
      return v_flex().size_full().bg(t.chrome).border_t(1).border_color(t.border).px(6).pt(6).pb(7)
        .child(h_flex().gap(3).items_center()
          .when(this.bots, el => el.child(tab("bots", "bot", "Bots", false, false, openBotsMenu)))
          .child(tab("mods", "puzzle", "Mods", false, false, openMods))
          .child(tab("automations", "clock", "Automations", automations, false, () => run("layout.toggle", { id: "automations-panel" })))
          .child(tab("quota", "layers", "Quota", quota, false, () => run("layout.toggle", { id: "am-quota-panel" })))
          .when(this.pocket, el => el.child(tab("pocket", "smartphone", "Pocket Link", false, false, () => run("mod.open", { name: "pocket-link" }))
            .when(this.phone, el => el.child(div().size(6).rounded_full().bg(t.done)))))
          // Their own group, which gives up its width first and clips: the rail's own tabs never do.
          .when(this.contributed.length > 0, el => el.child(h_flex().id("footer-contributed").gap(3).items_center()
            .flex_shrink(1).min_w(0).overflow_hidden().children(this.contributed.map(contributed))))
          .child(div().flex_1().min_w(0).pl(6).pr(2).truncate().text_size(10.5).text_color(t.dim).child(this.hovered ?? ""))
          .child(div().w(1).h(16).flex_none().mx(1).bg(t.border))
          .child(tab("settings", "settings", "Settings", false, false, () => run("app.settings"))
            .when(Boolean(updates().app.ready), el => el.child(div().size(6).rounded_full().bg(t.accent))))
          .child(tab("machine", "plus", "Add machine", false, true, () => run("mod.open", { name: "machine-add" }))));
    }
    return h_flex().size_full().bg(t.chrome).pl(collapsed ? 6 : 14).pr(10).gap(4).items_center().text_size(13.5)
      .when(window()?.platform === "macos" && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(8).items_center().child(image("frame/welcome/herdr.png").size(20).rounded(5)).child(div().font_semibold().text_color(t.foreground).child("Herdr"))))
      .when(!collapsed, el => el.child(this.button("search", svg("mods/sidebar-chrome/search.svg").size(15), () => run("mod.open", { name: "picker" }))))
      // On the macOS rail the traffic lights fill the row; the agents list's » unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button("sidebar-toggle", svg("mods/sidebar-chrome/sidebar.svg").size(15), toggleSidebar)));
  }
}
