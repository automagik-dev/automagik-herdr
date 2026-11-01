// Context menus (Herdr's items, plus this terminal's Markdown files). Opened as a popup with
// props { tab: "pane" | "tab" | "space" | "global", target }.
// ↑/↓ move, Enter runs, Esc closes. An item is [label, command, args];
// a command "worktree" opens the worktree dialog instead.
//
// Below the menu's own items, right-clicking a terminal lists the Markdown files that terminal's
// text shows, newest first. Clicking one opens it in the markdown-browser preview pane: the tab's
// preview switches in place (a new one splits to the right), exactly as a click in its panel did.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, openOverlay, theme, keys, terminals, spaces, panes, exec, hc, home, shared, setShared, notify, focused } from "herdr";
import { markdownCandidates, resolve, label } from "./marks.js";


// The preview mod, and the shared state that lets a click switch an existing preview in place.
const PREVIEW = "markdown-browser";
const SLOTS = "markdown-browser.slots";
const SHOW = "markdown-browser.show";
const LAST = "markdown-browser.last";
// How much of the terminal to read, and how many files to offer.
const LINES = 600;
const OFFER = 12;

// Where a space is now: its first terminal's live folder, else where it was made.
function place(s) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}

// A space's checkout: "main" (a repo's own), "linked" (a worktree), or null.
async function checkout(folder, on) {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder, on });
  const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder, on });
  if (top.code !== 0 || common.code !== 0) return null;
  return common.stdout.trim() === `${top.stdout.trim()}/.git` ? "main" : "linked";
}

function items(p, git) {
  p = p ?? {};
  const tg = p.target ?? {};
  switch (p.tab) {
    case "pane": {
      // A kept sub-agent can go back under its parent, still running.
      const all = terminals();
      const term = all.find((t) => t.address === tg.terminal);
      const parent = term?.parent && all.find((t) => t.address === term.parent);
      // Once they go to the program, Shift+right-click still opens this menu.
      const toProgram = term?.labels?.["herdr.right-click"] === "program";
      return [
        ["Split right", "pane.split", { direction: "right", pane: tg.pane }],
        ["Split down", "pane.split", { direction: "down", pane: tg.pane }],
        ["Zoom", "pane.zoom", { pane: tg.pane }],
        ...(term
          ? [
              toProgram
                ? ["Use Herdr right-click menu", "terminal.right_click", { terminal: term.address, to: "menu" }]
                : ["Send right-clicks to pane", "terminal.right_click", { terminal: term.address, to: "program" }],
            ]
          : []),
        ...(parent ? [[`Send back to ${parent.name || parent.address}`, "terminal.park", { terminal: term.address }]] : []),
        ["Close pane", "pane.close", { pane: tg.pane }],
      ];
    }
    case "tab":
      return [
        ["Rename", "tab.rename", { id: tg.id }],
        ["New tab", "tab.new", { space: tg.space }],
        ["Close", "tab.close", { id: tg.id }],
      ];
    case "space":
      return [
        ["Rename", "space.rename", { id: tg.id }],
        ...(git ? [["New worktree", "worktree", { space: tg.id, action: "new" }], ["Open worktree", "worktree", { space: tg.id, action: "open" }]] : []),
        ...(git === "linked" ? [["Remove worktree", "worktree", { space: tg.id, action: "remove" }]] : []),
        ["Close", "space.close", { id: tg.id }],
      ];
    default:
      return [
        ["New space", "space.new", {}],
        ["Keybinds", "app.help", {}],
        ["Theme: graphite", "app.theme", { name: "graphite" }],
        ["Theme: ink", "app.theme", { name: "ink" }],
        ["Theme: moss", "app.theme", { name: "moss" }],
        ["Theme: atom one dark", "app.theme", { name: "atom-one-dark" }],
      ];
  }
}

function menuIcon(command) {
  const name = command.endsWith(".close") ? "x" : command.endsWith(".rename") ? "square-pen" : command.endsWith(".new") ? "plus" : command === "worktree" ? "git-branch" : command === "app.help" ? "terminal" : command === "app.theme" ? "settings" : command === "pane.split" ? "panel-right" : command === "pane.zoom" ? "square" : "terminal";
  return `mods/workspace-chrome/${name}.svg`;
}

// The key bound to a command, for the hint on the right.
function shortcut(name, args) {
  // `pane.split:right` binds pane.split with { direction: "right" }.
  const value = args && Object.values(args)[0];
  const k = keys().find((b) => b.section === "global" && (b.action === name || b.action === `${name}:${value}`));
  return k ? k.keys : "";
}

