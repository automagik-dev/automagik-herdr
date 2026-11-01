// The Create / Edit form's rules (A13, mockup/create-form.dc.html renderVals): state from a
// bot, lead options, category visibility, the model line and pin list, validation, the
// entry a save writes and the matching herdr-bots line.
import { test } from "node:test";
import assert from "node:assert/strict";

import { commandOf, countTone, editChanged, entryOf, formFrom, leadOptions, modelInfo, modelLine, modelOptions, NEW_CATEGORY, placeOf, problemOf, rowLineOf, shellQuote, thousands } from "../mods/spaces-agents/formModel.js";
import { applyBotEdit, checkBots } from "../mods/spaces-agents/model.js";

const look = (character, colour) => ({ character, colour });
const FILE = {
  version: 1,
  categories: [{ id: "shared", title: "Shared" }, { id: "platform", title: "Platform" }],
  bots: [
    { id: "b-mainaaaaaa", name: "brain-orchestrator", kind: "main", look: look("octopus", "deepseek"), role: "", instructions: "", agent: "claude" },
    { id: "b-pmaaaaaaaa", name: "pm", kind: "member", look: look("bunny", "violet"), role: "", instructions: "", agent: "claude", category: "shared" },
    { id: "b-capaaaaaaa", name: "runtime-cap", kind: "member", look: look("whale", "blue"), role: "Captain", instructions: "", agent: "codex", category: "platform" },
    { id: "b-devaaaaaaa", name: "runtime-dev", kind: "member", look: look("hex", "sky"), role: "Builder", instructions: "x", agent: "codex", lead: "b-capaaaaaaa", model: "gpt-6.1-sol" },
    { id: "b-planaaaaaa", name: "access", kind: "member", look: look("gem", "rose"), role: "Access", instructions: "", planned: { wave: 3, note: "auth v2", owner: "kim" } },
  ],
};
const KEY = "/Users/x/brain-v3";
const CODEX = { codexConfig: 'model = "gpt-6.1-sol"\n', codexModels: JSON.stringify({ models: [{ slug: "gpt-6.1-sol" }, { slug: "gpt-6.1-terra" }] }) };
const create = (over = {}) => ({ ...formFrom({ mode: "create", file: FILE, id: "b-newaaaaaaa", agent: "codex" }), name: "runtime-qa", ...over });
const edit = (id) => formFrom({ mode: "edit", bot: FILE.bots.find((b) => b.id === id) });

test("shellQuote: bare plain words, single quotes otherwise", () => {
  assert.equal(shellQuote("runtime-dev"), "runtime-dev");
  assert.equal(shellQuote("/Users/x/brain v3"), "'/Users/x/brain v3'");
  assert.equal(shellQuote("it's"), "'it'\\''s'");
  assert.equal(shellQuote(""), "''");
  assert.equal(shellQuote("a;rm -rf /"), "'a;rm -rf /'");
});

test("thousands and the counter's tone", () => {
  assert.equal(thousands(4000), "4,000");
  assert.equal(thousands(123), "123");
  assert.equal(countTone(3600), "ok");
  assert.equal(countTone(3601), "near");
  assert.equal(countTone(4001), "over");
});

test("formFrom: create is the main bot in an empty project, else a member of the main bot", () => {
  assert.equal(formFrom({ file: { version: 1, categories: [], bots: [] }, id: "b-aaaaaaaaaa" }).kind, "main");
  assert.equal(formFrom({ file: null, id: "b-aaaaaaaaaa" }).kind, "main");
  const s = formFrom({ file: FILE, id: "b-aaaaaaaaaa", agent: "claude" });
  assert.equal(s.kind, "member");
  assert.equal(s.agent, "claude");
  assert.equal(s.lead, "");
  assert.ok(s.character && s.colour);
});

