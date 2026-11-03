// A space's icon: an emoji (typed, pasted, or picked below), or an image — drop or type a
// PNG, SVG or ICO. Kept under the app home in space-icons/, mapped by full space id in
// shared "am.sidebar.icons" (the am-sidebar mod draws it). An ICO is converted
// to PNG on import with sips, which is what the sidebar can draw.
// Part of the sidebar mod: a space's tile opens this mod as a dialog with props
// {spaceIcon: <space id>}, and main.js's init hands it to this class (as it does BotForm).
import { div, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { closeOverlay, theme, spaces, shared, setShared, appHome, home, exec } from "herdr";
import * as fs from "fs/promises";
import { chars, names } from "./emoji-data.js";
import { COLORS, COLORS_KEY, KEY, MAX_BYTES, colorError, emojiError, emojiHits, iconFile, isHex, kindOf, pngError, readIcon, svgError,
  tileFill, withColor, withIcon, withoutIcon } from "./spaceIconModel.js";

// The picker: a grid of cells per page, narrow enough for a 440 px dialog.
const COLS = 12;
const PER_PAGE = COLS * 7;

// The overlay a space's tile opens: this mod again, as the icon dialog for that space.
export function spaceIconOverlay(spaceId) {
  return { mod: "am-sidebar", kind: "dialog", width: 440, height: 520, props: { spaceIcon: spaceId } };
}

export class SpaceIconDialog {
  // p: the overlay's props, {spaceIcon: <space id>, overlay: <its id, to close>}.
  constructor(p, cx) {
    this.p = p ?? {};
    this.error = null;
    this.busy = false;
    this.tab = "emoji";
    this.page = 0;
    this.query = "";
    this.search = InputState.new({ placeholder: `search ${chars.length} emoji — fox, rocket, heart` });
    this.search.on("change", (_e, cx) => { this.query = this.search.value(); this.page = 0; cx.notify(); });
    this.search.on("focus", (_e, cx) => { this.searchFocused = true; cx.notify(); });
    this.search.on("blur", (_e, cx) => { this.searchFocused = false; cx.notify(); });
    this.path = InputState.new({ value: "", placeholder: "/path/to/icon.png — or .svg, .ico" });
    this.emoji = InputState.new({ value: "", placeholder: "🙂 type or paste an emoji" });
    this.hex = InputState.new({ value: isHex(this.color() ?? "") ? this.color() : "", placeholder: "#rrggbb" });
    for (const [input, key, apply] of [
      [this.path, "pathFocused", (cx) => this.applyImage(input.value(), cx)],
      [this.emoji, "emojiFocused", (cx) => this.applyEmoji(input.value(), cx)],
      [this.hex, "hexFocused", (cx) => this.setColor(input.value(), cx)],
    ]) {
      input.on("submit", (_e, cx) => apply(cx));
      input.on("focus", (_e, cx) => { this[key] = true; cx.notify(); });
      input.on("blur", (_e, cx) => { this[key] = false; cx.notify(); });
    }
  }

  // What the sidebar draws behind the tile now: a palette name or a hex.
  color() {
    const held = (shared(COLORS_KEY) ?? {})[this.p.spaceIcon];
    return typeof held === "string" ? held : null;
  }

  // The tile's fill, in this theme: the palette's color, the hex as typed, or none at all.
  fill(t) {
    return tileFill(this.color(), t);
  }

  // Saves the color and stays open: it's the icon's backdrop, not the whole dialog's job.
  setColor(raw, cx) {
    const { id } = this.target();
    const value = String(raw ?? "").trim();
    if (!id) return void (this.error = "No space chosen.");
    const wrong = colorError(value);
    if (wrong) { this.error = wrong; cx.notify(); return; }
    this.error = null;
    setShared(COLORS_KEY, withColor(shared(COLORS_KEY), id, value));
    if (isHex(value)) this.hex.set_value(value);
    cx.notify();
  }

  // What the dialog acts on: the space in props, its overlay to close.
  target() {
    return { id: this.p.spaceIcon, overlay: this.p.overlay };
  }

  // Writes the new value, drops the file it replaces, and closes.
  async commit(value, cx) {
    const { id } = this.target();
    const { map, drop } = withIcon(shared(KEY), id, value);
    setShared(KEY, map);
    if (drop) await fs.unlink(`${appHome()}/${drop}`).catch(() => {});
    closeOverlay(this.p.overlay);
  }

  applyEmoji(raw, cx) {
    const { id } = this.target();
    const char = String(raw ?? "").trim();
    if (!id) return void (this.error = "No space chosen.");
    const wrong = emojiError(char);
    if (wrong) { this.error = wrong; cx.notify(); return; }
    this.error = null;
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await this.commit({ kind: "emoji", char }, cx);
      } catch (e) {
        this.error = String(e?.message ?? e);
      }
      this.busy = false;
      cx.notify();
    });
  }

  // A drop, a typed path, or the button: the extension says what it is, and each kind is
  // checked before it's kept.
  applyImage(raw, cx) {
    const { id } = this.target();
    const path = String(raw ?? "").trim().replace(/^~(?=\/|$)/, home());
    if (!id) return void (this.error = "No space chosen.");
    if (!path) { this.error = "Drop a file here, or type its path."; cx.notify(); return; }
    const kind = kindOf(path);
    if (!kind) { this.error = "Icons are .png, .svg or .ico files."; cx.notify(); return; }
    this.busy = true;
    this.error = null;
    cx.notify();
    cx.spawn(async (cx) => {
      let scratch = null;
      try {
        let bytes, ext = kind;
        const unreadable = "Can't read that file (it must exist, in your home folder).";
        // Size first, so a huge drop is refused before it is read (or converted) at all.
        let size;
        // Herdr's fs has no stat: wc -c counts the bytes without reading them into this mod.
        try { const r = await exec("wc", ["-c", path]); size = r.code === 0 ? Number(r.stdout.trim().split(/\s+/)[0]) : NaN; } catch { size = NaN; }
        if (!Number.isFinite(size)) throw new Error(unreadable);
        if (size > MAX_BYTES) throw new Error(`Too large: ${(size / 1048576).toFixed(1)} MB (at most 5 MB).`);
        if (kind === "svg") {
          let text;
          try { text = await fs.readFile(path, "utf8"); } catch { throw new Error(unreadable); }
          const wrong = svgError(text);
          if (wrong) throw new Error(wrong);
          bytes = text;
        } else {
          let source = path;
          // sips reads ICO and writes PNG: what the sidebar draws.
          if (kind === "ico") {
            await fs.mkdir(`${appHome()}/space-icons`, { recursive: true });
            scratch = `${appHome()}/space-icons/.tmp-${Date.now()}.png`;
            const r = await exec("sips", ["-s", "format", "png", path, "--out", scratch]);
            if (r.code !== 0) throw new Error("Couldn't read that ICO (sips refused it).");
            source = scratch;
            ext = "png";
          }
          try { bytes = await fs.readFile(source); } catch { throw new Error(unreadable); }
          const wrong = pngError(bytes);
          if (wrong) throw new Error(kind === "ico" ? `That ICO doesn't make a usable icon: ${wrong}` : wrong);
        }
        const file = iconFile(id, Date.now(), ext);
        await fs.mkdir(`${appHome()}/space-icons`, { recursive: true });
        await fs.writeFile(`${appHome()}/${file}`, bytes);
        await this.commit({ kind: "image", file }, cx);
      } catch (e) {
        this.error = String(e?.message ?? e);
      } finally {
        if (scratch) await fs.unlink(scratch).catch(() => {});
      }
      this.busy = false;
      cx.notify();
    });
  }

  // The clipboard's text, for an emoji copied from anywhere the input can't reach.
  paste(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await exec("osascript", ["-e", "the clipboard as text"]);
        const text = (r.stdout ?? "").trim();
        if (r.code !== 0 || !text) throw new Error("The clipboard holds no text. Copy an emoji first.");
        this.emoji.set_value(text);
        this.applyEmoji(text, cx);
      } catch (e) {
        this.error = String(e?.message ?? e);
        cx.notify();
      }
    });
  }

  reset(cx) {
    const { id } = this.target();
    this.busy = false;
    this.error = null;
    cx.spawn(async () => {
      const { map, drop } = withoutIcon(shared(KEY), id);
      setShared(KEY, map);
      if (drop) await fs.unlink(`${appHome()}/${drop}`).catch(() => {});
      closeOverlay(this.p.overlay);
    });
  }

  // Emoji | Image | Colour: one at a time, so the picker has room to be a grid.
  tabs(t) {
    const tab = (id, text) => h_flex().id(`si-tab-${id}`).h(28).px(11).items_center().rounded(7).text_size(12)
      .bg(this.tab === id ? t.selected : t.chrome).text_color(this.tab === id ? t.foreground : t.muted)
      .border_1().border_color(this.tab === id ? t.border : t.chrome).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { this.tab = id; cx.notify(); }).child(text);
    return h_flex().gap(4).children([tab("emoji", "Emoji"), tab("image", "Image"), tab("color", "Colour")]);
  }

  body(t) {
    return this.tab === "image" ? this.imageSection(t) : this.tab === "color" ? this.colorSection(t) : this.emojiSection(t);
  }

  // The grid: the system's emoji names searched as you type, a page of clickable cells at a time.
  emojiSection(t) {
    const button = (id, text, primary, action, enabled = true) => h_flex().id(id).h(30).px(12).items_center().rounded(7)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12).font_medium()
      .when(enabled, (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)).on_click((_e, cx) => action(cx)))
      .when(!enabled, (el) => el.opacity(0.4))
      .child(text);
    const hits = emojiHits(this.query, chars, names);
    const pages = Math.max(1, Math.ceil(hits.length / PER_PAGE));
    if (this.page > pages - 1) this.page = pages - 1;
    const shown = hits.slice(this.page * PER_PAGE, this.page * PER_PAGE + PER_PAGE);
    const rows = [];
    for (let i = 0; i < shown.length; i += COLS) rows.push(shown.slice(i, i + COLS));
    const cell = (i) => h_flex().id(`em-${i}`).w(28).h(28).flex_none().items_center().justify_center().rounded(6)
      .text_size(17).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.applyEmoji(chars[i], cx)).child(chars[i]);
    return v_flex().gap(8).flex_1().min_h(0)
      .child(Input.new(this.search).h(30).px(10).rounded(8).border_1()
        .border_color(this.searchFocused ? t.accent : t.input).bg(t.background).text_size(12.5).text_color(t.foreground))
      .child(v_flex().id("si-grid").gap(2).children(rows.map((row) => h_flex().gap(2).children(row.map(cell)))))
      .child(h_flex().gap(8).items_center()
        .child(button("si-prev", "\u2039", false, (cx) => { this.page -= 1; cx.notify(); }, this.page > 0))
        .child(div().flex_1().text_size(11).text_color(t.dim)
          .child(hits.length ? `${hits.length} emoji · page ${this.page + 1}/${pages}` : "no emoji by that name"))
        .child(button("si-next", "\u203a", false, (cx) => { this.page += 1; cx.notify(); }, this.page < pages - 1)))
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().child(Input.new(this.emoji).h(30).px(10).rounded(8).border_1()
          .border_color(this.emojiFocused ? t.accent : t.input).bg(t.background).text_size(12.5).text_color(t.foreground)))
        .child(button("si-emoji", "Use typed", true, (cx) => this.applyEmoji(this.emoji.value(), cx), !this.busy))
        .child(button("si-paste", "Paste", false, (cx) => this.paste(cx), !this.busy)));
  }

  imageSection(t) {
    const button = (id, text, primary, action, enabled = true) => h_flex().id(id).h(32).px(14).items_center().rounded(8)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium()
      .when(enabled, (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)).on_click((_e, cx) => action(cx)))
      .when(!enabled, (el) => el.opacity(0.5))
      .child(text);
    return v_flex().gap(10).flex_1().min_h(0)
      .child(v_flex().id("si-drop").h(this.busy ? 46 : 70).rounded(10).border_1().border_dashed().border_color(t.input)
        .bg(t.background).items_center().justify_center().gap(3).text_size(12.5)
        .child(div().text_color(t.foreground).child(this.busy ? "Checking…" : "Drop a PNG, SVG or ICO here"))
        .child(div().text_size(11).text_color(t.dim).child("square PNG, at most 5 MB · ICO is converted to PNG")))
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().child(Input.new(this.path).h(32).px(10).rounded(8).border_1()
          .border_color(this.pathFocused ? t.accent : t.input).bg(t.background).text_size(12.5).text_color(t.foreground)))
        .child(button("si-apply", "Use image", true, (cx) => this.applyImage(this.path.value(), cx), !this.busy)))
      .child(div().text_size(11).text_color(t.dim).child("or drop it anywhere in this dialog"));
  }

  colorSection(t) {
    const chosen = this.color() ?? "ansi6";
    const button = (id, text, action) => h_flex().id(id).h(28).px(12).items_center().rounded(7)
      .border_1().border_color(t.input).bg(t.raised).text_color(t.foreground).text_size(12).font_medium()
      .cursor_pointer().hover((s) => s.opacity(0.88)).on_click((_e, cx) => action(cx)).child(text);
    return v_flex().gap(10).flex_1().min_h(0)
      .child(div().text_size(11).text_color(t.dim).child("behind the emoji or the letter"))
      .child(h_flex().gap(6).items_center().children(COLORS.map((name) =>
        h_flex().id(`si-color-${name}`).w(28).h(28).flex_none().rounded(8).bg(t[name] ?? t.accent)
          .border_1().border_color(chosen === name ? t.foreground : t.border)
          .cursor_pointer().hover((s) => s.border_color(t.foreground))
          .on_click((_e, cx) => this.setColor(name, cx)))))
      .child(h_flex().gap(6).items_center()
        .child(h_flex().id("si-color-transparent").h(28).px(8).flex_none().items_center().rounded(8).bg(t.background)
          .border_1().border_dashed().border_color(chosen === "transparent" ? t.foreground : t.border)
          .text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.border_color(t.foreground))
          .on_click((_e, cx) => this.setColor("transparent", cx)).child("none"))
        .child(div().flex_1())
        .child(div().w(104).child(Input.new(this.hex).h(28).px(8).rounded(8).border_1()
          .border_color(this.hexFocused ? t.accent : t.input).bg(t.background).text_size(12).text_color(t.foreground)))
        .child(button("si-color", "Use", (cx) => this.setColor(this.hex.value(), cx))));
  }

  render() {
    const t = theme();
    const p = this.p;
    const space = spaces().find((s) => s.id === p.spaceIcon);
    const current = readIcon((shared(KEY) ?? {})[p.spaceIcon]);
    const fill = this.fill(t);
    const chosen = this.color() ?? "ansi6";
    const button = (id, text, primary, action, enabled = true) => h_flex().id(id).h(32).px(14).items_center().rounded(8)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium()
      .when(enabled, (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)).on_click((_e, cx) => action(cx)))
      .when(!enabled, (el) => el.opacity(0.5))
      .child(text);
    const label = (text) => div().text_size(11).font_semibold().text_color(t.dim).child(text);
    const field = (input, focused) => Input.new(input).h(32).px(10).rounded(8).border_1()
      .border_color(focused ? t.accent : t.input).bg(t.background).text_size(12.5).text_color(t.foreground);
    const preview = current?.kind === "image"
      ? image(current.file).size(28).rounded(7)
      : current?.kind === "emoji"
        ? h_flex().size(28).rounded(7).when(Boolean(fill), (el) => el.bg(fill)).items_center().justify_center().text_size(17).child(current.char)
        : h_flex().size(28).rounded(7).when(Boolean(fill), (el) => el.bg(fill)).items_center().justify_center().font_bold()
          .text_color(fill ? "#ffffff" : t.foreground).child(space?.name?.[0]?.toUpperCase() ?? "?");
    return v_flex().id("space-icon").size_full().min_h(0).p(18).gap(10).bg(t.popover).text_color(t.foreground)
      .on_drop((e, cx) => {
        const file = e.paths?.find((path) => kindOf(path));
        if (!file) { this.error = "Drop a .png, .svg or .ico file."; cx.notify(); return; }
        this.path.set_value(file);
        this.applyImage(file, cx);
      })
      .child(h_flex().items_center().gap(10)
        .child(preview)
        .child(div().flex_1().truncate().text_size(15).font_semibold().child(`Icon for ${space?.name ?? "this space"}`))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(this.tabs(t))
      .child(this.body(t))
      .when(Boolean(this.error), (el) => el.child(div().text_size(12).text_color(t.blocked).child(this.error)))
      .child(h_flex().gap(8).items_center()
        .child(button("si-reset", "Use letter", false, (cx) => this.reset(cx), Boolean(current)))
        .child(div().flex_1())
        .child(button("si-cancel", "Cancel", false, () => closeOverlay(p.overlay))));
  }
}
