// `automagik-herdr worker` (bot workers): a bot starts one worker per task, an hc child of its
// pane, in the task's worktree. Run as a program against scratch git projects under $TMPDIR,
// with the fake `hc` first on PATH (test/fake-hc.mjs). The real hc is never run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyBotEdit, checkBots, parseBots } from "../mods/am-sidebar/model.js";
import { effortArgs, promptArgs } from "../mods/am-sidebar/models.js";
import { baseCandidates, branchSlug, parseWorktrees, readLedger, sessionChange, startRow, templateAgent, workerArgs, workerPlan,
  workerRole, writesWorktree } from "../mods/am-sidebar/workers.js";

const CLI = new URL("../mods/am-sidebar/bin/automagik-herdr.mjs", import.meta.url).pathname;
const FAKE_HC = new URL("./fake-hc.mjs", import.meta.url).pathname;
const FAKE_APP = new URL("./fake-herdr-app.mjs", import.meta.url).pathname;
const ID = { main: "b-aaaaaaaaaa", cap: "b-bbbbbbbbbb", dev: "b-cccccccccc", stray: "b-zzzzzzzzzz" };

const git = (cwd, ...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
const exe = (path, text) => { writeFileSync(path, text); chmodSync(path, 0o755); };
const bot = (id, kind, extra = {}) => ({ id, name: `Bot ${id.slice(2, 4)}`, kind, look: { character: "star", colour: "blue" }, role: "r", instructions: "i", agent: "claude", ...extra });
const team = (extra = {}) => ({
  version: 1,
  categories: [],
  bots: [
    bot(ID.main, "main", { name: "Genie" }),
    bot(ID.cap, "member", { name: "Captain", agent: "codex", worker: { model: "gpt-5.5", effort: "high" } }),
    bot(ID.dev, "member", { name: "Dev", worker: { agent: "codex", model: "gpt-5.5", effort: "medium" } }),
  ],
  ...extra,
});
const term = (address, { bot: b, cwd }) => ({ address, name: address, cwd, state: "live", parent: null, created_ms: 1,
  labels: b ? { bot: b } : {}, foreground: { argv: ["claude"], cwd, pid: 4000 }, status: { app: "claude-code", state: "idle" } });

/** A scratch world: a git project on main with its bots, a fake hc whose t1..t3 are panes in it. */
function scene(t, { file = team(), branch = "main", briefing = true, templates = TEMPLATES } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hb-worker-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, "proj");
  mkdirSync(project);
  git(project, "init", "-q", "-b", branch);
  git(project, "commit", "-q", "--allow-empty", "-m", "start");
  mkdirSync(join(project, ".herdr"));
  writeFileSync(join(project, ".herdr/bots.json"), `${JSON.stringify(file, null, 2)}\n`);
  const bin = join(root, "bin");
  mkdirSync(bin);
  exe(join(bin, "hc"), `#!/bin/sh\nexec "${process.execPath}" "${FAKE_HC}" "$@"\n`);
  for (const a of ["claude", "codex", "agy"]) exe(join(bin, a), "#!/bin/sh\nexit 0\n");
  const home = join(root, "home");
  mkdirSync(join(home, ".claude"), { recursive: true });
  const app = join(root, "app");
  mkdirSync(join(app, "mods/am-sidebar"), { recursive: true });
  if (briefing) writeFileSync(join(app, "mods/am-sidebar/briefing.mjs"), "// stand-in\n");
  const statePath = join(root, "hc.json");
  const logPath = join(root, "hc.log");
  const terminals = [term("t1", { bot: ID.dev, cwd: project }), term("t2", { cwd: project }), term("t3", { bot: ID.stray, cwd: project }),
    term("t4", { bot: ID.cap, cwd: project })];
  writeFileSync(statePath, JSON.stringify({ terminals, next: 100, templates }));
  writeFileSync(logPath, "");
  // No Herdr window: a fake herdr-app first on PATH (start asks it), so the real one is never reached.
  exe(join(bin, "herdr-app"), `#!/bin/sh\nexec "${process.execPath}" "${FAKE_APP}" "$@"\n`);
  const appState = join(root, "herdr-app.json"), appLog = join(root, "herdr-app.log");
  writeFileSync(appState, JSON.stringify({ down: true }));
  writeFileSync(appLog, "");
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: home, HERDR_APP_HOME: app, HC_FAKE_STATE: statePath, HC_FAKE_LOG: logPath,
    HERDR_APP_FAKE_STATE: appState, HERDR_APP_FAKE_LOG: appLog };
  delete env.HC_TERMINAL_ID;
  const cli = (args, { from = "t1", cwd = project } = {}) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env: from ? { ...env, HC_TERMINAL_ID: from } : env, encoding: "utf8" });
    return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
  };
  const cliAsync = (args, { from = "t1" } = {}) => new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { cwd: project, env: { ...env, HC_TERMINAL_ID: from }, encoding: "utf8" },
      (e, out, err) => resolve({ code: e ? e.code : 0, out, err }));
  });
  const calls = () => readFileSync(logPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const runs = () => calls().filter((c) => c[0] === "run");
  const hcState = () => JSON.parse(readFileSync(statePath, "utf8"));
  const ledger = () => { const p = join(app, "automagik-herdr/workers.jsonl"); return existsSync(p) ? readLedger(readFileSync(p, "utf8")) : []; };
  const bots = () => JSON.parse(readFileSync(join(project, ".herdr/bots.json"), "utf8"));
  const finish = (address) => {
    const st = hcState();
    st.terminals.find((x) => x.address === address).state = "finished";
    writeFileSync(statePath, JSON.stringify(st));
  };
  return { root, project, app, path: env.PATH, cli, cliAsync, calls, runs, hcState, ledger, bots, finish };
}
/** hc's templates in the scenes: one Codex seat with its own provider, one hc can't place. */
const TEMPLATES = [
  { name: "dev-sol", command: 'env PATH="$HOME/.bun/bin:$PATH" codex -c model_provider=juice -m gpt-6.1-sol -c model_reasoning_effort=high' },
  { name: "opus-rev", command: "claude --dangerously-skip-permissions --model claude-opus-5-5" },
  { name: "mystery", command: "./run-something.sh" },
];
/** What `hc run` runs after `--`, as raw words. */
const runArgv = (args) => args.slice(args.indexOf("--") + 1);
/** A template run: no `--`; the template and the task follow the last option (`--parent P`). */
const templateArgv = (args) => {
  assert.equal(args.includes("--"), false, `hc's template form has no --: ${JSON.stringify(args)}`);
  return args.slice(args.indexOf("--parent") + 2);
};
/** The agent's argv: after `--`, past the `env PATH=…` every agent worker starts with. */
const after = (args) => {
  const argv = runArgv(args);
  assert.equal(argv[0], "/usr/bin/env", `an agent worker runs under /usr/bin/env PATH=…: ${JSON.stringify(argv)}`);
  assert.match(argv[1], /^PATH=/);
  return argv.slice(2);
};
const labelsOf = (args) => args.flatMap((a, i) => (args[i - 1] === "--label" ? [a] : []));

