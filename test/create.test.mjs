// The bot form (create.js) under `node --test`, with gpui and herdr stood in for
// (gpui-stub.mjs, form-herdr-stub.mjs): what it lists, what Copy copies, how a save or a
// Start that fails is reported, and that a picture it can't write is not retried.
import { registerHooks } from "node:module";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = (f) => new URL(f, import.meta.url).href;
const stubs = { herdr: here("./form-herdr-stub.mjs"), "fs/promises": here("./fs-stub.mjs"), "gpui-kit": here("./gpui-stub.mjs"), "gpui-base": here("./gpui-stub.mjs") };
const fromPack = (context) => context.parentURL?.includes("/mods/am-sidebar/");
registerHooks({
  resolve: (specifier, context, next) => (stubs[specifier] && fromPack(context) ? { url: stubs[specifier], shortCircuit: true } : next(specifier, context)),
});
const { state } = await import(stubs.herdr);
const { nodes, textOf, index, all } = await import(stubs["gpui-kit"]);
const { BotForm, FORM_SIZE } = await import("../mods/am-sidebar/create.js");

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
  state.focused = null;
  state.pickFolder = null;
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

test("Runs on: gemini is never offered; a gemini bot opens on Antigravity", async () => {
  state.agents = [...AGENTS,
    { key: "gemini", name: "Gemini", installed: true, icon: "icons/gemini.svg", tint: false },
    { key: "antigravity", name: "Antigravity", installed: false, icon: "icons/antigravity.svg", tint: false }];
  const GEM = { ...KIMI, id: "b-gemaaaaaaa", name: "gem-bot", agent: "gemini" };
  seed([MAIN, GEM]);
  const { draw } = await open({ form: "create" });
  draw();
  assert.ok(!nodes.has("bot-agent-gemini"), "installed, but retired");
  const e = await open({ form: "edit", bot: GEM.id });
  e.draw();
  assert.ok(!nodes.has("bot-agent-gemini"));
  assert.ok(nodes.has("bot-agent-antigravity"), "the mapped agent is the bot's own");
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
  assert.match(state.notes[0].body, new RegExp(`${root}/app/am-sidebar-pets`));
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
  assert.match(readFileSync(join(root, "app/am-sidebar-pets", file), "utf8"), /^<svg /);
});

