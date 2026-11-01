// Markdown files, three ways, by props:
// - { file, on }: the file rendered as a pane, reloaded when it changes, with a button that
//   hands it to the system's default app (on: the machine it lives on, null for this one).
// - { file, on, overlay }: the file's right-click menu, as a popup.
// - nothing: a panel listing the Markdown files around the focused pane (see list.js).
import { View, div } from "gpui-kit";
import { v_flex, h_flex, TextView, InputState, Input, v_virtual_list, Scrollbar, VirtualListScrollHandle } from "gpui-base";
import { props, readTextFile, watchFolder, theme, panes, focused, run, notify, openOverlay, closeOverlay, nextCommand, shared, setShared, home } from "herdr";
import { openDefault } from "./open.js";
import { MARKDOWN, location, markdownFiles, join } from "./list.js";

// Previews opened from the list: { pane id: slot }, and what each slot shows now
// ({ slot: { file, on } }; without one, its props' file).
const SLOTS = "markdown-browser.slots";
const SHOW = "markdown-browser.show";
// The preview pane focused last in each tab ({ tab: pane id }): a click in the list shows its
// file there.
const LAST = "markdown-browser.last";
const shown = (slot) => (slot && shared(SHOW)?.[slot]) || null;
const lastByTab = () => { const v = shared(LAST); return v && typeof v === "object" ? v : {}; };
// The preview a click in the list replaces: the tab's focused one, else its last, else any.
function tabPreview(tab) {
  const previews = panes().filter((p) => p.tab === tab && p.mod === "markdown-browser");
  return previews.find((p) => p.focused) ?? previews.find((p) => p.pane === lastByTab()[tab]) ?? previews[0] ?? null;
}
// What decides the list besides Markdown files themselves.
const IGNORES = /(^|[\\/])\.gitignore$/;
// A list row, and the right-click menu: 12 + 32 per item (Preview in new pane, Open in Default app).
const ROW = 28;
const MENU = 12 + 32 * 2;
// The home folder, or one that holds it ("/", "/Users", "C:\").
function aboveHome(root) {
  const h = home().replace(/[\\/]+$/, ""), r = root.replace(/[\\/]+$/, "");
  return r === "" || h === r || h.startsWith(`${r}/`) || h.startsWith(`${r}\\`);
}

// Front matter, and in MDX the top-level import/export lines (not inside a code fence): not prose.
function prose(text, file) {
  const s = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  if (!/\.mdx$/i.test(file)) return s;
  let fence = null;
  return s.split("\n").filter((line) => {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (m && !fence) fence = m[1];
    else if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
    else if (!fence && /^(import|export)\s/.test(line)) return false;
    return true;
  }).join("\n");
}

export default class MarkdownBrowser extends View {
  init(_props, cx) {
    const { file, on, overlay } = props() ?? {};
    this.file = file ?? null;
    this.on = on ?? null;
    this.overlay = overlay ?? null;
    if (this.overlay) return;
    if (!this.file) return this.initList(cx);

    // Opened from the list: its slot, which shared SHOW can point at another file.
    this.slot = props().slot ?? null;
    this.request = 0;
    this.text = null;
    this.show(shown(this.slot) ?? { file: this.file, on: this.on }, cx);
    // watchFolder only sees this machine: another's, look again every 3 s (one read at a time),
    // and not while its tab is in the background.
    cx.timer.every(3000, (cx) => {
      if (!this.on || this.reading) return;
      const me = panes().find((p) => p.pane === this.paneId());
      if (!me || me.tab === focused()?.tab) this.load(cx);
    });
    // "markdown-browser.open" in keys.json: the default app. It reaches every shown copy; the focused one acts.
    cx.spawn(async () => {
      for (;;) {
        const c = await nextCommand();
        if (c === "open" && !this.on && this.isFocused()) this.open();
      }
    });
  }

  // A pane doesn't know its id; the list recorded it for this copy's slot.
  paneId() {
    return this.slot ? Object.entries(shared(SLOTS) ?? {}).find(([, slot]) => slot === this.slot)?.[0] ?? null : null;
  }

  // Only a copy that knows its pane can tell it's the focused one.
  isFocused() {
    const pane = this.paneId();
    return Boolean(pane && panes().find((p) => p.pane === pane)?.focused);
  }