// ---- the worker's program: defaults, overrides, fallback ----

test("worker: the bot's worker defaults are used, and per-task --agent/--model/--effort win", (t) => {
  const s = scene(t);
  const r = s.cli(["worker", "fix the login form", "--branch", "feat/login", "--json"]);
  assert.equal(r.code, 0, r.err);
  const out = r.json();
  assert.deepEqual([out.agent, out.model, out.effort], ["codex", "gpt-5.5", "medium"]);
  assert.deepEqual(after(s.runs()[0]), ["codex", "--model", "gpt-5.5", "-c", "model_reasoning_effort=medium", "fix the login form"]);
  const o = s.cli(["worker", "review it", "--branch", "feat/review", "--agent", "claude", "--model", "opus", "--effort", "max", "--json"]);
  assert.equal(o.code, 0, o.err);
  assert.deepEqual([o.json().agent, o.json().model, o.json().effort], ["claude", "opus", "max"]);
  assert.deepEqual(after(s.runs()[1]), ["claude", "--model", "opus", "--effort", "max", "review it"]);
});

test("worker: a bot with no worker field runs its own agent, with that agent's default model and effort", (t) => {
  const file = team();
  delete file.bots[2].worker;
  const s = scene(t, { file });
  const r = s.cli(["worker", "write the parser", "--branch", "feat/parser", "--json"]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual([r.json().agent, r.json().model, r.json().effort], ["claude", null, null]);
  const run = s.runs()[0];
  assert.deepEqual(after(run), ["claude", "write the parser"]);
  assert.equal(labelsOf(run).some((l) => l.startsWith("worker.model=") || l.startsWith("worker.effort=")), false);
});

test("worker: a codex captain starts a Claude reviewer with --agent claude-code; its codex model stays behind", (t) => {
  const s = scene(t);
  const r = s.cli(["worker", "review PR 12", "--branch", "review/pr-12", "--agent", "claude-code", "--json"], { from: "t4" });
  assert.equal(r.code, 0, r.err);
  const out = r.json();
  assert.deepEqual([out.agent, out.model, out.effort], ["claude", null, "high"]);
  assert.deepEqual(after(s.runs()[0]), ["claude", "--effort", "high", "review PR 12"]);
  assert.match(r.err, /worker model gpt-5\.5 is for codex; claude runs its own default/);
  assert.ok(labelsOf(s.runs()[0]).includes(`worker.of=${ID.cap}`));
});

// ---- the worktree ----

test("worker --branch creates the task worktree from the base; a second call reuses it; main's HEAD stays", (t) => {
  const s = scene(t);
  git(s.project, "branch", "dev");
  const first = s.cli(["worker", "one", "--branch", "feat/login", "--json"]);
  assert.equal(first.code, 0, first.err);
  const wt = join(s.project, ".claude/worktrees/feat-login");
  assert.equal(first.json().worktree, wt);
  assert.equal(first.json().created, true);
  assert.equal(first.json().base, "dev", "dev before main when there is no origin");
  assert.equal(git(wt, "symbolic-ref", "--short", "HEAD").trim(), "feat/login");
  assert.equal(git(s.project, "symbolic-ref", "--short", "HEAD").trim(), "main");
  // Another bot's reviewer on the same task shares the writer's worktree.
  const second = s.cli(["worker", "two", "--branch", "feat/login", "--role", "review", "--json"], { from: "t4" });
  assert.equal(second.code, 0, second.err);
  assert.equal(second.json().worktree, wt);
  assert.equal(second.json().created, false);
  assert.equal(parseWorktrees(git(s.project, "worktree", "list", "--porcelain")).filter((w) => w.branch === "feat/login").length, 1);
  // --base picks the start; the branch checked out in the main checkout is refused.
  const based = s.cli(["worker", "three", "--branch", "feat/b", "--base", "main", "--json"]);
  assert.equal(based.json().base, "main");
  const onMain = s.cli(["worker", "four", "--branch", "main"]);
  assert.equal(onMain.code, 1);
  assert.match(onMain.err, /checked out in the main checkout/);
});

test("worker --branch with an origin: fetched, and the new branch starts from origin/HEAD's branch", (t) => {
  const s = scene(t);
  git(s.project, "branch", "dev");
  const origin = join(s.root, "origin.git");
  git(s.root, "clone", "-q", "--bare", s.project, origin);
  git(s.project, "remote", "add", "origin", origin);
  git(s.project, "fetch", "-q", "origin");
  git(s.project, "remote", "set-head", "origin", "dev");
  // A commit only origin has: the fetch must bring it before the branch is cut.
  const other = join(s.root, "other-clone");
  git(s.root, "clone", "-q", "-b", "dev", origin, other);
  git(other, "commit", "-q", "--allow-empty", "-m", "upstream work");
  git(other, "push", "-q", "origin", "dev");
  const upstream = git(other, "rev-parse", "HEAD").trim();
  const r = s.cli(["worker", "x", "--branch", "feat/up", "--json"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.json().base, "origin/dev");
  assert.equal(git(r.json().worktree, "rev-parse", "HEAD").trim(), upstream);
  // A branch origin has already is continued, not started over from the base.
  git(other, "checkout", "-q", "-b", "feat/remote");
  git(other, "commit", "-q", "--allow-empty", "-m", "remote branch work");
  git(other, "push", "-q", "origin", "feat/remote");
  const remote = s.cli(["worker", "y", "--branch", "feat/remote", "--json"]);
  assert.equal(remote.json().base, "origin/feat/remote");
  assert.equal(git(remote.json().worktree, "log", "-1", "--format=%s").trim(), "remote branch work");
});

test("worker --branch --base origin/dev: the new branch has no upstream, so pull and push never hit dev", (t) => {
  const s = scene(t);
  git(s.project, "branch", "dev");
  const origin = join(s.root, "origin.git");
  git(s.root, "clone", "-q", "--bare", s.project, origin);
  git(s.project, "remote", "add", "origin", origin);
  git(s.project, "fetch", "-q", "origin");
  // The default (true) already tracks a remote-tracking start; "always" makes the test hold
  // whatever the machine's global git config says.
  git(s.project, "config", "branch.autoSetupMerge", "always");
  const r = s.cli(["worker", "x", "--branch", "docs/drafts", "--base", "origin/dev", "--json"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.json().base, "origin/dev");
  const up = spawnSync("git", ["rev-parse", "--abbrev-ref", "docs/drafts@{upstream}"], { cwd: r.json().worktree, encoding: "utf8" });
  assert.notEqual(up.status, 0, `docs/drafts has an upstream: ${up.stdout.trim()}`);
  const conf = spawnSync("git", ["config", "--get-regexp", "^branch\\.docs/drafts\\."], { cwd: s.project, encoding: "utf8" });
  assert.equal(conf.stdout, "", "no branch.docs/drafts.remote or .merge");
  // Continuing origin's own branch of that name keeps it as the upstream.
  git(origin, "branch", "feat/remote", "dev");
  git(s.project, "fetch", "-q", "origin");
  const remote = s.cli(["worker", "y", "--branch", "feat/remote", "--json"]);
  assert.equal(remote.code, 0, remote.err);
  assert.equal(git(remote.json().worktree, "rev-parse", "--abbrev-ref", "feat/remote@{upstream}").trim(), "origin/feat/remote");
});

test("worker --worktree uses an existing worktree of the project, on its branch; the main checkout is refused", (t) => {
  const s = scene(t);
  const wt = join(s.root, "side");
  git(s.project, "worktree", "add", "-q", "-b", "fix/side", wt);
  const r = s.cli(["worker", "fix it", "--worktree", wt, "--json"]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual([r.json().worktree, r.json().branch, r.json().created], [wt, "fix/side", false]);
  const main = s.cli(["worker", "fix it", "--worktree", s.project]);
  assert.equal(main.code, 1);
  assert.match(main.err, /main checkout/);
});

// ---- the spawn: parent, labels, cwd, ledger ----

test("worker: hc run --bg as a child of the bot's pane, in the worktree, with the usage labels and no bot label", (t) => {
  const s = scene(t);
  const r = s.cli(["worker", "fix the login form", "--branch", "feat/login"]);
  assert.equal(r.code, 0, r.err);
  const run = s.runs()[0];
  const wt = join(s.project, ".claude/worktrees/feat-login");
  assert.deepEqual(run.slice(0, 3), ["run", "--bg", "--json"]);
  assert.equal(run[run.indexOf("--parent") + 1], "t1");
  assert.equal(run[run.indexOf("--cwd") + 1], wt);
  assert.equal(run[run.indexOf("--name") + 1], "feat-login");
  assert.deepEqual(labelsOf(run), [`worker.of=${ID.dev}`, "task=feat/login", "worker.role=dev", "worker.model=gpt-5.5",
    "worker.effort=medium"]);
  // The agent gets the calling pane's PATH (herdr-core's lacks ~/.bun/bin, where omp lives),
  // as argv words, never a shell string.
  assert.deepEqual(runArgv(run).slice(0, 3), ["/usr/bin/env", `PATH=${s.path}`, "codex"]);
  const made = s.hcState().terminals.find((x) => x.address === "t100");
  assert.equal(made.parent, "t1");
  assert.equal(made.cwd, wt);
  assert.equal(made.labels.bot, undefined);
  // Output: the terminal first, then worktree, branch, agent, model, effort.
  const lines = r.out.trim().split("\n");
  assert.equal(lines[0], "t100");
  assert.match(r.out, new RegExp(`worktree  ${wt}`));
  assert.match(r.out, /branch    feat\/login \(new, from main\)/);
  assert.match(r.out, /model     gpt-5\.5\n  effort    medium/);
  // The ledger row usagemeter joins on, with the worker's foreground pid.
  const [row] = s.ledger();
  assert.deepEqual({ ...row, at: undefined }, { event: "start", kind: "worker", terminal: "t100", pid: 5100, botId: ID.dev,
    task: "feat/login", worktree: wt, agent: "codex", model: "gpt-5.5", effort: "medium", template: null, role: "dev", at: undefined });
  assert.ok(!Number.isNaN(Date.parse(row.at)));
});

test("start and attach append a seat row to the ledger", (t) => {
  const s = scene(t);
  assert.equal(s.cli(["start", "Genie"], { from: null }).code, 0);
  const seat = s.ledger().find((r) => r.kind === "seat");
  assert.deepEqual([seat.terminal, seat.botId, seat.task, seat.worktree, seat.agent, seat.pid], ["t100", ID.main, null, s.project, "claude", 5100]);
  assert.equal(s.cli(["attach", "Captain", "t2"], { from: null }).code, 0);
  const attached = s.ledger().filter((r) => r.kind === "seat")[1];
  assert.deepEqual([attached.terminal, attached.botId, attached.agent, attached.pid], ["t2", ID.cap, "claude", 4000]);
  assert.equal(seat.template, null, "a seat runs no template");
});

// ---- hc templates ----

test("worker --template: hc's template form, a child of the bot's pane in the worktree, labelled; ledger names it", (t) => {
  const s = scene(t);
  const r = s.cli(["worker", "fix the login form", "--branch", "feat/login", "--template", "dev-sol", "--json"]);
  assert.equal(r.code, 0, r.err);
  const run = s.runs()[0];
  const wt = join(s.project, ".claude/worktrees/feat-login");
  assert.deepEqual(run.slice(0, 3), ["run", "--bg", "--json"]);
  assert.equal(run[run.indexOf("--parent") + 1], "t1");
  assert.equal(run[run.indexOf("--cwd") + 1], wt);
  assert.equal(run[run.indexOf("--name") + 1], "feat-login");
  assert.deepEqual(labelsOf(run), [`worker.of=${ID.dev}`, "task=feat/login", "worker.role=dev", "worker.template=dev-sol"]);
  assert.deepEqual(templateArgv(run), ["dev-sol", "fix the login form"], "the template sets its own command: no env, no agent argv");
  const out = r.json();
  assert.deepEqual([out.template, out.agent, out.model, out.effort, out.argv], ["dev-sol", null, null, null, null]);
  assert.doesNotMatch(r.err, /ignored/, "a per-task template sets the bot's defaults aside without a word");
  const [row] = s.ledger();
  assert.deepEqual({ ...row, at: undefined }, { event: "start", kind: "worker", terminal: "t100", pid: 5100, botId: ID.dev,
    task: "feat/login", worktree: wt, agent: null, model: null, effort: null, template: "dev-sol", role: "dev", at: undefined });
  // A codex template: no Claude hook in the worktree, and no warning about one.
  assert.equal(existsSync(join(wt, ".claude/settings.local.json")), false);
  assert.doesNotMatch(r.err, /session hook/);
  // Text output names the template and the agent it runs.
  const text = s.cli(["worker", "review it", "--branch", "feat/review", "--template", "opus-rev"]);
  assert.equal(text.code, 0, text.err);
  assert.match(text.out, /template  opus-rev \(runs claude\)/);
  assert.ok(existsSync(join(s.project, ".claude/worktrees/feat-review/.claude/settings.local.json")), "a Claude template gets the hook");
});

test("worker --template with --agent, --model or --effort is refused; an unknown template too, before any worktree", (t) => {
  const s = scene(t);
  for (const extra of [["--model", "gpt-6.1-sol"], ["--agent", "codex"], ["--effort", "high"]]) {
    const r = s.cli(["worker", "x", "--branch", "feat/x", "--template", "dev-sol", ...extra]);
    assert.equal(r.code, 2, extra.join(" "));
    assert.match(r.err, /A template owns its command: --template goes alone/);
  }
  const unknown = s.cli(["worker", "x", "--branch", "feat/x", "--template", "nope"]);
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /hc has no template nope\. Its templates: dev-sol, opus-rev, mystery/);
  assert.equal(s.cli(["worker", "x", "--branch", "feat/x", "--template", "-x"]).code, 2, "not a template name");
  const empty = s.cli(["worker", "x", "--branch", "feat/x", "--template="]);
  assert.equal(empty.code, 2, "an empty --template is refused, never the default template");
  assert.match(empty.err, /--template needs a name/);
  assert.equal(s.runs().length, 0);
  assert.equal(existsSync(join(s.project, ".claude/worktrees/feat-x")), false);
});

test("worker: a bots.json template default is used; a per-task --agent sets it aside", (t) => {
  const file = team();
  file.bots[1].worker = { template: "dev-sol" };
  file.bots[2].worker = { ...file.bots[2].worker, template: "dev-sol" };
  const s = scene(t, { file });
  const r = s.cli(["worker", "build it", "--branch", "feat/build", "--json"], { from: "t4" });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(templateArgv(s.runs()[0]), ["dev-sol", "build it"]);
  assert.equal(r.json().template, "dev-sol");
  assert.doesNotMatch(r.err, /ignored/, "no agent, model or effort default to set aside");
  // The captain picks Claude for a reviewer: the template default steps aside.
  const o = s.cli(["worker", "review it", "--branch", "review/x", "--agent", "claude", "--json"], { from: "t4" });
  assert.equal(o.code, 0, o.err);
  assert.deepEqual(after(s.runs()[1]), ["claude", "review it"]);
  assert.deepEqual([o.json().template, o.json().agent], [null, "claude"]);
  assert.equal(labelsOf(s.runs()[1]).some((l) => l.startsWith("worker.template=")), false);
  assert.deepEqual(s.ledger().map((row) => row.template), ["dev-sol", null]);
  // Template and agent, model and effort all as defaults: the template wins, with a warning.
  const both = s.cli(["worker", "dev it", "--branch", "feat/dev", "--json"]);
  assert.equal(both.code, 0, both.err);
  assert.deepEqual(templateArgv(s.runs()[2]), ["dev-sol", "dev it"]);
  assert.match(both.err, /Dev's worker template dev-sol owns its command; its worker agent, model, effort defaults are ignored/);
  // --model alone is a per-task pick too: the default template steps aside for the default agent.
  const m = s.cli(["worker", "tune it", "--branch", "feat/tune", "--model", "gpt-6", "--json"]);
  assert.equal(m.code, 0, m.err);
  assert.deepEqual(after(s.runs()[3]), ["codex", "--model", "gpt-6", "-c", "model_reasoning_effort=medium", "tune it"]);
});

test("worker --template: an agent the command doesn't name skips the hook with a warning; no template list refuses", (t) => {
  const s = scene(t);
  const r = s.cli(["worker", "x", "--branch", "feat/x", "--template", "mystery"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /Can't tell which agent template mystery runs, so no session hook was written/);
  assert.equal(existsSync(join(s.project, ".claude/worktrees/feat-x/.claude/settings.local.json")), false);
  const old = scene(t, { templates: null });
  // No list: an unlisted name would run as a program (`--template rm`), so nothing starts.
  const o = old.cli(["worker", "x", "--branch", "feat/x", "--template", "rm"]);
  assert.equal(o.code, 1, o.err);
  assert.match(o.err, /hc templates gave no list .*rm can't be checked as a template.*Not started/);
  assert.equal(old.runs().length, 0);
  assert.equal(existsSync(join(old.project, ".claude/worktrees/feat-x")), false);
});

// ---- refusals ----

test("worker refuses outside a bot's pane: no HC_TERMINAL_ID, a pane with no bot label, a bot of no project here", (t) => {
  const s = scene(t);
  const none = s.cli(["worker", "x", "--branch", "feat/x"], { from: null });
  assert.equal(none.code, 1);
  assert.match(none.err, /Only a bot starts workers.*HC_TERMINAL_ID isn't set/);
  const plain = s.cli(["worker", "x", "--branch", "feat/x"], { from: "t2" });
  assert.equal(plain.code, 1);
  assert.match(plain.err, /t2 isn't a bot's pane/);
  const stray = s.cli(["worker", "x", "--branch", "feat/x"], { from: "t3" });
  assert.equal(stray.code, 1);
  assert.match(stray.err, /plays bot b-zzzzzzzzzz, which .* doesn't define/);
  assert.equal(s.runs().length, 0);
  assert.equal(existsSync(join(s.project, ".claude/worktrees")), false, "no worktree made");
  for (const args of [["worker", "--branch", "a"], ["worker", "x"], ["worker", "x", "--branch", "a", "--worktree", "b"], ["worker", "x", "--worktree", "b", "--base", "main"]]) {
    assert.equal(s.cli(args).code, 2, args.join(" "));
  }
});

test("worker refuses a worktree of a project the bot doesn't belong to", (t) => {
  const s = scene(t);
  const other = join(s.root, "other");
  mkdirSync(other);
  git(other, "init", "-q", "-b", "main");
  git(other, "commit", "-q", "--allow-empty", "-m", "start");
  const wt = join(s.root, "other-wt");
  git(other, "worktree", "add", "-q", "-b", "feat/y", wt);
  const r = s.cli(["worker", "y", "--worktree", wt]);
  assert.equal(r.code, 1);
  assert.match(r.err, /is a worktree of .*other, not of Dev's project/);
  assert.equal(s.runs().length, 0);
});

// ---- the bots.json field ----

test("bots.json worker: kept through parse, a form save and checkBots; an invalid one is dropped with a warning", () => {
  const text = JSON.stringify(team());
  const { file, raw, warnings } = parseBots(text);
  assert.deepEqual(warnings, []);
  assert.deepEqual(file.bots[2].worker, { agent: "codex", model: "gpt-5.5", effort: "medium" });
  // The form's entry names no worker field: a save keeps the stored one.
  const formEntry = { id: ID.dev, name: "Dev", kind: "member", role: "builds", instructions: "", look: { character: "star", colour: "blue" }, agent: "claude", lead: ID.main };
  const saved = applyBotEdit(raw, formEntry);
  assert.deepEqual(checkBots(saved, raw), []);
  assert.deepEqual(parseBots(JSON.stringify(saved)).file.bots[2].worker, { agent: "codex", model: "gpt-5.5", effort: "medium" });
  // A template default survives the same round-trip.
  const withTemplate = team();
  withTemplate.bots[1].worker = { template: "dev-sol", effort: "high" };
  const tp = parseBots(JSON.stringify(withTemplate));
  assert.deepEqual(tp.warnings, []);
  const resaved = applyBotEdit(tp.raw, { ...formEntry, id: ID.cap, name: "Captain", agent: "codex" });
  assert.deepEqual(checkBots(resaved, tp.raw), []);
  assert.deepEqual(parseBots(JSON.stringify(resaved)).file.bots[1].worker, { template: "dev-sol", effort: "high" });
  withTemplate.bots[1].worker = { template: "--x" };
  assert.match(parseBots(JSON.stringify(withTemplate)).warnings.join("\n"), /worker template starts with a dash/);
  withTemplate.bots[1].worker = { template: "dev sol; rm" };
  const odd = parseBots(JSON.stringify(withTemplate));
  assert.equal(odd.file.bots[1].worker, undefined, "not an hc template name: dropped");
  assert.match(odd.warnings.join("\n"), /b-bbbbbbbbbb: worker template "dev sol; rm" isn't an hc template name.*; ignored/);
  // An entry naming it empty removes it.
  assert.equal(applyBotEdit(raw, { ...formEntry, worker: {} }).bots[2].worker, undefined);
  const bad = team();
  bad.bots[1].worker = { model: 5 };
  const parsed = parseBots(JSON.stringify(bad));
  assert.equal(parsed.file.bots[1].worker, undefined);
  assert.ok(parsed.warnings.some((w) => /b-bbbbbbbbbb: worker model not text; ignored/.test(w)));
  assert.deepEqual(checkBots(bad), [], "like a bad model: ignored on reading, never a block on writing");
  bad.bots[1].worker = "codex";
  assert.ok(parseBots(JSON.stringify(bad)).warnings.some((w) => /worker is not an object/.test(w)));
});

test("create and edit --worker-agent/--worker-model/--worker-effort write the field; an empty value clears one", (t) => {
  const s = scene(t);
  const r = s.cli(["edit", "Genie", "--worker-agent", "claude-code", "--worker-model", "opus", "--worker-effort", "high"], { from: null });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(s.bots().bots[0].worker, { agent: "claude", model: "opus", effort: "high" });
  assert.equal(s.cli(["edit", "Genie", "--worker-model", "not-a-model"], { from: null }).code, 1, "a model off the agent's list");
  assert.equal(s.cli(["edit", "Genie", "--worker-effort", "Very High"], { from: null }).code, 2);
  assert.equal(s.cli(["edit", "Genie", "--worker-model="], { from: null }).code, 0);
  assert.deepEqual(s.bots().bots[0].worker, { agent: "claude", effort: "high" });
  s.cli(["edit", "Genie", "--worker-agent=", "--worker-effort="], { from: null });
  assert.equal(s.bots().bots[0].worker, undefined, "nothing left: removed");
  const c = s.cli(["create", "--name", "Tester", "--agent", "claude", "--worker-agent", "codex", "--worker-model", "gpt-5.5", "--json"], { from: null });
  assert.equal(c.code, 0, c.err);
  assert.deepEqual(c.json().bot.worker, { agent: "codex", model: "gpt-5.5" }, "codex lists no models here: any model is taken");
  assert.equal(s.cli(["edit", "Tester", "--worker-template", "dev-sol"], { from: null }).code, 0);
  assert.deepEqual(s.bots().bots.find((b) => b.name === "Tester").worker, { agent: "codex", model: "gpt-5.5", template: "dev-sol" });
  assert.equal(s.cli(["edit", "Tester", "--worker-template", "-x"], { from: null }).code, 2);
  assert.equal(s.cli(["edit", "Tester", "--worker-template="], { from: null }).code, 0);
  assert.deepEqual(s.bots().bots.find((b) => b.name === "Tester").worker, { agent: "codex", model: "gpt-5.5" });
});

// ---- the pure parts ----

test("effortArgs: claude/antigravity --effort, codex -c model_reasoning_effort, pi/omp --thinking; others none", () => {
  assert.deepEqual(effortArgs("claude", "high"), ["--effort", "high"]);
  assert.deepEqual(effortArgs("codex", "low"), ["-c", "model_reasoning_effort=low"]);
  assert.deepEqual(effortArgs("pi", "max"), ["--thinking", "max"]);
  assert.deepEqual(effortArgs("omp", "xhigh"), ["--thinking=xhigh"]);
  assert.deepEqual(effortArgs("antigravity", "xhigh"), ["--effort", "xhigh"]);
  assert.deepEqual(effortArgs("grok", "high"), []);
  assert.deepEqual(effortArgs("gemini", "high"), [], "gemini is retired");
  assert.deepEqual(effortArgs("claude", null), []);
  const plan = workerPlan({ name: "G", agent: "grok", worker: { effort: "high" } });
  assert.equal(plan.effort, null);
  assert.deepEqual(plan.argv, ["grok"]);
  assert.match(plan.warnings[0], /Grok has no effort flag; effort high left out/);
  const agy = workerPlan({ name: "A", agent: "antigravity", worker: { model: "gemini-3.1-pro", effort: "max" } });
  assert.deepEqual(agy.argv, ["agy", "--model", "gemini-3.1-pro", "--effort", "max"]);
  assert.deepEqual(agy.warnings, []);
  const legacy = workerPlan({ name: "L", agent: "claude" }, { agent: "gemini", effort: "low" });
  assert.equal(legacy.agent, "antigravity", "a typed gemini runs antigravity");
  assert.deepEqual(legacy.argv, ["agy", "--effort", "low"]);
  assert.match(workerPlan({ name: "G", agent: "claude" }, { agent: "nope" }).error, /isn't a coding agent/);
  assert.match(workerPlan({ name: "G", agent: "claude" }, { effort: "$(x)" }).error, /isn't an effort level/);
});

test("workers.js: hc run arguments, slugs, worktree list, base order, ledger rows, session changes", () => {
  assert.deepEqual(workerArgs({ botId: ID.dev, branch: "feat/a", name: "feat-a", cwd: "/p/wt", parent: "t1", model: "opus", effort: null, argv: ["claude", "--model", "opus"], task: "do; rm -rf /" }),
    ["run", "--bg", "--json", "--name", "feat-a", "--cwd", "/p/wt", "--label", `worker.of=${ID.dev}`, "--label", "task=feat/a",
      "--label", "worker.model=opus", "--parent", "t1", "--", "claude", "--model", "opus", "do; rm -rf /"]);
  assert.equal(branchSlug("Feat/Login Form"), "feat-login-form");
  assert.deepEqual(parseWorktrees("worktree /p\nHEAD 1\nbranch refs/heads/main\n\nworktree /p/w\nHEAD 2\ndetached\n"),
    [{ path: "/p", branch: "main", detached: false, bare: false }, { path: "/p/w", branch: null, detached: true, bare: false }]);
  assert.deepEqual(baseCandidates(null, "origin/dev"), ["origin/dev", "dev", "origin/main", "main", "origin/master", "master"]);
  assert.deepEqual(baseCandidates("v1", "origin/dev"), ["v1"]);
  assert.equal(startRow({ kind: "seat", terminal: "t1", botId: ID.main, at: 0 }).at, "1970-01-01T00:00:00.000Z");
  assert.deepEqual(readLedger('{"a":1}\n{torn\n\n[1]\n{"b":2}\n'), [{ a: 1 }, { b: 2 }]);
  const get = { labels: { "agent.session": "s1" } };
  assert.equal(sessionChange(get, JSON.stringify({ session_id: "s1" })), null, "same session: nothing");
  assert.deepEqual(sessionChange(get, JSON.stringify({ session_id: "s2", transcript_path: "/x.jsonl" })), { session: "s2", transcript: "/x.jsonl" });
  assert.equal(sessionChange(get, "not json"), null);
  // The template form: `<template> <task>` after the options, no `--`, the template label, no env and no model labels.
  assert.deepEqual(workerArgs({ botId: ID.dev, branch: "feat/a", name: null, cwd: "/p/wt", parent: "t1", model: null, effort: null,
    argv: null, task: "do it", template: "dev-sol", path: "/x/bin" }),
  ["run", "--bg", "--json", "--cwd", "/p/wt", "--label", `worker.of=${ID.dev}`, "--label", "task=feat/a",
    "--label", "worker.template=dev-sol", "--parent", "t1", "dev-sol", "do it"]);
  assert.deepEqual(runArgv(workerArgs({ botId: ID.dev, branch: "b", cwd: "/w", parent: "t1", argv: ["omp"], task: "t", path: "/a:/b" })),
    ["/usr/bin/env", "PATH=/a:/b", "omp", "t"]);
  // agy takes its first prompt only through -i; a bare trailing task is an error to it.
  const agyPlan = workerPlan({ name: "A", agent: "antigravity", worker: { model: "gemini-3.1-pro", effort: "high" } });
  assert.deepEqual(workerArgs({ botId: ID.dev, branch: "feat/a", name: "feat-a", cwd: "/p/wt", parent: "t1", agent: agyPlan.agent,
    model: agyPlan.model, effort: agyPlan.effort, argv: agyPlan.argv, task: "fix the build", path: "/x/bin" }),
  ["run", "--bg", "--json", "--name", "feat-a", "--cwd", "/p/wt", "--label", `worker.of=${ID.dev}`, "--label", "task=feat/a",
    "--label", "worker.model=gemini-3.1-pro", "--label", "worker.effort=high", "--parent", "t1", "--",
    "/usr/bin/env", "PATH=/x/bin", "agy", "--model", "gemini-3.1-pro", "--effort", "high", "-i", "fix the build"]);
  assert.deepEqual(promptArgs("antigravity", "t"), ["-i", "t"]);
  assert.deepEqual(promptArgs("claude", "t"), ["t"]);
  assert.deepEqual(promptArgs(undefined, "t"), ["t"], "no agent named: the bare task, as before");
  assert.deepEqual(TEMPLATES.map((x) => templateAgent(x.command)), ["codex", "claude", null]);
  assert.equal(templateAgent("claude-wrapper --model x"), null, "a word of its own, not a prefix");
  assert.equal(startRow({ kind: "worker", terminal: "t9", botId: ID.dev, template: "dev-sol" }).template, "dev-sol");
  assert.match(workerPlan({ name: "G", agent: "claude" }, { template: "x", model: "m" }).error, /--template goes alone, without --model/);
  assert.equal(sessionChange(null, JSON.stringify({ session_id: "s2" })), null);
});

test("the bot briefing says a bot doesn't code: one worker per task, checked, ended with hc kill once merged", async () => {
  const { briefingText, WORKER_LINE, BRIEFING_LIMIT } = await import("../mods/am-sidebar/briefingText.mjs");
  const file = parseBots(JSON.stringify(team())).file;
  const text = briefingText({ self: { ...file.bots[2], instructions: "x".repeat(4000) }, file });
  assert.ok(text.includes(WORKER_LINE));
  assert.match(WORKER_LINE, /automagik-herdr worker/);
  assert.match(WORKER_LINE, /hc kill/);
  assert.ok(text.length <= BRIEFING_LIMIT);
});

// ---- review fixes ----

// ---- roles and one writer per worktree ----

/** Puts terminals into the fake hc's state (panes of ranked bots, workers started elsewhere). */
const addTerminals = (s, ...terms) => {
  const st = s.hcState();
  st.terminals.push(...terms);
  writeFileSync(join(s.root, "hc.json"), JSON.stringify(st));
};
const worker = (address, cwd, labels) => ({ ...term(address, { cwd }), labels });

test("worker --role: defaults from each rank; a bad --role exits 2; the worker.role label and the ledger role", (t) => {
  const R = { tester: "b-dddddddddd", reviewer: "b-eeeeeeeeee", fixer: "b-ffffffffff", captain: "b-gggggggggg", dev: "b-hhhhhhhhhh" };
  const file = team();
  for (const [rank, id] of Object.entries(R)) file.bots.push(bot(id, "member", { name: `R ${rank}`, rank }));
  const s = scene(t, { file });
  addTerminals(s, ...Object.entries(R).map(([rank, id]) => term(`p-${rank}`, { bot: id, cwd: s.project })));
  const want = { tester: "test", reviewer: "review", fixer: "fix", captain: "dev", dev: "dev" };
  for (const [rank, role] of Object.entries(want)) {
    const r = s.cli(["worker", "go", "--branch", `feat/${rank}`, "--json"], { from: `p-${rank}` });
    assert.equal(r.code, 0, r.err);
    assert.equal(r.json().role, role, `a ${rank} bot's worker defaults to ${role}`);
    assert.ok(labelsOf(s.runs().at(-1)).includes(`worker.role=${role}`));
    assert.equal(s.ledger().at(-1).role, role);
  }
  const plain = s.cli(["worker", "go", "--branch", "feat/plain"]);
  assert.equal(plain.code, 0, plain.err);
  assert.match(plain.out, /^t\d+\n {2}role {6}dev\n/, "no rank: dev, shown in the text output");
  // A captain passes --role explicitly.
  const asked = s.cli(["worker", "go", "--branch", "feat/asked", "--role", "test", "--json"], { from: "p-captain" });
  assert.equal(asked.json().role, "test");
  assert.equal(s.hcState().terminals.find((x) => x.address === asked.json().terminal).labels["worker.role"], "test");
  const runs = s.runs().length;
  for (const bad of [["--role", "boss"], ["--role="], ["--role", "reviewer"]]) {
    const r = s.cli(["worker", "go", "--branch", "feat/bad", ...bad]);
    assert.equal(r.code, 2, `${bad.join(" ")}: ${r.err}`);
    assert.match(r.err, /--role is one of dev, test, review, fix/);
  }
  assert.equal(s.runs().length, runs, "nothing started");
  assert.equal(existsSync(join(s.project, ".claude/worktrees/feat-bad")), false, "refused before any worktree is made");
  // The task label stays the branch, and a seat row's role is null.
  assert.ok(labelsOf(s.runs().at(-1)).includes("task=feat/asked"));
  assert.equal(startRow({ kind: "seat", terminal: "t1", botId: ID.main }).role, null);
});

test("worker: one writer per worktree across bots; reviewers alongside; one bot's reviewers one per branch", async (t) => {
  const s = scene(t);
  assert.equal(s.cli(["worker", "one", "--branch", "feat/login"]).code, 0);
  for (const [from, role] of [["t1", "dev"], ["t4", "dev"], ["t4", "test"], ["t4", "fix"]]) {
    const r = s.cli(["worker", "again", "--branch", "feat/login", "--role", role], { from });
    assert.equal(r.code, 1, `${from} ${role}`);
    assert.match(r.err, /feat-login already has a live writer: t100 \(Dev's dev\)\. One writer per worktree\. /);
    assert.match(r.err, /Check it \(hc read t100\) or end it \(hc kill t100\) before starting another\./);
  }
  assert.equal(s.runs().length, 1);
  // Reviewers start alongside the writer, one per bot per branch.
  const review = s.cli(["worker", "review", "--branch", "feat/login", "--role", "review"], { from: "t4" });
  assert.equal(review.code, 0, review.err);
  const twice = s.cli(["worker", "review", "--branch", "feat/login", "--role", "review"], { from: "t4" });
  assert.equal(twice.code, 1);
  assert.match(twice.err, /Captain already has a live review worker on feat\/login: t101\. Check it \(hc read t101\) or end it \(hc kill t101\)/);
  assert.equal(s.cli(["worker", "review", "--branch", "feat/login", "--role", "review"]).code, 0, "another bot's reviewer");
  assert.equal(s.cli(["worker", "review", "--branch", "feat/other", "--role", "review"], { from: "t4" }).code, 0,
    "the same bot reviews another branch in parallel");
  // The writer ends: reviewers hold nothing, so another bot's writer may start.
  s.finish("t100");
  assert.equal(s.cli(["worker", "fix it", "--branch", "feat/login", "--role", "fix"], { from: "t4" }).code, 0);
  // Two bots' writers at once on one worktree: one starts, the other is refused.
  const wt = join(s.project, ".claude/worktrees/feat-conc");
  git(s.project, "worktree", "add", "-q", "-b", "feat/conc", wt);
  const both = await Promise.all([s.cliAsync(["worker", "c", "--worktree", wt]), s.cliAsync(["worker", "c", "--worktree", wt], { from: "t4" })]);
  assert.deepEqual(both.map((r) => r.code).sort(), [0, 1]);
  assert.equal(s.runs().filter((r) => r[r.indexOf("--cwd") + 1] === wt).length, 1);
});

test("worker: a live worker with no worker.role label holds its worktree as a writer; cwd compared as a real path", (t) => {
  const s = scene(t);
  const wt = join(s.project, ".claude/worktrees/feat-old");
  git(s.project, "worktree", "add", "-q", "-b", "feat/old", wt);
  const link = join(s.root, "old-link");
  symlinkSync(wt, link);
  addTerminals(s,
    worker("t50", link, { "worker.of": ID.cap, task: "feat/old" }), // started before roles, its cwd through a symlink
    worker("t51", wt, {}), // a plain terminal in the worktree: no worker
    worker("far/t9", wt, { "worker.of": ID.cap, task: "feat/old", "worker.role": "dev" })); // another machine: not seen
  const r = s.cli(["worker", "go", "--worktree", wt]);
  assert.equal(r.code, 1);
  assert.match(r.err, /already has a live writer: t50 \(Captain's worker, no role label\)\. One writer per worktree\. Check it \(hc read t50\)/);
  assert.equal(s.cli(["worker", "look", "--worktree", wt, "--role", "review"]).code, 0, "a reviewer may start beside it");
  s.finish("t50");
  const now = s.cli(["worker", "go", "--worktree", wt, "--json"]);
  assert.equal(now.code, 0, now.err);
  assert.equal(now.json().role, "dev");
});

test("worker: the check and the start run under one lock per worktree, named by its real path's hash", async (t) => {
  const { worktreeLock } = await import("../mods/am-sidebar/bin/automagik-herdr.mjs");
  const s = scene(t);
  const [a, b] = [join(s.root, "wa"), join(s.root, "wb")];
  mkdirSync(a);
  mkdirSync(b);
  symlinkSync(a, join(s.root, "wa-link"));
  assert.match(worktreeLock("/L", a), /^\/L\/worktree-[0-9a-f]{16}\.lock$/);
  assert.notEqual(worktreeLock("/L", a), worktreeLock("/L", b), "two worktrees, two locks");
  assert.equal(worktreeLock("/L", join(s.root, "wa-link")), worktreeLock("/L", a), "one folder, one lock, by its real path");
  // Held while hc runs: the fake hc wrapper lists the lock folder on every call.
  const lockDir = join(s.app, "automagik-herdr");
  const seen = join(s.root, "locks.txt");
  exe(join(s.root, "bin/hc"), `#!/bin/sh\nls "${lockDir}" >> "${seen}" 2>/dev/null\nexec "${process.execPath}" "${FAKE_HC}" "$@"\n`);
  assert.equal(s.cli(["worker", "go", "--branch", "feat/lock"]).code, 0);
  const wt = join(s.project, ".claude/worktrees/feat-lock");
  const listed = readFileSync(seen, "utf8");
  assert.ok(listed.includes(worktreeLock(lockDir, wt).slice(lockDir.length + 1)), listed);
  assert.doesNotMatch(listed, /worker-b-/, "no per-bot lock any more");
});

test("workers.js: workerRole from the rank or --role, writesWorktree, the role label in both hc run forms", () => {
  assert.deepEqual(["tester", "reviewer", "fixer", "captain", "dev", undefined].map((rank) => workerRole({ rank }).role),
    ["test", "review", "fix", "dev", "dev", "dev"]);
  assert.deepEqual(workerRole({ rank: "reviewer" }, "dev"), { role: "dev" });
  assert.match(workerRole({}, "boss").error, /--role is one of dev, test, review, fix, not "boss"/);
  assert.deepEqual([{ "worker.role": "dev" }, { "worker.role": "test" }, { "worker.role": "fix" }, {}, { "worker.role": "review" }]
    .map(writesWorktree), [true, true, true, true, false]);
  assert.deepEqual(labelsOf(workerArgs({ botId: ID.dev, branch: "b", role: "review", cwd: "/w", parent: "t1", argv: ["claude"], task: "t" })),
    [`worker.of=${ID.dev}`, "task=b", "worker.role=review"]);
  assert.deepEqual(labelsOf(workerArgs({ botId: ID.dev, branch: "b", role: "fix", cwd: "/w", parent: "t1", task: "t", template: "dev-sol" })),
    [`worker.of=${ID.dev}`, "task=b", "worker.role=fix", "worker.template=dev-sol"]);
  assert.equal(startRow({ kind: "worker", terminal: "t9", botId: ID.dev, role: "test" }).role, "test");
});
test("worker: a model starting with a dash is refused, from --model, --worker-model or bots.json", (t) => {
  const file = team();
  file.bots[2].worker = { agent: "claude", model: "--dangerously-skip-permissions" };
  const s = scene(t, { file });
  const flag = s.cli(["worker", "x", "--branch", "feat/x", "--model=--dangerously-skip-permissions"]);
  assert.equal(flag.code, 2);
  assert.match(flag.err, /starts with a dash/);
  assert.equal(s.cli(["edit", "Genie", "--worker-model=-x"], { from: null }).code, 2);
  // The stored one is invalid: dropped on reading, so the worker runs its agent's default.
  assert.match(parseBots(JSON.stringify(file)).warnings.join("\n"), /worker model starts with a dash/);
  const r = s.cli(["worker", "x", "--branch", "feat/x", "--json"]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(after(s.runs()[0]), ["claude", "x"]);
});

test("worker: task worktrees are excluded from the main checkout; master is the last base; colliding folders are named", (t) => {
  const s = scene(t, { branch: "master" });
  const r = s.cli(["worker", "x", "--branch", "feat/a", "--json"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.json().base, "master");
  assert.ok(readFileSync(join(s.project, ".git/info/exclude"), "utf8").split("\n").includes("/.claude/worktrees/"));
  const status = git(s.project, "status", "--porcelain", "--untracked-files=all");
  assert.equal(status.split("\n").some((l) => l.includes(".claude/")), false, status);
  const clash = s.cli(["worker", "y", "--branch", "Feat-A"]);
  assert.equal(clash.code, 1);
  assert.match(clash.err, /Branch Feat-A uses the same folder as branch feat\/a/);
});

test("worker: --project must be the calling pane's project; a missing hook script names the usage link", (t) => {
  const s = scene(t, { briefing: false });
  const other = join(s.root, "plain");
  mkdirSync(other);
  const r = s.cli(["worker", "x", "--branch", "feat/x", "--project", other]);
  assert.equal(r.code, 1);
  assert.match(r.err, /--project .*plain isn't the project of t1/);
  assert.equal(s.cli(["worker", "x", "--branch", "feat/x", "--project", s.project, "--agent", "claude"]).code, 0);
  const w = s.cli(["worker", "y", "--branch", "feat/y", "--agent", "claude"]);
  assert.match(w.err, /The feat\/y worker's Claude session won't be linked to usage/);
  assert.doesNotMatch(w.err, /gets no/);
});
