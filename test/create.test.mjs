// The bot form (create.js) under `node --test`, with gpui and herdr stood in for
// (gpui-stub.mjs, form-herdr-stub.mjs): what it lists, what Copy copies, how a save or a
// Start that fails is reported, and that a picture it can't write is not retried.
import { registerHooks } from "node:module";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = (f) => new URL(f, import.meta.url).href;
const stubs = { herdr: here("./form-herdr-stub.mjs"), "fs/promises": here("./fs-stub.mjs"), "gpui-kit": here("./gpui-stub.mjs"), "gpui-base": here("./gpui-stub.mjs") };
const fromPack = (context) => context.parentURL?.includes("/mods/spaces-agents/");
registerHooks({
  resolve: (specifier, context, next) => (stubs[specifier] && fromPack(context) ? { url: stubs[specifier], shortCircuit: true } : next(specifier, context)),
});
const { state } = await import(stubs.herdr);
const { nodes, textOf, index, all } = await import(stubs["gpui-kit"]);
const { BotForm, FORM_SIZE } = await import("../mods/spaces-agents/create.js");

const look = (character, colour) => ({ character, colour });
const MAIN = { id: "b-mainaaaaaa", name: "orch", kind: "main", look: look("octopus", "deepseek"), role: "", instructions: "", agent: "claude" };
const OMP = { id: "b-ompaaaaaaa", name: "pi-bot", kind: "member", look: look("hex", "sky"), role: "r", instructions: "", agent: "omp", model: "kimi-k3" };
const KIMI = { id: "b-kimiaaaaaa", name: "kimi-bot", kind: "member", look: look("gem", "rose"), role: "r", instructions: "", agent: "kimi" };
const AGENTS = [
  { key: "claude", name: "Claude Code", installed: true, icon: "icons/claude.svg", tint: false },
  { key: "omp", name: "Oh My Pi", installed: true, icon: "icons/pi.svg", tint: true },
  { key: "kimi", name: "Kimi", installed: false, icon: "icons/kimi.svg", tint: false },
  { key: "amp", name: "Amp", installed: false, icon: "icons/amp.svg", tint: false },
];

function makeCx() {
  const cx = {
    pending: [], spawns: 0, notifies: 0, clip: null,
    spawn(fn) { cx.spawns += 1; const p = Promise.resolve().then(() => fn(cx)); cx.pending.push(p); return p; },
    notify() { cx.notifies += 1; },
    write_to_clipboard(text) { cx.clip = text; },
    stop_propagation() {},
  };
  cx.settle = async () => { for (let i = 0; i < 100 && cx.pending.length; i += 1) await Promise.allSettled(cx.pending.splice(0)); };
  return cx;
}

let root, project;
beforeEach((t) => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "hb-create-")));
  t.after?.(() => rmSync(root, { recursive: true, force: true }));
  project = join(root, "proj");
  mkdirSync(join(project, ".herdr"), { recursive: true });
  state.appHome = join(root, "app");
  state.notes = [];
  state.closed = [];
  state.runs = [];
  state.spaces = [];
  state.terminals = [];
  state.agents = AGENTS;
  state.hcAnswer = () => ({ code: 0, stdout: "{}", stderr: "" });
});

const seed = (bots, extra = {}) => writeFileSync(join(project, ".herdr/bots.json"), `${JSON.stringify({ version: 1, categories: [], bots, ...extra }, null, 2)}\n`);
const stored = () => JSON.parse(readFileSync(join(project, ".herdr/bots.json"), "utf8"));
async function open(props) {
  const cx = makeCx();
  const form = new BotForm({ overlay: "o9", project, ...props }, cx);
  await cx.settle();
  return { form, cx, draw: () => index(form.render(cx)), click: async (id) => { nodes.get(id).click(null, cx); await cx.settle(); } };
}

test("FORM_SIZE is the mockup's 1000 x 840", () => {
  assert.deepEqual(FORM_SIZE, { width: 1000, height: 840 });
});

test("Runs on: installed agents only, plus the bot's own agent when it isn't installed", async () => {
  seed([MAIN, KIMI]);
  const { draw } = await open({ form: "create" });
  draw();
  assert.ok(nodes.has("bot-agent-claude") && nodes.has("bot-agent-omp"));
  assert.ok(!nodes.has("bot-agent-kimi") && !nodes.has("bot-agent-amp"));
  const e = await open({ form: "edit", bot: KIMI.id });
  e.draw();
  assert.ok(nodes.has("bot-agent-kimi"), "the bot's own agent stays shown");
  assert.equal(nodes.get("bot-agent-kimi").props.opacity, 0.45);
  assert.ok(!nodes.has("bot-agent-amp"));
});