test("formFrom: edit fills every field from the stored bot", () => {
  const s = edit("b-devaaaaaaa");
  assert.deepEqual([s.name, s.kind, s.character, s.colour, s.role, s.agent, s.pin, s.lead, s.planned], ["runtime-dev", "member", "hex", "sky", "Builder", "codex", "gpt-6.1-sol", "b-capaaaaaaa", false]);
  const p = edit("b-planaaaaaa");
  assert.deepEqual([p.planned, p.wave, p.note], [true, 3, "auth v2"]);
});

test("leadOptions: main first, tree order with depth, no self, no bot under it, no planned bot", () => {
  const all = leadOptions(FILE, "b-newaaaaaaa");
  assert.deepEqual(all.map((o) => [o.name, o.depth, o.note]), [
    ["brain-orchestrator", 0, "Main bot"], ["pm", 1, "Shared"], ["runtime-cap", 1, "Captain · Platform"], ["runtime-dev", 2, "Builder"],
  ]);
  // The captain can't report to itself or to the dev under it.
  assert.deepEqual(leadOptions(FILE, "b-capaaaaaaa").map((o) => o.name), ["brain-orchestrator", "pm"]);
  assert.deepEqual(leadOptions({ version: 1, categories: [], bots: [] }, "x"), []);
});

test("placeOf: Main disabled with the reason; categories only when the main bot leads", () => {
  const s = create();
  const p = placeOf(s, FILE);
  assert.equal(p.why.main, "brain-orchestrator is this project's main bot.");
  assert.equal(p.why.member, null);
  assert.equal(p.leadId, "b-mainaaaaaa");
  assert.equal(p.byMain, true);
  const under = placeOf(create({ lead: "b-capaaaaaaa" }), FILE);
  assert.equal(under.byMain, false);
  assert.equal(under.underLead, true);
  assert.equal(under.lead.name, "runtime-cap");
  const first = placeOf(formFrom({ file: { version: 1, categories: [], bots: [] }, id: "b-aaaaaaaaaa" }), { version: 1, categories: [], bots: [] });
  assert.equal(first.why.member, "A project's first bot is its main bot.");
  assert.equal(placeOf(edit("b-mainaaaaaa"), FILE).why.member, "A bot's kind is set when it is created.");
  // A lead that may not lead (planned) shows as the main bot, flagged.
  const stale = placeOf({ ...edit("b-devaaaaaaa"), lead: "b-planaaaaaa" }, FILE);
  assert.equal(stale.leadId, "b-mainaaaaaa");
});

test("modelInfo / modelOptions: Default first, then only the agent's known models", () => {
  const info = modelInfo("codex", CODEX);
  assert.equal(info.def, "gpt-6.1-sol");
  assert.equal(info.from, "your Codex config");
  const opts = modelOptions(info);
  assert.deepEqual(opts.map((o) => o.label), ["Default (gpt-6.1-sol)", "gpt-6.1-sol", "gpt-6.1-terra"]);
  assert.equal(opts[0].id, "");
  assert.equal(opts[1].hint, "default");
  assert.deepEqual(modelOptions(modelInfo("omp", {})).map((o) => o.label), ["Default (its own)"]);
  // A stored pin the list lost stays selectable, marked.
  assert.equal(modelOptions(info, "gpt-5").at(-1).hint, "not in the list");
  assert.ok(modelInfo("claude", {}).models.includes("opus"));
});

test("modelLine: the mockup's three notes, and a live pane's model", () => {
  const info = modelInfo("codex", CODEX);
  assert.deepEqual(modelLine({ agentName: "Codex", pin: "", info }), { shown: "gpt-6.1-sol", note: "Codex's default, from your Codex config. Read from the running pane once started.", source: "default" });
  assert.equal(modelLine({ agentName: "Codex", pin: "gpt-6.1-terra", info }).note, "Pinned. Start runs Codex with this model; the sidebar shows what the pane really runs.");
  assert.equal(modelLine({ agentName: "Oh My Pi", pin: "", info: modelInfo("omp", {}) }).shown, "its own default");
  const live = modelLine({ agentName: "Codex", pin: "", info, detected: "gpt-6.1-terra", terminal: "t12" });
  assert.equal(live.shown, "gpt-6.1-terra");
  assert.equal(live.source, "detected");
});