test("the mockup's six icons are SVG files under the app home, drawn tinted with svg()", async () => {
  seed([MAIN]);
  const { form, draw } = await open({ form: "create" });
  for (const name of ["folder", "clock", "shuffle", "chevron", "close", "copy"]) {
    assert.match(readFileSync(join(root, "app/am-sidebar-pets", `ui-${name}.svg`), "utf8"), /^<svg [^>]*stroke="currentColor"/, name);
  }
  const drawn = all(draw()).filter((n) => n.kind === "svg" && /^am-sidebar-pets\/ui-/.test(n.arg));
  assert.deepEqual([...new Set(drawn.map((n) => n.arg))].sort(),
    ["chevron", "clock", "close", "copy", "folder", "shuffle"].map((n) => `am-sidebar-pets/ui-${n}.svg`));
  assert.ok(drawn.every((n) => /^#[0-9a-f]{6}$/i.test(n.props.color)), "each one tinted");
  assert.ok(form.pets.has("ui-close.svg"));
});

test("Rank chips (A16): shown for a member, picked into the save and the copied line; None clears", async () => {
  seed([MAIN]);
  const { form, cx, draw, click } = await open({ form: "create" });
  form.inputs.name.type("qa", cx);
  draw();
  assert.ok(nodes.has("bot-rank-none") && nodes.has("bot-rank-tester") && nodes.has("bot-rank-fixer") && !nodes.has("bot-rank-main"));
  await click("bot-rank-tester");
  draw();
  await click("bot-copy");
  assert.match(cx.clip, / --rank=tester /);
  await click("bot-rank-none");
  draw();
  await click("bot-copy");
  assert.doesNotMatch(cx.clip, /--rank/);
  await click("bot-rank-fixer");
  draw();
  await click("bot-copy");
  assert.match(cx.clip, / --rank=fixer /);
  await click("bot-rank-pm");
  draw();
  await click("bot-save");
  assert.equal(stored().bots.find((b) => b.name === "qa").rank, "pm");
});

test("Rank chips are not offered for the main bot", async () => {
  seed([]);
  const { draw } = await open({ form: "create" });
  draw();
  assert.ok(!nodes.has("bot-rank-none"));
});

test("Bot settings (pick) with no bot: one New bot line that opens the Create form and closes the list", async () => {
  state.spaces = [{ id: "s1", folder: project, machine: null }];
  seed([]);
  const { draw, click } = await open({ form: "pick" });
  draw();
  assert.ok(nodes.has("pick-new"));
  assert.equal(textOf(nodes.get("bot-form-body")), "New bot");
  state.opened = [];
  await click("pick-new");
  assert.deepEqual(state.opened, [{ mod: "am-sidebar", kind: "dialog", modal: true, ...FORM_SIZE, props: { form: "create" } }]);
  assert.deepEqual(state.closed, ["o9"]);
});

test("Bot settings (pick) with bots: the bots with Edit / Start, no New bot line", async () => {
  state.spaces = [{ id: "s1", folder: project, machine: null }];
  seed([MAIN, OMP]);
  const { draw } = await open({ form: "pick" });
  draw();
  assert.ok(!nodes.has("pick-new"));
  assert.ok(nodes.has(`pick-${MAIN.id}`) && nodes.has(`edit-${OMP.id}`) && nodes.has(`start-${OMP.id}`));
});

test("Start in Bot settings with no space on the project: one space opened, waited for on the form's timer, the bot in it", async () => {
  state.agents = [{ key: "claude", name: "Claude Code", installed: true, run: ["claude"] }];
  state.hcCalls = [];
  state.hcAnswer = (args) => (args[0] === "run" ? { code: 0, stdout: JSON.stringify({ address: "t42" }), stderr: "" }
    : { code: 1, stdout: "", stderr: "no such terminal" });
  // Herdr shows the space a little after space.new.
  state.runFault = (name) => {
    if (name === "space.new") setTimeout(() => { state.spaces = [{ id: "s5", folder: project, machine: null, active: true, tabs: [{ id: "t5", active: true }] }]; }, 30);
  };
  seed([MAIN]);
  // Its space closed: the project is found as a remembered one.
  state.shared.set("am.sidebar.projects", [{ key: project, machine: null }]);
  try {
    const { cx, draw, click } = await open({ form: "pick" });
    cx.timer = { after(ms, fn) { setTimeout(() => fn(cx), ms); } };
    draw();
    await click(`start-${MAIN.id}`);
  } finally { state.runFault = null; state.shared.delete("am.sidebar.projects"); }
  assert.equal(state.runs.filter(([name]) => name === "space.new").length, 1);
  assert.ok(state.hcCalls.find((a) => a[0] === "run").includes("herdr.space=s5"));
});

test("Attach with no bot keeps its message (the New bot line is the pick list's alone)", async () => {
  state.spaces = [{ id: "s1", folder: project, machine: null }];
  seed([]);
  const { draw } = await open({ form: "attach", terminal: "t1" });
  draw();
  assert.ok(!nodes.has("pick-new"));
  assert.match(textOf(nodes.get("bot-form-body")), /No bots on this computer yet/);
});

// The owner's case: a folder outside git (child) under a folder holding another project's
// bots.json (repos). `project` is the parent here, seeded with its main bot.
function underParent() {
  const child = join(project, "child");
  mkdirSync(child);
  return child;
}
const kindWhy = (kind) => nodes.get(`bot-kind-${kind}`)?.props.tooltip ?? null;

test("a folder picked outside git is its own project, even under another project's folder: Main bot, saved there", async () => {
  seed([MAIN]);
  const parentBefore = readFileSync(join(project, ".herdr/bots.json"), "utf8");
  const child = underParent();
  state.pickFolder = child;
  const { form, cx, draw, click } = await open({ form: "create", project: undefined });
  draw();
  assert.match(textOf(nodes.get("bot-project")), /Pick a project…/);
  await click("bot-project");
  assert.equal(form.key, child);
  assert.equal(form.s.kind, "main", "a new project's first bot is its main bot");
  draw();
  assert.equal(kindWhy("main"), null, "Main bot is offered");
  assert.equal(kindWhy("member"), "A project's first bot is its main bot.");
  form.inputs.name.type("Child", cx);
  draw();
  await click("bot-save");
  assert.equal(form.error, null);
  const saved = JSON.parse(readFileSync(join(child, ".herdr/bots.json"), "utf8"));
  assert.deepEqual(saved.bots.map((b) => [b.name, b.kind]), [["Child", "main"]]);
  assert.equal(readFileSync(join(project, ".herdr/bots.json"), "utf8"), parentBefore, "the parent project is untouched");
});

test("a focused space whose folder is gone is not keyed: the form asks for the project", async () => {
  seed([MAIN]);
  state.spaces = [{ id: "s1", name: "gone", folder: join(project, "gone") }];
  state.focused = { space: "s1" };
  const { form, draw } = await open({ form: "create", project: undefined });
  draw();
  assert.ok(!form.key);
  assert.match(textOf(nodes.get("bot-project")), /Pick a project…/);
  assert.ok(!nodes.has("bot-project-parent") && !nodes.has("bot-project-own"));
});

test("a focused folder under another project's folder is offered both ways, never assumed", async () => {
  seed([MAIN]);
  const child = underParent();
  state.spaces = [{ id: "s1", name: "child", folder: child }];
  state.focused = { space: "s1" };
  const { form, draw, click } = await open({ form: "create", project: undefined });
  draw();
  assert.ok(!form.key, "the parent's project is not assumed");
  assert.equal(textOf(nodes.get("bot-project-parent")), "proj (parent project)");
  assert.equal(textOf(nodes.get("bot-project-own")), "Make child its own project");
  await click("bot-project-own");
  assert.equal(form.key, child);
  assert.equal(form.s.kind, "main");
  draw();
  assert.ok(!nodes.has("bot-project-parent"), "the choice is gone once made");
  // Picking the parent instead: a member of its team, as before.
  const again = await open({ form: "create", project: undefined });
  again.draw();
  await again.click("bot-project-parent");
  assert.equal(again.form.key, project);
  assert.equal(again.form.s.kind, "member");
});

test("a focused folder with its own bots.json, or in a git worktree, is keyed with no question", async (t) => {
  seed([MAIN]);
  const child = underParent();
  mkdirSync(join(child, ".herdr"));
  writeFileSync(join(child, ".herdr/bots.json"), `${JSON.stringify({ version: 1, categories: [], bots: [] })}\n`);
  state.spaces = [{ id: "s1", name: "child", folder: child }];
  state.focused = { space: "s1" };
  const own = await open({ form: "create", project: undefined });
  own.draw();
  assert.equal(own.form.key, child);
  assert.ok(!nodes.has("bot-project-parent"));
  // A worktree of a repository keys to its main checkout (Decision 15), unchanged.
  const repo = join(root, "repo");
  const wt = join(root, "repo-wt");
  const g = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repo });
  mkdirSync(repo);
  g("init", "-q");
  g("commit", "-q", "--allow-empty", "-m", "init");
  g("worktree", "add", "-q", "-b", "wt", wt);
  state.spaces = [{ id: "s2", name: "wt", folder: wt }];
  state.focused = { space: "s2" };
  const tree = await open({ form: "create", project: undefined });
  tree.draw();
  assert.equal(tree.form.key, repo);
  assert.ok(!nodes.has("bot-project-own"));
});