  // Show this file from now on, and watch it. The text shown before stays until the new one
  // is read, rather than a "Loading…" flash.
  show({ file, on }, cx) {
    this.file = file;
    this.on = on ?? null;
    this.error = null;
    this.load(cx);
    const watching = (this.watching = { file });
    if (this.on) return;
    const dir = file.replace(/[\\/][^\\/]*$/, "") || "/";
    cx.spawn(async (cx) => {
      while (this.watching === watching) {
        const changed = await watchFolder(dir);
        if (this.watching === watching && changed.includes(file)) this.load(cx);
      }
    });
  }

  // The newest read wins: a slower, older one (or one for the file shown before) is dropped.
  load(cx) {
    const request = ++this.request, file = this.file, on = this.on;
    this.reading = true;
    cx.spawn(async (cx) => {
      let text = null, error = null;
      try {
        text = await readTextFile(file, { on });
        if (text === null) error = "File not found";
      } catch (e) {
        error = String(e?.message ?? e);
      }
      if (request !== this.request || file !== this.file || on !== this.on) return;
      this.reading = false;
      if (error) {
        if (error === this.error) return;
        this.error = error;
      } else {
        if (text === this.text && file === this.textFile && !this.error) return;
        this.text = text;
        this.textFile = file;
        this.error = null;
      }
      cx.notify();
    });
  }

  // A popup closes only once the app is asked: closing it ends its tasks, and openDefault
  // checks the file before it starts the app.
  open() {
    openDefault(this.file).then((why) => {
      if (why) notify({ title: "Can't open in the default app", body: why, level: "error" });
      if (this.overlay) closeOverlay(this.overlay);
    });
  }

  // One preview at a time: two splits at once could each take the other's new pane.
  async queuePreview(file, on, cx, newPane = false) {
    const before = this.queue ?? Promise.resolve();
    let done;
    this.queue = new Promise((resolve) => (done = resolve));
    try {
      await before;
      await this.preview(file, on, cx, newPane);
    } finally {
      done();
    }
  }

  // Shows the file in the tab's preview: the focused one, else the one focused last, else any;
  // with `newPane`, or without one, in a new pane. One opened from here has a slot: shared SHOW
  // points it at the next file, in place. Others (opened from a shell) can't change: a new one
  // opens beside it and takes its place. A closed pane's room goes to the pane before it, so
  // the new one swaps to the left first; else each replacement halves it. run() doesn't wait,
  // so each step waits to see the last one land. Resolves when done (a popup closes only then:
  // closing it ends its tasks).
  async preview(file, on, cx, newPane = false) {
    const tab = focused()?.tab;
    const old = newPane ? null : tabPreview(tab);
    const slot = old && shared(SLOTS)?.[old.pane];
    if (slot) return setShared(SHOW, { ...(shared(SHOW) ?? {}), [slot]: { file, on } });

    const before = new Set(panes().map((p) => p.pane));
    const fresh = { slot: Math.random().toString(36).slice(2, 10) + Date.now().toString(36) };
    run("pane.split", { direction: "right", pane: old?.pane, mod: "markdown-browser", props: { file, on, slot: fresh.slot } });
    const until = async (test) => {
      for (let i = 0; i < 40; i++) { if (test()) return true; await cx.sleep(25); }
      return false;
    };
    if (!await until(() => (fresh.pane = panes().find((p) => !before.has(p.pane) && p.tab === tab && p.mod === "markdown-browser")?.pane)))
      return notify({ title: "Can't open a preview", body: "The new pane didn't appear.", level: "error" });
    // Record the new pane's slot, forgetting closed panes'.
    const alive = new Set(panes().map((p) => p.pane));
    const slots = Object.fromEntries(Object.entries(shared(SLOTS) ?? {}).filter(([pane]) => alive.has(pane)));
    slots[fresh.pane] = fresh.slot;
    const kept = new Set(Object.values(slots));
    setShared(SLOTS, slots);
    // Its file too, so the list can mark it.
    setShared(SHOW, { ...Object.fromEntries(Object.entries(shared(SHOW) ?? {}).filter(([s]) => kept.has(s))), [fresh.slot]: { file, on } });
    setShared(LAST, Object.fromEntries(Object.entries(lastByTab()).filter(([, pane]) => alive.has(pane))));
    if (!old) return;
    run("pane.focus", { pane: fresh.pane });
    if (!await until(() => focused()?.pane === fresh.pane))
      return notify({ title: "Couldn't replace the preview", body: "The old one is still open beside it.", level: "warning" });
    run("pane.swap", { direction: "left" });
    run("pane.close", { pane: old.pane });
  }

