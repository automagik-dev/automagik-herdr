// The Create / Edit form, and the Attach picker: the pack opened as a Herdr dialog
// (props.form "create" | "edit" | "attach"). Text fields are Herdr's Input and Textarea;
// choices are pills, as in Herdr's own automations form. The form reads the project's
// .herdr/bots.json itself and writes back its raw copy with the text it read as the
// snapshot, so an entry it can't show, or someone's edit since, is never lost. Apache-2.0.

import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { theme, readTextFile, pickFolder, knownAgents, closeOverlay, spaces, focused, run } from "herdr";
import { BOTS_PATH, CHARACTERS, COLOURS, MAX_INSTRUCTIONS, OMNI_LOOK, parseBots, mainBotOf, newBotId, defaultLook, applyBotEdit } from "./model.js";
import { discoverProjects, keyOf, writeBots } from "./bots.js";
import { attachBot } from "./launch.js";

const base = (p) => String(p ?? "").split("/").filter(Boolean).pop() ?? p;

export class BotForm {
  constructor(p, cx) {
    this.p = p;
    this.mode = p.form;
    this.error = null; // why it can't be saved, shown above the buttons
    this.busy = false;
    if (this.mode === "attach") {
      this.projects = null;
      cx.spawn(async (cx) => {
        try { this.projects = (await discoverProjects()).filter((q) => !q.machine); } catch (e) { this.error = String(e?.message ?? e); }
        cx.notify();
      });
      return;
    }
    const field = (placeholder) => InputState.new({ placeholder });
    this.name = field("Name");
    this.role = field("Role, one line");
    this.model = field("Model, shown only (e.g. GPT-6.1 Sol)");
    this.wave = field("1");
    this.note = field("What it waits for");
    this.catTitle = field("Category title");
    this.catSub = field("Subtitle (optional)");
    this.instructions = TextareaState.new({ placeholder: "Instructions" });
    this.instructions.set_auto_grow(4, 12);
    this.instructions.on("change", (_e, cx) => cx.notify());
    this.id = this.mode === "create" ? newBotId() : null; // kept across a change of project
    this.kind = "member";
    this.look = this.id ? defaultLook(this.id) : null;
    this.agent = "";
    this.lead = "";
    this.category = "";
    this.planned = false;
    this.agents = [];
    cx.spawn(async (cx) => {
      try { this.agents = (await knownAgents()).sort((a, b) => Number(b.installed) - Number(a.installed)); } catch {}
      try { await this.open(cx); } catch (e) { this.error = String(e?.message ?? e); }
      cx.notify();
    });
  }

  // Which project, then its file as it is now (kept as the write's snapshot).
  async open(cx) {
    let key = this.p.project ?? null;
    if (this.mode === "edit" && !key) {
      const hit = (await discoverProjects()).find((q) => q.file.bots.some((b) => b.id === this.p.bot));
      if (!hit) throw new Error(`No project has bot ${this.p.bot}.`);
      if (hit.machine) throw new Error(`${this.p.bot} is defined on ${hit.machine}; the form edits this computer's projects only.`);
      key = hit.key;
    }
    if (!key) {
      const shown = spaces().find((s) => s.id === focused()?.space && !s.machine);
      if (shown?.folder) key = await keyOf(shown.folder);
    }
    if (key) await this.load(key);
    cx.notify();
  }

  async load(key) {
    this.key = key;
    this.loadError = null;
    this.text = await readTextFile(`${key}/${BOTS_PATH}`);
    let file = { version: 1, categories: [], bots: [] };
    this.raw = null;
    if (this.text !== null) {
      try { ({ file, raw: this.raw } = parseBots(this.text)); } catch (e) {
        this.loadError = `${key}/${BOTS_PATH} can't be read (${e?.message ?? e}); fix it by hand before adding bots.`;
      }
    }
    this.file = file;
    if (this.mode === "edit") {
      const b = file.bots.find((x) => x.id === this.p.bot);
      if (!b) throw new Error(`${key}/${BOTS_PATH} has no bot ${this.p.bot}.`);
      this.fill(b);
    } else {
      this.look ??= defaultLook(this.id);
      this.kind = mainBotOf(file) ? "member" : "main";
      if (!this.agent) this.agent = this.agents.find((a) => a.installed)?.key ?? "";
    }
  }

  fill(b) {
    this.id = b.id;
    this.kind = b.kind;
    this.look = { ...b.look };
    this.name.set_value(b.name);
    this.role.set_value(b.role ?? "");
    this.model.set_value(b.model ?? "");
    this.instructions.set_value(b.instructions ?? "");
    this.agent = b.agent ?? "";
    this.lead = b.lead ?? "";
    this.category = b.category ?? "";
    this.planned = Boolean(b.planned);
    this.wave.set_value(b.planned ? String(b.planned.wave) : "");
    this.note.set_value(b.planned?.note ?? "");
  }

