// herdr-bots, the command line (A11): every subcommand run as a program against scratch git
// projects under $TMPDIR, with a fake `hc` first on PATH (test/fake-hc.mjs) that records
// each call and answers from a state file. The real hc is never run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkBots, parseBots } from "../mods/spaces-agents/model.js";
import { writeBotsFile, findBot, CliError } from "../mods/spaces-agents/bin/herdr-bots.mjs";

const CLI = new URL("../mods/spaces-agents/bin/herdr-bots.mjs", import.meta.url).pathname;
const FAKE_HC = new URL("./fake-hc.mjs", import.meta.url).pathname;
const ID = { main: "b-aaaaaaaaaa", cap: "b-bbbbbbbbbb", dev: "b-cccccccccc", plan: "b-eeeeeeeeee" };

const git = (cwd, ...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
const exe = (path, text) => { writeFileSync(path, text); chmodSync(path, 0o755); };

/** A scratch world: a git project, a fake hc, a fake home and app home. */
function scene(t, { terminals = [], briefing = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hb-cli-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, "proj");
  mkdirSync(project);
  git(project, "init", "-q");
  git(project, "commit", "-q", "--allow-empty", "-m", "start");
  const bin = join(root, "bin");
  mkdirSync(bin);
  exe(join(bin, "hc"), `#!/bin/sh\nexec "${process.execPath}" "${FAKE_HC}" "$@"\n`);
  exe(join(bin, "claude"), "#!/bin/sh\nexit 0\n");
  exe(join(bin, "codex"), "#!/bin/sh\nexit 0\n");
  const home = join(root, "home");
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(join(home, ".claude/settings.json"), JSON.stringify({ model: "sonnet" }));
  const app = join(root, "app");
  mkdirSync(join(app, "mods/spaces-agents"), { recursive: true });
  if (briefing) writeFileSync(join(app, "mods/spaces-agents/briefing.mjs"), "// stand-in\n");
  const statePath = join(root, "hc.json");
  const logPath = join(root, "hc.log");
  writeFileSync(statePath, JSON.stringify({ terminals, next: 100 }));
  writeFileSync(logPath, "");
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: home, HERDR_APP_HOME: app, HC_FAKE_STATE: statePath, HC_FAKE_LOG: logPath };
  delete env.HC_TERMINAL_ID;
  const cli = (args, { cwd = project, input } = {}) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env, input, encoding: "utf8" });
    return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
  };
  const calls = () => readFileSync(logPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const hcState = () => JSON.parse(readFileSync(statePath, "utf8"));
  const botsPath = join(project, ".herdr/bots.json");
  const bots = () => JSON.parse(readFileSync(botsPath, "utf8"));
  const seed = (file) => { mkdirSync(join(project, ".herdr"), { recursive: true }); writeFileSync(botsPath, `${JSON.stringify(file, null, 2)}\n`); };
  return { root, project, app, home, cli, calls, hcState, bots, botsPath, seed };
}

const bot = (id, kind, extra = {}) => ({ id, name: `Bot ${id.slice(2, 4)}`, kind, look: { character: "star", colour: "blue" }, role: "r", instructions: "i", agent: "claude", ...extra });
const team = (extra = {}) => ({
  version: 1,
  categories: [{ id: "eng", title: "Engineering" }],
  bots: [
    bot(ID.main, "main", { name: "Genie" }),
    bot(ID.cap, "member", { name: "Captain", category: "eng" }),
    bot(ID.dev, "member", { name: "Dev", lead: ID.cap }),
    bot(ID.plan, "member", { name: "Studio", agent: undefined, planned: { wave: 3, note: "later" } }),
  ],
  ...extra,
});
/** An `hc get` answer for a terminal. */
const term = (address, { bot: b, argv = ["claude"], cwd = "/x", app = "claude-code", state = "live", created = 1, parent = null, msg, status = "idle" } = {}) => ({
  address, name: address, cwd, state, parent, created_ms: created, labels: b ? { bot: b } : {},
  foreground: { argv, cwd }, status: { app, state: status, ...(msg ? { msg } : {}) },
});
const runCall = (calls) => calls.find((c) => c[0] === "run");
const labelCalls = (calls) => calls.filter((c) => c[0] === "label");