export default class Menu extends View {
  init(_props, cx) {
    this.at = 0;
    this.git = null;
    this.marks = [];
    this.note = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    const p = props();
    const space = p?.tab === "space" && spaces().find((s) => s.id === p.target?.id);
    const folder = space && place(space);
    if (folder)
      cx.spawn(async (cx) => {
        this.git = await checkout(folder, space.machine).catch(() => null);
        cx.notify();
      });

    // The right-clicked pane, or the focused one when opened by a key. A mod pane (a preview) has
    // no terminal: then the tab's first terminal is what printed the paths.
    const tg = p?.tab === "pane" ? p.target ?? {} : {};
    const anchor = panes().find((x) => x.pane === tg.pane) ?? null;
    const pane =
      (anchor?.terminal ? anchor : null) ??
      panes().find((x) => x.focused && x.terminal) ??
      panes().find((x) => x.tab === (anchor?.tab ?? focused()?.tab) && x.terminal) ??
      null;
    const term = tg.terminal ?? pane?.terminal ?? null;
    this.origin = anchor?.pane ?? pane?.pane ?? null;
    this.tab = anchor?.tab ?? pane?.tab ?? focused()?.tab ?? null;
    if (term)
      cx.spawn(async (cx) => {
        await this.find(term, pane);
        cx.notify();
      });
    else this.note = "No terminal in this tab";
  }

  // The Markdown files this terminal's text shows, newest first, kept only if they exist.
  async find(term, pane) {
    try {
      const on = term.includes("/") ? term.split("/")[0] : null;
      const cwd = pane?.cwd ?? focused()?.cwd ?? null;
      const read = await hc(["read", term, "--lines", String(LINES)]);
      if (!cwd) return void (this.note = "No folder for this terminal");
      // A path in output may be relative to the shell's folder or to the repo's root.
      const roots = [cwd];
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
      const root = top?.code === 0 ? top.stdout.trim() : "";
      if (root && root !== cwd) roots.push(root);
      const found = [];
      for (const raw of markdownCandidates(read?.stdout ?? "").reverse())
        for (const path of resolve(raw, roots, home()))
          if (path && !found.some((f) => f.path === path)) found.push({ path, rel: label(path, cwd) });
      if (!found.length) return void (this.note = "No Markdown files in this terminal");
      // One process for every check: `[ -f ]` exits 1 when the last one isn't, so read stdout only.
      const seen = await exec(
        "sh",
        ["-c", 'for f do [ -f "$f" ] && printf "%s\\n" "$f"; done', "md-menu", ...found.slice(0, 60).map((f) => f.path)],
        { on },
      ).catch((e) => ({ stdout: e?.stdout ?? "" }));
      const live = new Set((seen.stdout ?? "").split("\n").filter(Boolean));
      this.marks = found.filter((f) => live.has(f.path)).slice(0, OFFER).map((f) => ({ ...f, on }));
      if (!this.marks.length) this.note = "No Markdown files in this terminal";
    } catch (e) {
      this.note = String(e?.message ?? e);
    }
  }

  // Menu items first, then the Markdown files; `at` walks both.
  rows() {
    return [...items(props(), this.git).map((it) => ({ cmd: it })), ...this.marks.map((md) => ({ md }))];
  }

  choose(i, cx) {
    const row = this.rows()[i];
    if (!row) return;
    if (row.md) return this.open(row.md, cx);
    const it = row.cmd;
    closeOverlay(props()?.overlay);
    if (it[1] === "worktree") openOverlay({ mod: "worktree", kind: "dialog", ...(it[2].action === "open" ? { width: 560, height: 480 } : { width: 440, height: 260 }), props: it[2] });
    else run(it[1], it[2]);
  }

  // A popup closes only once the work is started: closing it ends its tasks.
  open(mark, cx) {
    const overlay = props()?.overlay;
    cx.spawn(async (cx) => {
      await this.preview(mark.path, mark.on, cx);
      closeOverlay(overlay);
    });
  }