  // The form's fields as a bot entry, or why not.
  entry() {
    const name = this.name.value().trim();
    const instructions = this.instructions.value();
    const wave = Number(this.wave.value().trim());
    if (!this.key) return { why: "Pick the project folder first." };
    if (this.loadError) return { why: this.loadError };
    if (!name) return { why: "Give the bot a name." };
    if (instructions.length > MAX_INSTRUCTIONS) return { why: `Instructions are ${instructions.length} characters; the limit is ${MAX_INSTRUCTIONS}.` };
    if (this.planned && !(Number.isInteger(wave) && wave > 0)) return { why: "A planned bot needs a wave: a whole number from 1." };
    if (!this.planned && !this.agent) return { why: "Pick a coding agent (or mark the bot planned)." };
    if (this.category === "+new" && !this.catTitle.value().trim()) return { why: "Give the new category a title." };
    const note = this.note.value().trim();
    return {
      entry: {
        id: this.id, name, kind: this.kind, look: this.look, role: this.role.value().trim(), instructions,
        agent: this.agent || undefined, model: this.model.value().trim() || undefined,
        lead: this.kind === "member" ? this.lead || undefined : undefined,
        category: this.category && this.category !== "+new" ? this.category : undefined,
        planned: this.planned ? (note ? { wave, note } : { wave }) : undefined,
      },
      newCategory: this.category === "+new" ? { title: this.catTitle.value(), sub: this.catSub.value() } : null,
    };
  }

  save(cx) {
    if (this.busy) return;
    const made = this.entry();
    if (made.why) { this.error = made.why; cx.notify(); return; }
    this.busy = true;
    this.error = null;
    cx.spawn(async (cx) => {
      try {
        await writeBots(this.key, applyBotEdit(this.raw, made.entry, made.newCategory), this.text);
        run("spaces-agents.refresh");
        closeOverlay(this.p.overlay);
      } catch (e) {
        const msg = String(e?.message ?? e);
        this.error = /stale/i.test(msg) ? `${this.key}/${BOTS_PATH} changed since this form opened; close it and open it again.` : msg;
      }
      this.busy = false;
      cx.notify();
    });
  }

  attach(project, bot, cx) {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    cx.spawn(async (cx) => {
      const r = await attachBot(project.key, bot.id, this.p.terminal);
      this.busy = false;
      if (r.refused) this.error = r.refused;
      else { run("spaces-agents.refresh"); closeOverlay(this.p.overlay); }
      cx.notify();
    });
  }

  // ---- drawing (automations' helpers) ----

  button(id, label, t, onClick, opts = {}) {
    return h_flex().id(id).h(opts.h ?? 26).px(9).flex_none().items_center().justify_center().rounded(7).text_size(12)
      .bg(opts.solid ? t.solid : t.raised).text_color(opts.solid ? t.solid_foreground : t.foreground)
      .border_1().border_color(opts.solid ? t.solid : t.border).cursor_pointer().hover((s) => s.opacity(0.85))
      .on_click((_e, cx) => onClick(cx)).child(label);
  }