// ---- create ----

test("create: the first bot must be main; then the main bot is written with an id, a default look and the agent", (t) => {
  const s = scene(t);
  const refused = s.cli(["create", "--name", "Dev", "--agent", "claude", "--kind", "member"]);
  assert.equal(refused.code, 1);
  assert.match(refused.err, /first bot in a project must be its main bot/);
  assert.equal(existsSync(s.botsPath), false, "nothing written");
  const made = s.cli(["create", "--name", "Genie", "--agent", "claude", "--role", "runs the team"]);
  assert.equal(made.code, 0, made.err);
  const id = made.out.trim();
  assert.match(id, /^b-[a-z2-7]{10}$/);
  const file = s.bots();
  assert.deepEqual(checkBots(file), []);
  assert.equal(file.bots[0].id, id);
  assert.equal(file.bots[0].kind, "main");
  assert.equal(file.bots[0].role, "runs the team");
  assert.equal(file.bots[0].instructions, "");
  assert.ok(file.bots[0].look.character && file.bots[0].look.colour);
  // A second bot defaults to member; a second main is refused.
  assert.equal(s.cli(["create", "--name", "Two", "--agent", "codex"]).code, 0);
  assert.equal(s.bots().bots[1].kind, "member");
  const twoMains = s.cli(["create", "--name", "Three", "--agent", "claude", "--kind", "main"]);
  assert.equal(twoMains.code, 1);
  assert.match(twoMains.err, /already has a main bot, Genie/);
});

test("create from a worktree writes the main checkout's file (Decision 15); --project picks another folder", (t) => {
  const s = scene(t);
  const wt = join(s.root, "wt");
  git(s.project, "worktree", "add", "-q", wt);
  const r = s.cli(["create", "--name", "Genie", "--agent", "claude", "--json"], { cwd: wt });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.json().project, s.project);
  assert.ok(existsSync(s.botsPath));
  assert.equal(existsSync(join(wt, ".herdr/bots.json")), false);
  const other = join(s.root, "plain");
  mkdirSync(other);
  assert.equal(s.cli(["create", "--name", "Solo", "--agent", "claude", "--project", other]).code, 0);
  assert.ok(existsSync(join(other, ".herdr/bots.json")));
});

test("create refuses instructions over 4,000 characters, from the flag, a file or stdin", (t) => {
  const s = scene(t);
  const long = "x".repeat(4001);
  const r = s.cli(["create", "--name", "Genie", "--agent", "claude", "--instructions", long]);
  assert.equal(r.code, 1);
  assert.match(r.err, /4001 characters; the limit is 4000/);
  assert.equal(existsSync(s.botsPath), false);
  assert.equal(s.cli(["create", "--name", "Genie", "--agent", "claude", "--instructions-file", "-"], { input: long }).code, 1);
  const ok = s.cli(["create", "--name", "Genie", "--agent", "claude", "--instructions-file", "-"], { input: `${"y".repeat(4000)}\n` });
  assert.equal(ok.code, 0, ok.err);
  assert.equal(s.bots().bots[0].instructions.length, 4000);
});