test("rowLineOf: as the sidebar draws a stopped or planned bot", () => {
  assert.equal(rowLineOf(create({ role: "Builder" }), "gpt-6.1-sol"), "not running · Builder · gpt-6.1-sol");
  assert.equal(rowLineOf(create({ planned: true, wave: 2 }), "x"), "planned · wave 2 · no role · x");
});

test("problemOf: the CLI's refusals", () => {
  const ctx = { key: KEY, file: FILE, info: modelInfo("codex", CODEX) };
  assert.equal(problemOf(create(), ctx), null);
  assert.equal(problemOf(create(), { ...ctx, key: null }), "Pick the project folder first.");
  assert.match(problemOf(create(), { ...ctx, loadError: "bad file" }), /bad file/);
  assert.equal(problemOf(create({ name: "  " }), ctx), "Give the bot a name.");
  assert.match(problemOf(create({ name: "PM" }), ctx), /already has that name/);
  assert.equal(problemOf(edit("b-devaaaaaaa"), ctx), null); // its own name is not a twin
  assert.match(problemOf(create({ kind: "main" }), ctx), /already has a main bot, brain-orchestrator/);
  const empty = { version: 1, categories: [], bots: [] };
  assert.match(problemOf({ ...create(), kind: "member" }, { ...ctx, file: empty }), /first bot in a project must be its main bot/);
  assert.match(problemOf(create({ instructions: "x".repeat(4001) }), ctx), /4,001 characters; the limit is 4,000/);
  assert.match(problemOf(create({ agent: "" }), ctx), /Pick what it runs on/);
  assert.equal(problemOf(create({ agent: "", planned: true, wave: 2 }), ctx), null);
  assert.match(problemOf(create({ planned: true, wave: 0 }), ctx), /needs a wave/);
  assert.match(problemOf(create({ pin: "gpt-9" }), ctx), /isn't a model codex lists/);
  assert.match(problemOf(create({ category: NEW_CATEGORY }), ctx), /new category a title/);
  assert.equal(problemOf(create({ category: NEW_CATEGORY, lead: "b-capaaaaaaa" }), ctx), null); // no category under a captain
});

test("entryOf + applyBotEdit: a create writes a valid file", () => {
  const { entry, newCategory } = entryOf(create({ role: "QA", category: "platform", pin: "gpt-6.1-terra" }), FILE);
  assert.equal(newCategory, null);
  assert.equal(entry.lead, undefined); // the main bot is stored as no lead
  assert.equal(entry.category, "platform");
  assert.equal(entry.model, "gpt-6.1-terra");
  const out = applyBotEdit(FILE, entry);
  assert.deepEqual(checkBots(out), []);
  assert.equal(out.bots.at(-1).name, "runtime-qa");
});

test("entryOf: under a captain no category; a new category is added; planned keeps its other keys", () => {
  const under = entryOf(create({ lead: "b-capaaaaaaa", category: "platform" }), FILE).entry;
  assert.equal(under.lead, "b-capaaaaaaa");
  assert.equal(under.category, undefined);
  const made = entryOf(create({ category: NEW_CATEGORY, catTitle: "Quality", catSub: "tests" }), FILE);
  assert.deepEqual(made.newCategory, { title: "Quality", sub: "tests" });
  const out = applyBotEdit(FILE, made.entry, made.newCategory);
  assert.equal(out.bots.at(-1).category, "quality");
  const plan = { ...edit("b-planaaaaaa"), wave: 4 };
  assert.deepEqual(entryOf(plan, FILE).entry.planned, { wave: 4, note: "auth v2", owner: "kim" });
  assert.equal(entryOf({ ...plan, planned: false }, FILE).entry.planned, undefined);
});

test("entryOf: an untouched edit writes the bot back as stored", () => {
  for (const b of FILE.bots) {
    const out = applyBotEdit(FILE, entryOf(edit(b.id), FILE).entry);
    assert.deepEqual(out.bots.find((x) => x.id === b.id), b, b.name);
  }
  // A stale lead (planned) left alone stays stored; the view keeps warning on it.
  const raw = { ...FILE, bots: FILE.bots.map((b) => (b.id === "b-devaaaaaaa" ? { ...b, lead: "b-planaaaaaa" } : b)) };
  const s = formFrom({ mode: "edit", bot: raw.bots.find((b) => b.id === "b-devaaaaaaa") });
  assert.equal(entryOf(s, raw).entry.lead, "b-planaaaaaa");
});

test("commandOf create: the mockup's flag order, quoted, with --project", () => {
  const s = create({ name: "runtime-qa", role: "Test runner", lead: "b-capaaaaaaa", character: "hex", colour: "sky", pin: "gpt-6.1-terra", instructions: "Run the tests.\nReport." });
  assert.equal(commandOf(s, { key: KEY, file: FILE }),
    "herdr-bots create --name runtime-qa --agent codex --role 'Test runner' --lead b-capaaaaaaa --character hex --colour sky --model gpt-6.1-terra --project /Users/x/brain-v3 --instructions 'Run the tests.\nReport.'");
  const byMain = create({ category: "platform", character: "hex", colour: "sky", planned: true, wave: 2, note: "after auth" });
  assert.equal(commandOf(byMain, { key: KEY, file: FILE }),
    "herdr-bots create --name runtime-qa --agent codex --lead b-mainaaaaaa --category platform --character hex --colour sky --planned-wave 2 --planned-note 'after auth' --project /Users/x/brain-v3");
  const main = formFrom({ file: { version: 1, categories: [], bots: [] }, id: "b-aaaaaaaaaa", agent: "claude" });
  assert.match(commandOf({ ...main, name: "" }, { key: KEY, file: { version: 1, categories: [], bots: [] } }), /^herdr-bots create --name new-bot --kind main --agent claude --character/);
});

test("commandOf create: a new category is added first", () => {
  const s = create({ category: NEW_CATEGORY, catTitle: "Quality gate", catSub: "tests" });
  assert.match(commandOf(s, { key: KEY, file: FILE }),
    /^herdr-bots category add --title 'Quality gate' --sub tests --project \/Users\/x\/brain-v3 && herdr-bots create .* --category quality-gate /);
});

test("commandOf edit: only what changed, with the CLI's clearing spellings", () => {
  const initial = edit("b-devaaaaaaa");
  assert.equal(commandOf(initial, { key: KEY, file: FILE, initial }), "herdr-bots edit b-devaaaaaaa --project /Users/x/brain-v3");
  assert.equal(editChanged(initial, initial), false);
  const s = { ...initial, role: "Lead builder", pin: "", lead: "b-mainaaaaaa", category: "platform" };
  assert.equal(commandOf(s, { key: KEY, file: FILE, initial }),
    "herdr-bots edit b-devaaaaaaa --role 'Lead builder' --lead b-mainaaaaaa --category platform --no-model --project /Users/x/brain-v3");
  assert.equal(editChanged(s, initial), true);
  const plan = edit("b-planaaaaaa");
  assert.equal(commandOf({ ...plan, planned: false, agent: "claude" }, { key: KEY, file: FILE, initial: plan }),
    "herdr-bots edit b-planaaaaaa --agent claude --unplanned --project /Users/x/brain-v3");
  assert.equal(commandOf({ ...plan, note: "" }, { key: KEY, file: FILE, initial: plan }),
    "herdr-bots edit b-planaaaaaa --planned-wave 3 --planned-note '' --project /Users/x/brain-v3");
  const pm = edit("b-pmaaaaaaaa");
  assert.equal(commandOf({ ...pm, category: "" }, { key: KEY, file: FILE, initial: pm }),
    "herdr-bots edit b-pmaaaaaaaa --no-category --project /Users/x/brain-v3");
});