  pills(id, options, value, t, pick) {
    return h_flex().flex_wrap().gap(5).children(options.map(([v, label]) =>
      h_flex().id(`${id}-${v || "none"}`).h(24).px(8).items_center().rounded(6).text_size(12).cursor_pointer()
        .bg(v === value ? t.selected : t.raised).text_color(v === value ? t.foreground : t.muted)
        .border_1().border_color(v === value ? t.accent : t.border).hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { pick(v); cx.notify(); }).child(label)));
  }

  render(cx) {
    const t = theme();
    const title = this.mode === "attach" ? `Attach ${this.p.terminal} as a bot` : this.mode === "edit" ? "Edit bot" : "New bot";
    const body = this.mode === "attach" ? this.attachBody(t) : this.formBody(t, cx);
    return v_flex().id("bot-form").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background)
      .border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).items_center().border_b(1).border_color(t.border).child(div().font_semibold().child(title)))
      .child(div().id("bot-form-body").flex_1().min_h(0).overflow_y_scrollbar().child(body))
      .child(v_flex().flex_none().px(14).py(10).gap(8).border_t(1).border_color(t.border)
        .when(Boolean(this.error), (el) => el.child(div().text_size(12).text_color(t.ansi1).child(this.error)))
        .child(h_flex().gap(8).justify_end()
          .child(this.button("bot-cancel", "Cancel", t, () => closeOverlay(this.p.overlay)))
          .when(this.mode !== "attach", (el) => el.child(this.button("bot-save", this.busy ? "Saving…" : "Save", t, (cx) => this.save(cx), { solid: true })))));
  }

  attachBody(t) {
    const label = (s) => div().pt(8).text_size(11).font_semibold().text_color(t.dim).child(s);
    if (!this.projects) return div().p(14).text_color(t.muted).child("Finding bots…");
    const rows = this.projects.flatMap((q) => {
      const bots = q.file.bots.filter((b) => !b.planned);
      if (!bots.length) return [];
      return [label(base(q.key).toUpperCase()), ...bots.map((b) =>
        h_flex().id(`pick-${b.id}`).h(30).px(8).gap(8).items_center().rounded(7).cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.attach(q, b, cx))
          .child(div().flex_none().child(b.name))
          .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(b.kind === "main" ? "Main bot" : b.role)))];
    });
    return v_flex().p(14).gap(2).children(rows.length ? rows : [div().text_color(t.muted).child("No bots on this computer yet. Create one first.")]);
  }

  formBody(t, cx) {
    const label = (s) => div().pt(8).text_size(11).font_semibold().text_color(t.dim).child(s);
    const box = (id, el) => div().id(id).min_h(30).px(9).py(4).flex().items_center().rounded(7).border_1().border_color(t.input).bg(t.surface ?? t.background).child(el);
    const input = (id, state) => box(id, Input.new(state).w_full().text_size(12));
    const pick = (cx) => cx.spawn(async (cx) => {
      const dir = await pickFolder({ prompt: "Use this project" });
      if (dir) { try { await this.load(await keyOf(dir)); this.error = null; } catch (e) { this.error = String(e?.message ?? e); } }
      cx.notify();
    });
    const main = mainBotOf(this.file ?? { bots: [] });
    const count = this.instructions.value().length;
    const leads = (this.file?.bots ?? []).filter((b) => b.kind === "member" && !b.planned && b.id !== this.id);
    const cats = this.file?.categories ?? [];
    const look = this.look ?? { character: "", colour: "" };
    const el = v_flex().p(14).gap(4)
      .child(label("PROJECT")).child(h_flex().gap(6)
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(this.key ? t.foreground : t.muted).child(this.key ?? "No project picked"))
        .when(this.mode === "create", (el) => el.child(this.button("bot-pick", "Choose…", t, pick))))
      .when(Boolean(this.loadError), (el) => el.child(div().text_size(12).text_color(t.ansi1).child(this.loadError)))
      .child(div().text_size(11.5).text_color(t.muted).child(this.kind === "main"
        ? (this.mode === "create" ? "This project has no main bot yet: this one is its main bot." : "The project's main bot.")
        : `A team member${main ? ` of ${main.name}` : ""}.`))
      .child(label("NAME")).child(input("bot-name", this.name))
      .child(label("CHARACTER")).child(this.pills("bot-char", CHARACTERS.map((c) => [c, c]), look.character, t, (v) => { this.look = { ...look, character: v }; }))
      .child(label("COLOUR")).child(this.pills("bot-colour", COLOURS.map((c) => [c, c]), look.colour, t, (v) => { this.look = { ...look, colour: v }; }))
      .child(h_flex().gap(6).pt(4)
        .child(this.button("bot-look-default", "Default look", t, (cx) => { this.look = defaultLook(this.id); cx.notify(); }))
        .child(this.button("bot-look-omni", "Omni (octopus, deepseek)", t, (cx) => { this.look = { ...OMNI_LOOK }; cx.notify(); })))
      .child(label("ROLE")).child(input("bot-role", this.role))
      .child(label(`INSTRUCTIONS · ${count} / ${MAX_INSTRUCTIONS}`))
      .child(div().id("bot-instructions").p(8).rounded(7).border_1().border_color(count > MAX_INSTRUCTIONS ? t.ansi1 : t.input)
        .child(Textarea.new(this.instructions).w_full().text_size(12)))
      .when(count > MAX_INSTRUCTIONS, (el) => el.child(div().text_size(12).text_color(t.ansi1).child(`${count - MAX_INSTRUCTIONS} characters over the limit of ${MAX_INSTRUCTIONS}; it can't be saved like this.`)))
      .child(label("CODING AGENT")).child(this.pills("bot-agent",
        [...this.agents.map((a) => [a.key, a.installed ? a.name : `${a.name} (not installed)`]),
          ...(this.agent && !this.agents.some((a) => a.key === this.agent) ? [[this.agent, this.agent]] : [])],
        this.agent, t, (v) => { this.agent = v; }))
      .child(label("MODEL (SHOWN ONLY)")).child(input("bot-model", this.model));
    const member = this.kind === "member";
    return el
      .when(member, (el) => el.child(label("REPORTS TO")).child(this.pills("bot-lead",
        [["", main ? `${main.name} (main bot)` : "Main bot"], ...leads.map((b) => [b.id, b.name])], this.lead, t,
        (v) => { this.lead = v; if (v) this.category = ""; })))
      .when(member && !this.lead, (el) => el.child(label("CATEGORY")).child(this.pills("bot-cat",
        [["", "None"], ...cats.map((c) => [c.id, c.title]), ["+new", "New category…"]], this.category, t, (v) => { this.category = v; })))
      .when(member && !this.lead && this.category === "+new", (el) => el.child(input("bot-cat-title", this.catTitle)).child(input("bot-cat-sub", this.catSub)))
      .child(label("PLANNED")).child(this.pills("bot-planned", [["no", "Not planned"], ["yes", "Planned"]], this.planned ? "yes" : "no", t,
        (v) => { this.planned = v === "yes"; }))
      .when(this.planned, (el) => el.child(label("WAVE")).child(input("bot-wave", this.wave)).child(label("NOTE")).child(input("bot-note", this.note)));
  }
}
