import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, panes, run, openOverlay, closeOverlay, props, theme, window, shared, layout, settings } from "herdr";
import { syncNames } from "./names.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;    // the tab id being dragged, not its place in the list
    this.hovered = null;
    this.settled = props()?.settled ?? null; // set only on the "N settled" popup's copy
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
    syncNames();
    cx.timer.every(3000, () => syncNames());
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  // The "N settled" popup: pick one and it comes back into the bar.
  settledView() {
    const t = theme();
    return v_flex().id("settled").size_full().p(4).gap(2).bg(t.popover).text_size(12.5).text_color(t.foreground)
      .children((this.settled ?? []).map((c) =>
        h_flex().id(`settled-${c.id}`).h(26).px(8).gap(8).items_center().rounded(6).cursor_pointer()
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => {
            cx.stop_propagation();
            run("tab.unsettle", { id: c.id });
            run("tab.select", { id: c.id });
            this.settled = null;
            closeOverlay(props()?.overlay);
          })
          .child(div().flex_1().min_w(0).truncate().child(/^tb\d+$/.test(c.name) ? "Terminal" : c.name))
          .child(div().text_size(11).text_color(t.dim).child("bring back"))));
  }

  render() {
    if (this.settled) return this.settledView();
    const t = theme();
    const space = spaces().find(p => p.active);
    const tabs = space?.tabs ?? [];
    // Settled tabs are still running but put away; the bar folds them behind one count.
    const shown = tabs.filter((c) => !c.settled);
    const settled = tabs.filter((c) => c.settled);
    // No content width is exposed, so a page is estimated from the strip's own width and a pill.
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      return h_flex().id(`tab-${c.id}`).h(29).pl(10).pr(22).gap(7).rounded(7).items_center().flex_none().text_size(12.8)
        .relative().border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = c.id; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        // A middle press closes straight away, the way browser tabs do.
        .on_mouse_down("middle", (_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); })
        // Hover decides where the close ✕ shows; only a change redraws.
        .on_hover((over, cx) => {
          const next = over ? c.id : this.hovered === c.id ? null : this.hovered;
          if (next === this.hovered) return;
          this.hovered = next;
          cx.notify();
        })
        .on_mouse_up("left", () => {
          // The dragged tab is carried by id: a tab closed or reordered mid-drag lands elsewhere,
          // never moves a stranger. The drop index is read from the tab list as it is now.
          const from = this.pressed;
          this.pressed = null;
          if (from && from !== c.id) run("tab.move", { id: from, index: space.tabs.findIndex((x) => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", () => openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }))
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .child(div().max_w(280).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked", el => el.child(div().flex_none().px(5).h(16).rounded(4).bg(t.blocked + "26")
          .text_size(9.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you")))
        .when(c.status === "done", el => el.child(div().size(6).rounded(3).bg(t.done)))
        // The ✕ is drawn out of the row's flow, inside padding the pill always reserves: the
        // active tab shows it, any other shows it on hover, and the pill never changes size.
        .child((() => {
          const shown = c.active || this.hovered === c.id;
          return div().id(`close-${c.id}`).absolute().right(4).top(7).size(14).flex().items_center().justify_center().rounded(4)
            .when(shown, (el) => el.text_color(t.dim).cursor_pointer()
              .hover((s) => s.bg(t.hover).text_color(t.foreground))
              .on_mouse_down("left", stop).on_mouse_up("left", stop)
              .on_click((_e, cx) => { cx.stop_propagation(); this.hovered = null; run("tab.close", { id: c.id }); }))
            .when(!shown, (el) => el.opacity(0))
            .child(svg("mods/pane/close.svg").size(12));
        })());
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14)).child(label);
    };
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      // The strip's own scrolling only, with no bar painted: a wheel or a trackpad reads across
      // the tabs, and a terminal changes when one is chosen, never because the strip moved.
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scroll()
        .children(shown.map(item)))
      .when(settled.length > 0, el => el.child(
        h_flex().id("tab-settled").h(26).px(7).gap(5).flex_none().items_center().rounded(6).text_size(11.5)
          .text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_mouse_down("left", stop)
          .on_click(() => openOverlay({
            mod: "auto-tabs",
            kind: "popup",
            width: 280,
            height: 14 + 28 * Math.min(settled.length, 12),
            props: { settled: settled.map((c) => ({ id: c.id, name: c.name })) },
          }))
          .child(div().child(String(settled.length)))
          .child(div().child(settled.length === 1 ? "settled" : "settled"))))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .when(window()?.buttons, el => el.child(button("minimize", "−", () => run("window.minimize")))
        .child(button("maximize", "□", () => run("window.maximize")))
        .child(button("close-window", svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
