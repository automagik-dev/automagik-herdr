// The window's bottom status bar: Herdr's `workspace-status` (machine, branch, agents, the
// palette hint) plus, beside "commands", the installed Automagik Herdr version and its update
// state (label.js). The sidebar runs every check and install (am-sidebar/updateCheck.js); this
// mod shows its shared answer and asks through REQUEST_KEY. Apache-2.0.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys, shared, setShared, openOverlay, readTextFile, appHome, nextCommand } from "herdr";
import { REQUEST_KEY, STATE_KEY, confirmText, offered, statusLabel } from "./label.js";

export default class AmStatus extends View {
  init(_props, cx) {
    this.version = null;
    this.confirming = null; // the version the open confirm dialog names
    this.seen = null; // the state the last VERSION read went with
    this.readVersion(cx);
    // Once a second: redraw while a check, an install or a request is under way (its "checking…"
    // turns into an answer or "couldn't check"), and read VERSION again when the state moved.
    cx.timer.every(1000, (cx) => {
      const state = shared(STATE_KEY);
      const key = JSON.stringify([state?.at ?? null, state?.busy?.id ?? null]);
      if (key !== this.seen) { this.seen = key; this.readVersion(cx); }
      const request = shared(REQUEST_KEY);
      if (state?.busy || (typeof request?.at === "number" && Date.now() - request.at < 130_000)) cx.notify();
    });
    // The confirm dialog's Confirm runs `am-status.update`.
    cx.spawn(async (cx) => {
      for (;;) {
        // Only the name counts: Herdr may append the command's args ("update {}").
        const c = String(await nextCommand() ?? "").trim().split(/\s+/)[0];
        if (c === "update" && this.confirming) this.ask("apply", this.confirming);
        cx.notify();
      }
    });
  }

  readVersion(cx) {
    cx.spawn(async (cx) => {
      let v = null;
      try { v = (await readTextFile(`${appHome()}/mods/am-sidebar/VERSION`))?.trim() || null; } catch {}
      if (v !== this.version) { this.version = v; cx.notify(); }
    });
  }

  // `to`: for an install, the version the dialog named; the sidebar refuses any other.
  ask(what, to = null) {
    const at = Date.now();
    setShared(REQUEST_KEY, { id: `${what}-${at}-${Math.random().toString(36).slice(2, 8)}`, what, at, ...(to ? { to } : {}) });
  }

  click(what) {
    if (what === "check") return this.ask("check");
    const state = shared(STATE_KEY);
    const current = this.version ?? state?.current ?? null;
    const latest = offered(state, current);
    if (!latest) return this.ask("check");
    this.confirming = latest;
    openOverlay({ mod: "confirm", kind: "dialog", width: 460, height: 210, props: { ...confirmText(current, latest), command: { name: "am-status.update" } } });
  }

  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  versionPart(t) {
    const { parts, tooltip } = statusLabel({ state: shared(STATE_KEY), request: shared(REQUEST_KEY), version: this.version, now: Date.now() });
    const part = (p, i) => div().id(`am-version-${i}`).text_color(p.tone === "accent" ? t.accent : t.dim)
      .when(p.click !== null, (el) => el.cursor_pointer().hover((s) => s.opacity(0.8)).on_click(() => this.click(p.click)))
      .child(p.text);
    return h_flex().id("am-version").items_center().when(Boolean(tooltip), (el) => el.tooltip(tooltip)).children(parts.map(part));
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/am-status/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)))
      .child(this.versionPart(t));
  }
}