test("Runs on: a knownAgents() failure is shown, not swallowed", async () => {
  seed([MAIN]);
  Object.defineProperty(state, "agents", { configurable: true, get() { throw new Error("no program table"); } });
  try {
    const { form, draw } = await open({ form: "create" });
    assert.match(textOf(draw()), /couldn't list its coding agents \(no program table\)/);
    assert.ok(form.agentsError);
  } finally {
    Object.defineProperty(state, "agents", { configurable: true, writable: true, value: AGENTS });
  }
});

test("a stored pin can be cleared when the agent lists no models", async () => {
  seed([MAIN, OMP]);
  const { form, draw, click } = await open({ form: "edit", bot: OMP.id });
  draw();
  assert.ok(nodes.has("bot-pin"), "the pin control shows for a stored pin");
  form.pop = "models";
  draw();
  await click("bot-pin-0"); // Default
  assert.equal(form.s.pin, "");
  draw();
  assert.ok(!nodes.has("bot-pin"), "no list and no pin: no control");
});

test("Copy copies only a line the form would save; a refused one shows why", async () => {
  seed([MAIN]);
  const { form, cx, draw, click } = await open({ form: "create" });
  draw();
  await click("bot-copy");
  assert.equal(cx.clip, null);
  assert.equal(form.error, "Not copied: Give the bot a name.");
  form.inputs.name.type("qa", cx);
  draw();
  await click("bot-copy");
  assert.match(cx.clip, /^automagik-herdr create --name=qa /);
  // The model is read once per agent, not on every render.
  assert.ok(form.models.has("claude"));
});

test("a refused write says Not saved once", async () => {
  // An entry parseBots leaves out (a bad id) stays in the raw copy, so checkBots refuses the write.
  seed([MAIN, { id: "x", name: "broken", kind: "member" }]);
  const { form, cx, draw, click } = await open({ form: "create" });
  form.inputs.name.type("qa", cx);
  draw();
  await click("bot-save");
  assert.match(form.error, /^Not saved: x: id is not b- plus 10 base32 characters/);
  assert.doesNotMatch(form.error, /Not saved: Not saved/);
});

test("Create & start: a Start that throws after the save says Saved, not started", async () => {
  seed([MAIN]);
  const { form, cx, draw, click } = await open({ form: "create" });
  form.inputs.name.type("qa", cx);
  draw();
  Object.defineProperty(state, "terminals", { configurable: true, get() { throw new Error("terminals gone"); } });
  try {
    await click("bot-save-start");
  } finally {
    Object.defineProperty(state, "terminals", { configurable: true, writable: true, value: [] });
  }
  assert.match(form.error, /^Saved, not started: /);
  assert.ok(stored().bots.some((b) => b.name === "qa"), "the bot was saved");
  draw();
  assert.ok(!nodes.has("bot-save") && !nodes.has("bot-save-start"), "not offered a second time");
  assert.deepEqual(state.closed, []);
});

test("a character picture that can't be written is not retried, and one notice names the folder", async () => {
  seed([MAIN]);
  writeFileSync(join(root, "app"), "a file where the app home should be");
  const { form, cx, draw, click } = await open({ form: "create" });
  const spawns = cx.spawns;
  assert.equal(state.notes.length, 1);
  assert.match(state.notes[0].body, new RegExp(`${root}/app/spaces-agents-pets`));
  assert.ok(form.petsFailed.size > 0 && form.pets.size === 0);
  // Redraws and a new colour: no endless retry, no second notice.
  draw(); draw();
  await cx.settle();
  assert.equal(cx.spawns, spawns);
  draw();
  await click("bot-colour-rose");
  assert.ok(cx.spawns <= spawns + 1);
  assert.equal(state.notes.length, 1);
});

test("character pictures are written under the app home outside mods/ and drawn", async () => {
  seed([MAIN]);
  const { form } = await open({ form: "create" });
  assert.ok(form.pets.size >= 22);
  const file = [...form.pets][0];
  assert.match(readFileSync(join(root, "app/spaces-agents-pets", file), "utf8"), /^<svg /);
});

test("the mockup's six icons are SVG files under the app home, drawn tinted with svg()", async () => {
  seed([MAIN]);
  const { form, draw } = await open({ form: "create" });
  for (const name of ["folder", "clock", "shuffle", "chevron", "close", "copy"]) {
    assert.match(readFileSync(join(root, "app/spaces-agents-pets", `ui-${name}.svg`), "utf8"), /^<svg [^>]*stroke="currentColor"/, name);
  }
  const drawn = all(draw()).filter((n) => n.kind === "svg" && /^spaces-agents-pets\/ui-/.test(n.arg));
  assert.deepEqual([...new Set(drawn.map((n) => n.arg))].sort(),
    ["chevron", "clock", "close", "copy", "folder", "shuffle"].map((n) => `spaces-agents-pets/ui-${n}.svg`));
  assert.ok(drawn.every((n) => /^#[0-9a-f]{6}$/i.test(n.props.color)), "each one tinted");
  assert.ok(form.pets.has("ui-close.svg"));
});
