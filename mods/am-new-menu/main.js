import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, spaces, panes, knownAgents, run, openOverlay, closeOverlay, props, window } from "herdr";
import { targetSpace, folderOf } from "./target.js";
import { menuAgents } from "./agents.js";

// Hermes starts as its TUI (like the imported panes); its run is otherwise kept as is.
const argvOf = (a) => (a.key === "hermes" && !a.run.includes("--tui") ? [...a.run, "--tui"] : a.run);

export default class NewMenu extends View {
  init(_props, cx) {
    this.agents = [];
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.spawn(async cx => {
      try { this.agents = await knownAgents({ on: targetSpace(spaces(), props()?.space)?.machine }); }
      catch { this.failed = true; }
      this.loaded = true;
      cx.notify();
    });
  }
  row(id, icon, name, action, hint = "", enabled = true) {
    const t = theme();
    return h_flex().id(id).h(31).px(9).gap(10).rounded(7).items_center().flex_none()
      .text_color(enabled ? t.foreground : t.dim).when(enabled, el => el.hover(s => s.bg(t.selected)))
      .on_click(() => { if (enabled) { closeOverlay(props().overlay); action(); } })
      .child(icon).child(div().flex_1().child(name)).child(div().text_size(11).text_color(t.dim).child(hint));
  }
  render() {
    const t = theme();
    // props.space: a sidebar row's +, for that space even when it isn't shown.
    const explicit = Boolean(props()?.space);
    const space = targetSpace(spaces(), props()?.space);
    const folder = () => folderOf(space, panes(), explicit);
    // Retired agents (agents.js) are dropped before anything is counted or given a key.
    const { installed, choices } = menuAgents(this.agents);
    const mod = window()?.platform === "macos" ? "⌘" : "Ctrl";
    return v_flex().min_h(0).w_full().h(Math.min(491, 167 + Math.max(1, choices.length) * 31)).bg(t.popover).p(5).text_size(12.8)
      .id("new-menu").track_focus(this.handle)
      .on_key_down((e) => {
        if (!e.modifiers.control && !e.modifiers.platform) return;
        const agent = /^[1-9]$/.test(e.key) ? installed[Number(e.key) - 1] : null;
        if (!agent && e.key !== "t" && e.key !== "n") return;
        closeOverlay(props().overlay);
        if (agent) run("tab.new", { name: agent.name, space: space?.id, argv: argvOf(agent) });
        else if (e.key === "t") run("tab.new", { space: space?.id });
        else run("space.new");
      })
      .child(this.row("terminal", svg("icons/shell.svg").size(14), "Terminal", () => run("tab.new", { space: space?.id }), `${mod} T`))
      .child(div().px(9).pt(8).pb(4).text_size(11).text_color(t.dim).truncate().child(explicit && space ? `Start an agent in ${space.name}` : "Start an agent"))
      .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar()
        .children(choices.map((a, i) => this.row(a.key, a.tint ? svg(a.icon).size(14).text_color(t.foreground) : image(a.icon).size(14), a.name,
          () => run("tab.new", { name: a.name, space: space?.id, argv: argvOf(a) }), a.installed ? (i < 9 ? `${mod} ${i + 1}` : "") : "not installed", a.installed)))
        .when(choices.length === 0, el => el.child(div().px(9).py(6).text_color(t.dim).child(this.failed ? "Could not load agents" : this.loaded ? "No agents found" : "Checking installed agents…"))))
      .child(div().h(1).mx(4).my(5).bg(t.border))
      .child(this.row("space", div().w(14).child("+"), "New space", () => run("space.new"), `${mod} N`))
      .child(this.row("worktree", svg("mods/workspace-chrome/branch.svg").size(14), "New worktree…", () => openOverlay({ mod: "worktree", kind: "dialog", width: 460, height: 280, props: { space: space?.id, folder: folder(), action: "new" } }), "", Boolean(space)))
      .child(this.row("worktree-open", svg("mods/workspace-chrome/branch.svg").size(14), "Open worktree\u2026", () => openOverlay({ mod: "worktree", kind: "dialog", width: 560, height: 480, props: { space: space?.id, folder: folder(), action: "open" } }), "", Boolean(space)));
  }
}