  // The list follows the focused pane; it rereads when a Markdown file or a .gitignore under it
  // changes (another machine's, or a home's: every 10 s).
  initList(cx) {
    this.context = undefined;
    this.query = "";
    this.search = InputState.new({ placeholder: "Filter" });
    this.at = 0;
    this.typing = false;
    this.matches = [];
    this.scroll = VirtualListScrollHandle.new();
    this.search.on("change", (_e, cx) => { this.query = this.search.value(); this.at = 0; this.scroll.scroll_to_item(0); cx.notify(); });
    this.search.on("submit", (_e, cx) => {
      const rel = this.matches[this.at];
      if (rel) cx.spawn((cx) => this.queuePreview(join(this.root, rel), this.on, cx));
    });
    this.search.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.search.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.refreshList(cx);
    cx.timer.every(10000, (cx) => { if (this.on || this.watching?.polled) this.refreshList(cx); });
  }

  // Focusing a preview keeps the list while the tab stays; a first look, or another tab,
  // takes the preview's tab's folder.
  where() {
    const here = location();
    return here.weak && this.cwd && here.tab === this.tab ? { cwd: this.cwd, on: this.on, tab: this.tab } : here;
  }

  // A request while a read runs isn't lost: the read runs again after it.
  refreshList(cx) {
    const { cwd, on, tab } = this.where(), context = JSON.stringify([cwd, on]);
    this.tab = tab;
    if (context !== this.context) {
      this.context = context; this.cwd = cwd; this.on = on;
      this.root = null; this.files = []; this.listError = null; this.loading = false; this.again = false; this.watching = null;
    }
    if (!cwd) return;
    if (this.loading) { this.again = true; return; }
    this.loading = true;
    this.again = false;
    cx.spawn(async (cx) => {
      try {
        const { root, files } = await markdownFiles(cwd, on);
        if (this.context !== context) return;
        this.root = root; this.files = files; this.listError = null;
        if (!on) this.watch(root, cx);
      } catch (e) {
        if (this.context === context) this.listError = String(e?.message ?? e);
      } finally {
        if (this.context === context) {
          this.loading = false;
          if (this.again) this.refreshList(cx);
        }
        cx.notify();
      }
    });
  }

  // A watch that fails (the folder went away, too many watchers) is retried a while later.
  // A home, or a folder above it, is polled instead: watching it is every file the person has.
  watch(root, cx) {
    if (this.watching?.root === root) return;
    if (aboveHome(root)) return void (this.watching = { root, polled: true });
    const watching = (this.watching = { root });
    cx.spawn(async (cx) => {
      try {
        while (this.watching === watching) {
          const changed = await watchFolder(root);
          if (this.watching === watching && changed.some((p) => MARKDOWN.test(p) || IGNORES.test(p))) this.refreshList(cx);
        }
      } catch {
        if (this.watching !== watching) return;
        this.watching = null;
        await cx.sleep(10000);
        if (this.watching === null) this.refreshList(cx);
      }
    });
  }

  render(cx) {
    if (this.overlay) return this.menu();
    if (this.file) {
      const want = shown(this.slot);
      if (want && (want.file !== this.file || (want.on ?? null) !== this.on)) this.show(want, cx);
      const pane = this.paneId(), me = pane && panes().find((p) => p.pane === pane);
      if (me?.focused && lastByTab()[me.tab] !== pane) setShared(LAST, { ...lastByTab(), [me.tab]: pane });
      return this.pane();
    }
    const { cwd, on } = this.where();
    if (JSON.stringify([cwd, on]) !== this.context) this.refreshList(cx);
    return this.list();
  }

  menu() {
    const t = theme();
    // The default app only reaches this machine's files.
    const away = this.on ? " (other machine)" : "";
    const item = (id, label, enabled, action) =>
      div().id(id).h(28).px(10).flex().items_center().rounded(6).truncate()
        .when(enabled, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(action))
        .when(!enabled, (el) => el.text_color(t.dim))
        .child(label);
    return v_flex().w_full().p(4).gap(4).bg(t.popover).text_color(t.foreground).text_size(12.5)
      .child(item("mb-preview", "Preview in new pane", true, (_e, cx) => {
        cx.spawn(async (cx) => {
          await this.queuePreview(this.file, this.on, cx, true);
          closeOverlay(this.overlay);
        });
      }))
      .child(item("mb-default", `Open in Default app${away}`, !this.on, () => this.open()));
  }