  // Shows the file in the tab's preview, as a click in the markdown-browser panel did: the tab's
  // preview switches in place when it was opened by a preview (a slot in shared state), else a
  // new pane splits to the right of the clicked one. run() doesn't wait, so each step is polled.
  async preview(file, on, cx) {
    const tab = this.tab ?? focused()?.tab;
    const previews = panes().filter((x) => x.tab === tab && x.mod === PREVIEW);
    const last = (shared(LAST) ?? {})[tab];
    const old = previews.find((x) => x.focused) ?? previews.find((x) => x.pane === last) ?? previews[0] ?? null;
    const slot = old ? (shared(SLOTS) ?? {})[old.pane] : null;
    if (slot) {
      setShared(SHOW, { ...(shared(SHOW) ?? {}), [slot]: { file, on } });
      run("pane.focus", { pane: old.pane });
      return;
    }
    const before = new Set(panes().map((x) => x.pane));
    const fresh = { slot: Math.random().toString(36).slice(2, 10) + Date.now().toString(36) };
    const args = { direction: "right", mod: PREVIEW, props: { file, on, slot: fresh.slot } };
    const anchor = old?.pane ?? this.origin;
    if (anchor) args.pane = anchor;
    run("pane.split", args);
    const until = async (test) => {
      for (let i = 0; i < 40; i++) {
        if (test()) return true;
        await cx.sleep(25);
      }
      return false;
    };
    if (!(await until(() => (fresh.pane = panes().find((x) => !before.has(x.pane) && x.tab === tab && x.mod === PREVIEW)?.pane)))) {
      return notify({ title: "Can't open a preview", body: "The new pane didn't appear.", level: "error" });
    }
    // Record the new pane's slot, forgetting closed panes'.
    const alive = new Set(panes().map((x) => x.pane));
    const slots = Object.fromEntries(Object.entries(shared(SLOTS) ?? {}).filter(([pane]) => alive.has(pane)));
    slots[fresh.pane] = fresh.slot;
    const kept = new Set(Object.values(slots));
    setShared(SLOTS, slots);
    setShared(SHOW, { ...Object.fromEntries(Object.entries(shared(SHOW) ?? {}).filter(([s]) => kept.has(s))), [fresh.slot]: { file, on } });
    setShared(LAST, Object.fromEntries(Object.entries(shared(LAST) ?? {}).filter(([, pane]) => alive.has(pane))));
    // A preview this menu didn't open has no slot: the new one takes its place, since a closed
    // pane's room goes to the pane before it.
    if (!old) return;
    run("pane.focus", { pane: fresh.pane });
    if (!(await until(() => focused()?.pane === fresh.pane)))
      return notify({ title: "Couldn't replace the preview", body: "The old one is still open beside it.", level: "warning" });
    run("pane.swap", { direction: "left" });
    run("pane.close", { pane: old.pane });
  }

  render(cx) {
    const t = theme();
    const list = items(props(), this.git);
    const rows = this.rows();
    const commandRow = (it, i) =>
      v_flex()
        .when(i > 0 && (it[1].endsWith(".close") || it[1] === "app.help" || (it[1] === "app.theme" && list[i - 1][1] !== "app.theme")), (el) => el.child(div().mx(7).my(4).h(1).bg(t.border)))
        .child(
          h_flex()
            .id(`mi-${i}`)
            .h(31)
            .px(8)
            .gap(9)
            .rounded(7)
            .items_center()
            .justify_between()
            .text_color(t.foreground)
            .when(i === this.at, (el) => el.bg(t.selected))
            .hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => this.choose(i, cx))
            .child(svg(menuIcon(it[1])).size(14).flex_none().text_color(t.muted))
            .child(div().flex_1().child(it[0]))
            .child(div().text_size(11).text_color(t.dim).child(shortcut(it[1], it[2]))),
        );
    const markRow = (md, i) => {
      const at = list.length + i;
      return h_flex()
        .id(`mm-${i}`)
        .h(31)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .justify_between()
        .text_color(t.foreground)
        .when(at === this.at, (el) => el.bg(t.selected))
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => this.choose(at, cx))
        .child(svg("mods/workspace-chrome/file-text.svg").size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().child(md.rel))
        .when(Boolean(md.on), (el) => el.child(div().text_size(11).text_color(t.dim).child(md.on)));
    };
    return v_flex()
      .id("menu")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % Math.max(1, rows.length);
        else if (e.key === "up") this.at = (this.at + Math.max(1, rows.length) - 1) % Math.max(1, rows.length);
        else if (e.key === "enter") this.choose(this.at, cx);
        else if (e.key === "escape") closeOverlay(props().overlay);
        else return;
        cx.notify();
      })
      .children([
        ...list.map(commandRow),
        ...(this.marks.length
          ? [
              div().mx(7).my(4).h(1).bg(t.border),
              div().px(8).py(3).text_size(11).text_color(t.dim).child("Markdown in this terminal"),
              ...this.marks.map(markRow),
            ]
          : this.note
            ? [div().mx(7).my(4).h(1).bg(t.border), div().px(8).py(3).text_size(11).text_color(t.dim).child(this.note)]
            : []),
      ]);
  }
}