test("create: lead, category, planned, look, model pin from the agent's list only", (t) => {
  const s = scene(t);
  s.seed(team());
  const bad = s.cli(["create", "--name", "Tess", "--agent", "claude", "--model", "gpt-free-text"]);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /isn't a known claude model. Pick one of: .*claude-opus-5-5/);
  const unknownAgent = s.cli(["create", "--name", "Tess", "--agent", "nope"]);
  assert.match(unknownAgent.err, /isn't a coding agent Herdr knows/);
  const catUnderCaptain = s.cli(["create", "--name", "Tess", "--agent", "claude", "--lead", "Captain", "--category", "eng"]);
  assert.match(catUnderCaptain.err, /category goes only on a member that reports to the main bot/);
  const leadPlanned = s.cli(["create", "--name", "Tess", "--agent", "claude", "--lead", "Studio"]);
  assert.match(leadPlanned.err, /Studio is planned/);
  const dupName = s.cli(["create", "--name", "dev", "--agent", "claude"]);
  assert.match(dupName.err, /already named "Dev"/);

  const r = s.cli(["create", "--name", "Tess", "--agent", "claude", "--lead", "Captain", "--model", "claude-opus-5-5", "--character", "gem", "--colour", "rose", "--json"]);
  assert.equal(r.code, 0, r.err);
  const made = s.bots().bots.find((b) => b.id === r.json().id);
  assert.equal(made.lead, ID.cap);
  assert.equal(made.model, "claude-opus-5-5");
  assert.deepEqual(made.look, { character: "gem", colour: "rose" });
  const omni = s.cli(["create", "--name", "Octo", "--agent", "codex", "--category", "Engineering", "--omni", "--json"]);
  const o = s.bots().bots.find((b) => b.id === omni.json().id);
  assert.deepEqual(o.look, { character: "octopus", colour: "deepseek" });
  assert.equal(o.category, "eng");
  assert.equal(o.lead, undefined);
  const planned = s.cli(["create", "--name", "Later", "--planned-wave", "2", "--planned-note", "after auth", "--json"]);
  assert.equal(planned.code, 0, planned.err);
  const p = s.bots().bots.find((b) => b.id === planned.json().id);
  assert.deepEqual(p.planned, { wave: 2, note: "after auth" });
  assert.equal(p.agent, undefined);
  assert.equal(s.cli(["create", "--name", "Nobody"]).code, 2, "no agent and not planned");
  assert.deepEqual(checkBots(s.bots()), []);
});

// ---- edit, rm, category ----

test("edit: partial changes keep the rest; --unplanned, --no-model; a lead cycle is refused", (t) => {
  const s = scene(t);
  const f = team();
  f.bots[1].model = "opus";
  f.bots[1].extra = "kept";
  s.seed(f);
  assert.equal(s.cli(["edit", "Captain", "--role", "leads eng", "--no-model"]).code, 0);
  let cap = s.bots().bots.find((b) => b.id === ID.cap);
  assert.equal(cap.role, "leads eng");
  assert.equal(cap.model, undefined);
  assert.equal(cap.extra, "kept");
  assert.equal(cap.category, "eng");
  assert.equal(cap.instructions, "i");
  const cycle = s.cli(["edit", "Captain", "--lead", "Dev"]);
  assert.equal(cycle.code, 1);
  assert.match(cycle.err, /Dev reports to Captain, so it can't be its lead/);
  const unplan = s.cli(["edit", ID.plan, "--unplanned"]);
  assert.match(unplan.err, /needs a coding agent/);
  assert.equal(s.cli(["edit", ID.plan, "--unplanned", "--agent", "codex"]).code, 0);
  assert.equal(s.bots().bots.find((b) => b.id === ID.plan).planned, undefined);
  assert.equal(s.cli(["edit", "Dev", "--lead", "Genie"]).code, 0);
  assert.equal(s.bots().bots.find((b) => b.id === ID.dev).lead, undefined, "the main bot as lead is stored as no lead");
  const json = s.cli(["edit", "Dev", "--name", "Developer", "--json"]).json();
  assert.equal(json.id, ID.dev);
  assert.equal(json.bot.name, "Developer");
  cap = s.bots().bots.find((b) => b.id === ID.cap);
  assert.equal(cap.name, "Captain");
});

test("rm: a main bot with members and a lead with members are refused; a member goes; the last bot deletes the file", (t) => {
  const s = scene(t);
  s.seed(team());
  const main = s.cli(["rm", "Genie"]);
  assert.equal(main.code, 1);
  assert.match(main.err, /main bot and its project still has 3 other bots/);
  const lead = s.cli(["rm", "Captain"]);
  assert.equal(lead.code, 1);
  assert.match(lead.err, /Captain leads Dev/);
  assert.equal(s.bots().bots.length, 4, "nothing written");
  for (const b of ["Dev", "Captain", "Studio"]) assert.equal(s.cli(["rm", b]).code, 0);
  const last = s.cli(["rm", "Genie", "--json"]);
  assert.equal(last.code, 0, last.err);
  assert.equal(last.json().deletedFile, true);
  assert.equal(existsSync(s.botsPath), false);
});

test("category add, edit, order, rm (refused while used); ls --json lists them", (t) => {
  const s = scene(t);
  s.seed(team());
  assert.equal(s.cli(["category", "add", "--title", "Quality", "--sub", "tests"]).out.trim(), "quality");
  assert.equal(s.cli(["category", "add", "--title", "Shared"]).out.trim(), "shared");
  assert.equal(s.cli(["category", "edit", "quality", "--sub", ""]).code, 0);
  assert.equal(s.bots().categories.find((c) => c.id === "quality").sub, undefined);
  assert.equal(s.cli(["category", "order", "shared", "quality"]).code, 0);
  assert.deepEqual(s.bots().categories.map((c) => c.id), ["shared", "quality", "eng"]);
  const used = s.cli(["category", "rm", "eng"]);
  assert.equal(used.code, 1);
  assert.match(used.err, /Captain is in eng/);
  assert.equal(s.cli(["category", "rm", "Shared"]).code, 0);
  const ls = s.cli(["category", "ls", "--json"]).json();
  assert.deepEqual(ls.categories.map((c) => [c.id, c.bots]), [["quality", []], ["eng", [ID.cap]]]);
});

// ---- the stale-snapshot rule ----

test("writeBotsFile refuses a stale snapshot and a file that appeared, writing nothing", (t) => {
  const s = scene(t);
  s.seed(team());
  const read = readFileSync(s.botsPath, "utf8");
  const raw = parseBots(read).raw;
  raw.bots[0].role = "changed";
  // Someone else's edit lands between the read and the write.
  const theirs = read.replace('"role": "r"', '"role": "theirs"');
  writeFileSync(s.botsPath, theirs);
  assert.throws(() => writeBotsFile(s.project, raw, read), (e) => e instanceof CliError && /changed since it was read/.test(e.message));
  assert.equal(readFileSync(s.botsPath, "utf8"), theirs);
  // A new file written by someone else after we saw none.
  const fresh = join(s.root, "fresh");
  mkdirSync(join(fresh, ".herdr"), { recursive: true });
  writeFileSync(join(fresh, ".herdr/bots.json"), "{}");
  assert.throws(() => writeBotsFile(fresh, team(), null), /changed since it was read/);
  // A write that would break the schema is refused before any read.
  assert.throws(() => writeBotsFile(s.project, { version: 1, categories: [], bots: [] }, theirs), /0 main bots/);
  // Through the injected file access: the re-read differs, so neither write runs.
  const io = { read: () => "y", mkdir() { throw new Error("no"); }, create() { throw new Error("no"); }, replace() { throw new Error("no"); } };
  assert.throws(() => writeBotsFile(s.project, team(), "x", io), /changed since/);
});

// ---- ls, show, model ----

test("ls --json: kind, lead, category, planned, agent, model detected → pinned → default, terminal, status", (t) => {
  const f = team();
  f.bots[2].model = "claude-opus-5-5";
  const s = scene(t, { terminals: [term("t5", { bot: ID.cap, argv: ["claude", "--dangerously-skip-permissions", "--model", "claude-opus-5-5"], status: "working" })] });
  s.seed(f);
  const r = s.cli(["ls", "--json"]);
  assert.equal(r.code, 0, r.err);
  const [p] = r.json().projects;
  assert.equal(p.project, s.project);
  assert.deepEqual(p.categories, [{ id: "eng", title: "Engineering" }]);
  const by = Object.fromEntries(p.bots.map((b) => [b.name, b]));
  assert.deepEqual(Object.keys(by), ["Genie", "Captain", "Dev", "Studio"]);
  assert.equal(by.Genie.kind, "main");
  assert.equal(by.Genie.lead, null);
  assert.deepEqual([by.Genie.model, by.Genie.modelSource, by.Genie.status, by.Genie.terminal], ["sonnet", "default", "not running", null]);
  assert.deepEqual([by.Captain.lead, by.Captain.category, by.Captain.model, by.Captain.modelSource, by.Captain.terminal, by.Captain.status],
    [ID.main, "eng", "claude-opus-5-5", "detected", "t5", "working"]);
  assert.deepEqual([by.Dev.lead, by.Dev.leadName, by.Dev.model, by.Dev.modelSource], [ID.cap, "Captain", "claude-opus-5-5", "pinned"]);
  assert.deepEqual(by.Studio.planned, { wave: 3, note: "later" });
  assert.equal(by.Studio.status, "planned");
  for (const key of ["id", "name", "kind", "lead", "category", "planned", "agent", "model", "modelSource", "terminal", "status", "duplicate"]) assert.ok(key in by.Dev, key);
  const text = s.cli(["ls"]);
  assert.match(text.out, /Captain .* claude-opus-5-5 \(detected\) {2}working in t5/);
  const show = s.cli(["show", "dev", "--json"]).json();
  assert.equal(show.id, ID.dev);
  assert.equal(show.instructions, "i");
  assert.match(s.cli(["show", "Captain"]).out, /model {8}claude-opus-5-5 \(detected\)/);
  assert.match(s.cli(["show", "nobody"]).err, /No bot "nobody"/);
});

test("ls: a shell in front is not live; two live panes: the newest counts, flagged duplicate; --all adds remembered projects", (t) => {
  const s = scene(t, { terminals: [
    term("t1", { bot: ID.main, argv: ["zsh"] }),
    term("t2", { bot: ID.cap, created: 5 }), term("t3", { bot: ID.cap, created: 9, argv: ["claude", "--model", "opus"] }),
  ] });
  s.seed(team());
  const other = join(s.root, "other");
  mkdirSync(join(other, ".herdr"), { recursive: true });
  writeFileSync(join(other, ".herdr/bots.json"), JSON.stringify({ version: 1, categories: [], bots: [bot("b-dddddddddd", "main", { name: "Solo" })] }));
  writeFileSync(join(s.app, "shared.json"), JSON.stringify({ "spaces-agents.projects": [{ key: other, machine: null }, { key: join(s.root, "gone"), machine: null }, { key: "/r", machine: "vps" }] }));
  const by = Object.fromEntries(s.cli(["ls", "--json"]).json().projects[0].bots.map((b) => [b.name, b]));
  assert.equal(by.Genie.status, "not running");
  assert.deepEqual([by.Captain.terminal, by.Captain.duplicate, by.Captain.model], ["t3", true, "opus"]);
  const all = s.cli(["ls", "--all", "--json"]).json().projects;
  assert.deepEqual(all.map((p) => p.project), [s.project, other]);
});

// ---- start ----

test("start a main bot: hc run --bg with the label, name, cwd, --no-parent, the pinned model; never --no-notify; the hook written and excluded", (t) => {
  const f = team();
  f.bots[0].model = "claude-opus-5-5";
  const s = scene(t);
  s.seed(f);
  const r = s.cli(["start", "Genie", "--json"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.json().terminal, "t100");
  const run = runCall(s.calls());
  assert.deepEqual(run, ["run", "--bg", "--json", "--name", "genie", "--cwd", s.project, "--label", `bot=${ID.main}`, "--no-parent",
    "--", "claude", "--model", "claude-opus-5-5"]);
  assert.equal(run.includes("--no-notify"), false);
  assert.equal(run.some((a) => a.startsWith("herdr.space=") || a.startsWith("herdr.tab=")), false, "no placement labels unless asked");
  const settings = JSON.parse(readFileSync(join(s.project, ".claude/settings.local.json"), "utf8"));
  assert.match(settings.hooks.UserPromptSubmit[0].hooks[0].command, new RegExp(`${s.app}/mods/spaces-agents/briefing.mjs`));
  assert.match(readFileSync(join(s.project, ".git/info/exclude"), "utf8"), /\*\*\/\.claude\/settings\.local\.json/);
  assert.equal(git(s.project, "status", "--porcelain", "--", ".claude"), "");
  // Started: the next start reports the running pane and runs nothing.
  const again = s.cli(["start", "Genie"]);
  assert.equal(again.code, 0);
  assert.match(again.out, /already running in t100/);
  assert.equal(s.calls().filter((c) => c[0] === "run").length, 1);
});

test("start a member: parent is its lead's live terminal, outliving it; else --no-parent; --space/--tab add placement labels", (t) => {
  const s = scene(t, { terminals: [term("t7", { bot: ID.cap, cwd: "/p" }), term("t8", { bot: ID.main, argv: ["bash"] })] });
  s.seed(team());
  assert.equal(s.cli(["start", "Dev", "--space", "sp1", "--tab", "tb2"]).code, 0);
  const run = runCall(s.calls());
  assert.deepEqual(run.slice(run.indexOf("--parent"), run.indexOf("--")), ["--parent", "t7", "--outlive-parent"]);
  assert.ok(run.includes("herdr.space=sp1") && run.includes("herdr.tab=tb2"));
  // Captain is live in t7: reported, not started twice. Studio-less Genie's pane has only a
  // shell in front, so it isn't live: Genie starts, with no parent.
  assert.match(s.cli(["start", "Captain"]).out, /already running in t7/);
  assert.equal(s.cli(["start", "Genie"]).code, 0);
  const runs = s.calls().filter((c) => c[0] === "run");
  assert.equal(runs.length, 2);
  assert.ok(runs[1].includes("--no-parent"));
});

test("start: the main bot not live gives --no-parent; planned and agentless bots are refused; a missing briefing script only warns", (t) => {
  const s = scene(t, { briefing: false });
  s.seed(team());
  const r = s.cli(["start", "Captain"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /gets no per-turn briefing: .*briefing\.mjs isn't there/);
  assert.equal(existsSync(join(s.project, ".claude/settings.local.json")), false);
  const run = runCall(s.calls());
  assert.ok(run.includes("--no-parent"));
  assert.equal(run.includes("--parent"), false);
  const planned = s.cli(["start", "Studio"]);
  assert.equal(planned.code, 1);
  assert.match(planned.err, /Studio is planned \(wave 3\)/);
  assert.equal(s.calls().filter((c) => c[0] === "run").length, 1);
});

// ---- attach, detach ----

test("attach refuses a Claude pane whose session runs outside the project, naming both folders; nothing written", (t) => {
  const s = scene(t, { terminals: [term("t9", { cwd: "/elsewhere" })] });
  s.seed(team());
  const outside = realpathSync(mkdtempSync(join(tmpdir(), "hb-out-")));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const st = s.hcState();
  st.terminals[0].foreground.cwd = outside;
  writeFileSync(join(s.root, "hc.json"), JSON.stringify(st));
  const r = s.cli(["attach", "Genie", "t9"]);
  assert.equal(r.code, 1);
  assert.match(r.err, new RegExp(`runs in ${outside}.*not to Genie's project ${s.project}`));
  assert.deepEqual(labelCalls(s.calls()), []);
  assert.equal(existsSync(join(outside, ".claude")), false);
  assert.deepEqual(s.hcState().terminals[0].labels, {});
});

test("attach refuses another bot's pane and a pane that isn't live; a planned bot is refused", (t) => {
  const s = scene(t, { terminals: [term("t4", { bot: ID.cap }), term("t5", { state: "finished" })] });
  s.seed(team());
  assert.match(s.cli(["attach", "Genie", "t4"]).err, /t4 already plays Captain \(b-bbbbbbbbbb\)/);
  assert.match(s.cli(["attach", "Genie", "t5"]).err, /t5 isn't a live terminal/);
  assert.match(s.cli(["attach", "Studio", "t4"]).err, /Studio is planned/);
  assert.match(s.cli(["attach", "Genie", "vps/t4"]).err, /this computer's panes only/);
  assert.deepEqual(labelCalls(s.calls()), []);
});

test("attach moves the label: off the old pane first, then onto the new one; the hook goes in the session folder", (t) => {
  const s = scene(t);
  const sub = join(s.project, "pkg");
  mkdirSync(sub);
  const st = { terminals: [term("t1", { bot: ID.main, cwd: s.project }), term("t2", { cwd: sub })], next: 100 };
  st.terminals[1].foreground.cwd = sub;
  writeFileSync(join(s.root, "hc.json"), JSON.stringify(st));
  s.seed(team());
  const r = s.cli(["attach", "Genie", "t2", "--json"]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.json().movedFrom, ["t1"]);
  assert.deepEqual(labelCalls(s.calls()), [["label", "t1", "bot="], ["label", "t2", `bot=${ID.main}`]]);
  const labels = Object.fromEntries(s.hcState().terminals.map((x) => [x.address, x.labels]));
  assert.deepEqual(labels, { t1: {}, t2: { bot: ID.main } });
  assert.ok(existsSync(join(sub, ".claude/settings.local.json")));
  assert.match(r.err, /open \/hooks once/);
});

test("attach: when the last label write fails after the old one came off, it says the bot has no pane now", (t) => {
  const s = scene(t);
  writeFileSync(join(s.root, "hc.json"), JSON.stringify({ terminals: [term("t1", { bot: ID.dev, app: "codex", argv: ["codex"] }), term("t2", { app: "codex", argv: ["codex"] })], failLabel: "t2" }));
  s.seed(team());
  const r = s.cli(["attach", "Dev", "t2"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /Dev has no pane now \(its label came off t1\); attach again/);
});

test("detach takes the label off every local pane carrying it", (t) => {
  const s = scene(t, { terminals: [term("t1", { bot: ID.cap }), term("t2", { bot: ID.cap, argv: ["zsh"] })] });
  s.seed(team());
  const r = s.cli(["detach", "Captain", "--json"]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.json(), { id: ID.cap, detached: ["t1", "t2"] });
  assert.deepEqual(s.hcState().terminals.map((x) => x.labels), [{}, {}]);
  assert.match(s.cli(["detach", "Captain"]).out, /no pane on this computer/);
});

// ---- brief, errors ----

test("brief prints the bot's briefing: a lead sees its members' status and reports; planned bots get none", (t) => {
  const s = scene(t, { terminals: [term("t3", { bot: ID.dev, status: "blocked", msg: "waiting on the schema" }), term("t2", { bot: ID.cap })] });
  s.seed(team());
  const r = s.cli(["brief", "Captain"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Captain/);
  assert.match(r.out, /Dev/);
  assert.match(r.out, /waiting on the schema/);
  const dev = s.cli(["brief", "Dev", "--json"]).json();
  assert.match(dev.briefing, /t2/, "a member is told its lead's terminal");
  assert.equal(s.cli(["brief", "Studio", "--json"]).json().briefing, null);
});

test("errors: stderr and a non-zero exit; unknown commands and options are usage errors; names must be unique", (t) => {
  const s = scene(t);
  s.seed(team());
  const unknown = s.cli(["frob"]);
  assert.equal(unknown.code, 2);
  assert.match(unknown.err, /unknown command "frob"/);
  assert.equal(s.cli(["ls", "--bogus"]).code, 2);
  assert.equal(s.cli(["show"]).code, 2);
  assert.equal(s.cli(["--help"]).code, 0);
  const f = team();
  assert.throws(() => findBot({ ...f, bots: [...f.bots, bot("b-ffffffffff", "member", { name: "Dev" })] }, "Dev"), /2 bots are named "Dev"/);
  assert.equal(findBot(f, "genie").id, ID.main);
  const broken = s.botsPath;
  writeFileSync(broken, "{nope");
  const r = s.cli(["ls"]);
  assert.match(r.out, /not valid JSON|Unexpected token|Expected property name/);
});