  pane() {
    const t = theme();
    const name = this.file.split(/[\\/]/).pop();
    return v_flex().id("markdown-browser").size_full().min_h(0).bg(t.background).text_color(t.foreground)
      .child(h_flex().h(32).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border).text_size(12)
        .child(div().font_semibold().truncate().child(name))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(this.on ? `${this.on}:${this.file}` : this.file))
        .when(!this.on, (el) => el.child(
          div().id("mb-open").flex_none().px(8).py(2).rounded(5).text_color(t.muted).cursor_pointer()
            .hover((s) => s.bg(t.hover).text_color(t.foreground))
            .on_click(() => this.open())
            .child("Default app"))))
      .child(this.error
        ? div().p(16).text_size(12.5).text_color(t.dim).child(this.error)
        : this.text === null
          ? div().p(16).text_size(12.5).text_color(t.dim).child("Loading…")
          : div().flex_1().min_h(0).px(20).py(14).text_size(14)
            .child(TextView.markdown(`md-body-${this.textFile}`, prose(this.text, this.textFile)).scrollable(true).selectable(true).size_full()));
  }

  list() {
    const t = theme();
    // Every word of the filter, anywhere in the path.
    const words = this.query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (this.matches = words.length ? this.files.filter((rel) => words.every((w) => rel.toLowerCase().includes(w))) : this.files);
    if (this.at >= matches.length) this.at = Math.max(0, matches.length - 1);
    // The file a click would replace, marked; the keyboard's row, while the filter has the keyboard.
    const target = tabPreview(focused()?.tab), current = target && shown(shared(SLOTS)?.[target.pane]);
    const row = (rel, i) => {
      const cut = Math.max(rel.lastIndexOf("/"), rel.lastIndexOf("\\"));
      const on = current?.file === join(this.root, rel) && (current.on ?? null) === this.on;
      const at = this.typing && i === this.at;
      return h_flex().h(ROW).px(8).gap(8).items_center().rounded(7).cursor_pointer()
        .when(on || at, (el) => el.bg(on ? t.selected : t.hover))
        .hover((s) => s.bg(on ? t.selected : t.hover))
        .child(div().min_w(0).truncate().when(on, (el) => el.font_semibold()).child(rel.slice(cut + 1)))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(cut < 0 ? "" : rel.slice(0, cut)));
    };
    const empty = this.listError || (this.loading && !this.files.length ? "Loading…"
      : !this.cwd ? "No folder" : !this.files.length ? "No Markdown files" : !matches.length ? "No matches" : null);
    const folder = this.root?.split(/[\\/]/).filter(Boolean).pop() ?? (this.root ? "/" : "");
    return v_flex().id("markdown-browser-list").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background)
      .border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Markdown"))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim)
          .child(this.on && folder ? `${this.on}: ${folder}` : folder))
        .child(div().id("mb-refresh").flex_none().px(4).rounded(5).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => this.refreshList(cx))
          .child("↻")))
      // Up and down move through the matches, Enter previews one, Escape clears the filter.
      .child(div().id("mb-filter").flex_none().mx(6).mt(6).h(30).px(10).flex().items_center().rounded(8)
        .border_1().border_color(this.typing || this.query ? t.accent : t.border).cursor_text()
        .on_key_down((e, cx) => {
          const n = this.matches.length;
          if (e.key === "down" && n) this.at = (this.at + 1) % n;
          else if (e.key === "up" && n) this.at = (this.at + n - 1) % n;
          else if (e.key === "escape" && this.query) { this.search.set_value(""); this.query = ""; this.at = 0; }
          else return;
          cx.stop_propagation();
          this.scroll.scroll_to_item(this.at);
          cx.notify();
        })
        .child(Input.new(this.search).flex_1().h_full().text_size(12.5).text_color(t.foreground)))
      .child(empty
        ? div().p(14).text_size(12).text_color(t.dim).child(empty)
        // Rows are rebuilt as the list scrolls, so clicks are the list's, by key (the path).
        : div().flex_1().min_h(0).relative().p(6)
          .child(v_virtual_list("mb-files", matches.length, ROW, (i) => matches[i],
            (range) => matches.slice(range.start, range.end).map((rel, k) => row(rel, range.start + k)))
            .track_scroll(this.scroll).size_full()
            .on_item_click((rel, cx) => cx.spawn((cx) => this.queuePreview(join(this.root, rel), this.on, cx)))
            .on_item_secondary_click((rel, _e, cx) => {
              cx.stop_propagation();
              openOverlay({ mod: "markdown-browser", kind: "popup", height: MENU, props: { file: join(this.root, rel), on: this.on } });
            }))
          .child(Scrollbar.vertical("mb-files").absolute().inset_0()));
  }
}
