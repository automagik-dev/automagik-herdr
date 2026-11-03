// The briefing hook survives renames (Group 6b): hooks move onto <app home>/automagik-herdr/briefing.mjs,
// which runs whichever sidebar folder is installed; a worker's worktree is covered; each rewrite is
// backed up and journalled; the way back edits only what still holds the forward value; the CLI link
// follows the sidebar folder. Scratch app homes, projects and HOMEs only; neutral names throughout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ledgerPath } from "../mods/am-sidebar/workers.js";
import { OURS, commandFor, directHookCommand, hookCommand, legacyHookCommand, mergeHook, stableBriefingPath } from "../mods/am-sidebar/briefingText.mjs";
import {
  BACKUP_SUFFIX, HOOKS_JOURNAL, botPaneFolders, foldersOf, hooksNotice, knownProjects, ledgerFolders, migrateHooks, relink, retargetHooks, revertHooks, syncHooks,
  toStable,
} from "../mods/am-sidebar/migrateHooks.mjs";

// git here must not read this host's global config.
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACK = join(ROOT, "mods", "am-sidebar");
const UPDATE = join(PACK, "update.mjs");
const NODE_DIR = dirname(process.execPath);
const read = (path) => readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(read(path));
const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
const git = (args, cwd) => execFileSync("git", args, { cwd, stdio: "pipe" });
const settings = (dir) => join(dir, ".claude", "settings.local.json");
const commands = (file) => readJson(file).hooks.UserPromptSubmit.flatMap((g) => g.hooks.map((h) => h.command));

function scratch(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "am-hooks-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = join(root, "app");
  const mods = join(app, "mods");
  mkdirSync(mods, { recursive: true });
  return { root, app, mods };
}

/** A git project with one commit; `worker`: also a bot worker's worktree at <project>/.claude/worktrees/<worker>. */
function project(root, name, worker) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  git(["init", "-q", dir]);
  git(["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init"], dir);
  if (worker) git(["worktree", "add", "-q", "-b", worker, join(dir, ".claude", "worktrees", worker)], dir);
  return dir;
}

/** A settings.local.json as v0.2.0 left it, with permissions Claude Code wrote and another hook. */
const v020 = (app) => ({
  permissions: { allow: ["Bash(git status)"] },
  hooks: {
    UserPromptSubmit: [{ hooks: [{ type: "command", command: "brain recall" }] }, { hooks: [{ type: "command", command: legacyHookCommand(app), timeout: 10 }] }],
    Stop: [{ hooks: [{ type: "command", command: "say done" }] }],
  },
});
const writeSettings = (dir, value) => write(settings(dir), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);

// ---- pure ----

test("OURS knows the entry point and both sidebar folders; mergeHook never adds a second hook beside any of them", () => {
  for (const path of ["/h/automagik-herdr/briefing.mjs", "/h/mods/spaces-agents/briefing.mjs", "/h/mods/am-sidebar/briefing.mjs"]) {
    assert.match(commandFor(path), OURS);
    const text = JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: commandFor(path), timeout: 10 }] }] } });
    const merged = mergeHook(text, hookCommand("/h"));
    assert.deepEqual(JSON.parse(merged.text).hooks.UserPromptSubmit, [{ hooks: [{ type: "command", command: hookCommand("/h"), timeout: 10 }] }]);
  }
  assert.doesNotMatch("node /h/mods/pocket-link/briefing.mjs", OURS);
  assert.doesNotMatch("node /h/briefing.mjs", OURS);
});

test("retargetHooks: only the pack's command shape moves, every other byte stays; odd shapes and bad JSON are reported", () => {
  const legacy = legacyHookCommand("/h");
  const text = `{\n    "permissions":{"allow":["Bash(ls)"]},\n  "hooks": {"UserPromptSubmit": [ {"hooks": [{"type":"command","command":${JSON.stringify(legacy)}}]} ]}\n}`;
  const r = retargetHooks(text, toStable("/h"));
  assert.deepEqual(r.edits, [{ before: legacy, after: hookCommand("/h") }]);
  assert.equal(r.text, text.replace(JSON.stringify(legacy), JSON.stringify(hookCommand("/h"))), "byte for byte but the command");
  // Already there: no edit. Another app home's (or a checkout's) script is not this run's to move.
  assert.deepEqual(retargetHooks(r.text, toStable("/h")).edits, []);
  assert.deepEqual(retargetHooks(text, toStable("/other")), { text, edits: [], odd: [] });
  // The same command under another event first: only the UserPromptSubmit one changes, in place.
  const twice = `{"hooks": {"SessionStart": [{"hooks": [{"type":"command","command":${JSON.stringify(legacy)}}]}],\n "UserPromptSubmit": [{"hooks": [{"type":"command","command":${JSON.stringify(legacy)}}]}]}}\n`;
  const at = twice.lastIndexOf(JSON.stringify(legacy));
  assert.equal(retargetHooks(twice, toStable("/h")).text,
    twice.slice(0, at) + JSON.stringify(hookCommand("/h")) + twice.slice(at + JSON.stringify(legacy).length));
  // The person's own command around our script: reported, kept.
  const odd = JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: "node /h/mods/spaces-agents/briefing.mjs | tee /tmp/log" }] }] } });
  assert.deepEqual(retargetHooks(odd, toStable("/h")), { text: odd, edits: [], odd: ["node /h/mods/spaces-agents/briefing.mjs | tee /tmp/log"] });
  assert.match(retargetHooks("{ nope", toStable("/h")).error, /not valid JSON/);
  assert.match(retargetHooks("[]", toStable("/h")).error, /not a JSON object/);
  // A command the file spells with its own escapes can't be swapped in place: reported, never re-serialised.
  const escaped = text.replace(JSON.stringify(legacy), JSON.stringify(legacy).replaceAll("/", "\\/"));
  assert.match(retargetHooks(escaped, toStable("/h")).error, /can't be changed in place/);
});

// ---- on scratch projects ----

test("migrateHooks: a project and its worker's worktree move, each backed up and journalled; a second run does nothing", (t) => {
  const s = scratch(t);
  const proj = project(s.root, "proj", "w1");
  const worker = join(proj, ".claude", "worktrees", "w1");
  writeSettings(proj, v020(s.app));
  writeSettings(worker, { permissions: { allow: ["Edit"] }, hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: legacyHookCommand(s.app), timeout: 10 }] }] } });
  const before = { proj: read(settings(proj)), worker: read(settings(worker)) };
  assert.deepEqual(foldersOf([proj]).map((f) => realpathSync(f)), [proj, worker].map((f) => realpathSync(f)));

  const r = migrateHooks([proj], { appHome: s.app });
  assert.deepEqual(r.rewritten, [settings(proj), settings(worker)]);
  assert.deepEqual(r.skipped, []);
  const moved = readJson(settings(proj));
  assert.deepEqual(commands(settings(proj)), ["brain recall", hookCommand(s.app)]);
  assert.deepEqual(moved.permissions, v020(s.app).permissions);
  assert.deepEqual(moved.hooks.Stop, v020(s.app).hooks.Stop);
  assert.deepEqual(commands(settings(worker)), [hookCommand(s.app)]);
  assert.deepEqual(readJson(settings(worker)).permissions, { allow: ["Edit"] });
  assert.equal(read(settings(proj) + BACKUP_SUFFIX), before.proj, "the original, beside it");
  assert.equal(read(settings(worker) + BACKUP_SUFFIX), before.worker);
  const journal = readJson(join(s.app, "automagik-herdr", HOOKS_JOURNAL));
  assert.deepEqual(journal.hooks.map((e) => [e.file, e.before, e.after]), [
    [settings(proj), legacyHookCommand(s.app), hookCommand(s.app)],
    [settings(worker), legacyHookCommand(s.app), hookCommand(s.app)],
  ]);

  const again = migrateHooks([proj], { appHome: s.app });
  assert.deepEqual(again, { rewritten: [], skipped: [], journal: null });
  assert.equal(existsSync(`${settings(proj)}${BACKUP_SUFFIX}-2`), false, "no second backup");
  assert.deepEqual(readJson(join(s.app, "automagik-herdr", HOOKS_JOURNAL)), journal);
});

test("migrateHooks leaves and reports a file that isn't JSON, a linked file, a linked .claude and another hook shape", (t) => {
  const s = scratch(t);
  const bad = project(s.root, "bad");
  writeSettings(bad, `{ "hooks": ${JSON.stringify(legacyHookCommand(s.app))}, nope`);
  const linked = project(s.root, "linked");
  const real = join(s.root, "elsewhere.json");
  write(real, `${JSON.stringify(v020(s.app), null, 2)}\n`);
  mkdirSync(join(linked, ".claude"));
  symlinkSync(real, settings(linked));
  const dirLinked = project(s.root, "dir-linked");
  write(join(s.root, "shared-claude", "settings.local.json"), `${JSON.stringify(v020(s.app))}\n`);
  symlinkSync(join(s.root, "shared-claude"), join(dirLinked, ".claude"));
  const odd = project(s.root, "odd");
  writeSettings(odd, { hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: `node ${s.app}/mods/spaces-agents/briefing.mjs --quiet` }] }] } });
  const bytes = [settings(bad), real, join(s.root, "shared-claude", "settings.local.json"), settings(odd)].map(read);

  const r = migrateHooks([bad, linked, dirLinked, odd, join(s.root, "gone")], { appHome: s.app });
  assert.deepEqual(r.rewritten, []);
  assert.deepEqual(r.skipped.map((x) => x.file), [settings(bad), settings(linked), settings(dirLinked), settings(odd)]);
  assert.match(r.skipped[0].reason, /not valid JSON.*left as it is/);
  assert.match(r.skipped[1].reason, /a link/);
  assert.match(r.skipped[2].reason, /\.claude folder is a link/);
  assert.match(r.skipped[3].reason, /another shape/);
  assert.deepEqual([settings(bad), real, join(s.root, "shared-claude", "settings.local.json"), settings(odd)].map(read), bytes, "nothing written");
  assert.equal(readdirSync(join(bad, ".claude")).length, 1, "no backup of a file left alone");
  assert.equal(existsSync(join(s.app, "automagik-herdr", HOOKS_JOURNAL)), false);
});

test("a backup never replaces an earlier one", (t) => {
  const s = scratch(t);
  const proj = project(s.root, "proj");
  writeSettings(proj, v020(s.app));
  write(settings(proj) + BACKUP_SUFFIX, "earlier\n");
  const original = read(settings(proj));
  assert.deepEqual(migrateHooks([proj], { appHome: s.app }).rewritten, [settings(proj)]);
  assert.equal(read(settings(proj) + BACKUP_SUFFIX), "earlier\n");
  assert.equal(read(`${settings(proj)}${BACKUP_SUFFIX}-2`), original);
});

test("revertHooks edits only commands still holding the forward value, keeps what Claude Code wrote since, once", (t) => {
  const s = scratch(t);
  const kept = project(s.root, "kept");
  const changed = project(s.root, "changed");
  const fresh = project(s.root, "fresh");
  writeSettings(kept, v020(s.app));
  writeSettings(changed, v020(s.app));
  migrateHooks([kept, changed], { appHome: s.app });
  // Since the upgrade: Claude Code added a permission; the person pointed one hook elsewhere; a
  // new bot's Start wrote the entry point's command in a project the migration never saw.
  const k = readJson(settings(kept));
  k.permissions.allow.push("Bash(npm test)");
  writeSettings(kept, k);
  const c = readJson(settings(changed));
  c.hooks.UserPromptSubmit[1].hooks[0].command = commandFor("/mine/briefing.mjs");
  writeSettings(changed, c);
  writeSettings(fresh, { hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: hookCommand(s.app), timeout: 10 }] }] } });
  const changedBytes = read(settings(changed));

  const r = revertHooks([kept, changed, fresh], { appHome: s.app });
  assert.deepEqual(r.restored.sort(), [settings(fresh), settings(kept)].sort());
  assert.deepEqual(r.skipped.map((x) => x.file), [settings(changed)]);
  assert.match(r.skipped[0].reason, /^no longer r="[^"]*\/mods\/am-sidebar\/bin\/run\.sh"; .*: left as it is$/);
  assert.deepEqual(commands(settings(kept)), ["brain recall", legacyHookCommand(s.app)]);
  assert.deepEqual(readJson(settings(kept)).permissions.allow, ["Bash(git status)", "Bash(npm test)"]);
  assert.deepEqual(commands(settings(fresh)), [legacyHookCommand(s.app)]);
  assert.equal(read(settings(changed)), changedBytes);
  assert.ok(existsSync(settings(kept) + BACKUP_SUFFIX), "the backups stay");
  assert.deepEqual(readJson(join(s.app, "automagik-herdr", HOOKS_JOURNAL)).hooks, []);
  assert.deepEqual(revertHooks([kept, changed, fresh], { appHome: s.app }).restored, [], "a second revert does nothing");
});

test("discovery: an Attach in a subfolder, the ledger's and a pane's folders; never an unknown repo root, a nested repo or a link", (t) => {
  const s = scratch(t);
  const hook = { hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: legacyHookCommand(s.app), timeout: 10 }] }] } };
  // A repository whose bot was attached from a pane in packages/api (the same project key).
  const repo = project(s.root, "repo", "w1");
  const sub = join(repo, "packages", "api");
  writeSettings(sub, hook);
  // Deeper than the scan goes, but the ledger names it (a seat's folder), and a pane's folder elsewhere.
  const deep = join(repo, "a", "b", "c", "d", "e");
  writeSettings(deep, hook);
  write(join(s.app, "automagik-herdr", "workers.jsonl"), `${JSON.stringify({ event: "start", kind: "seat", worktree: deep })}\n{torn\n`);
  const pane = project(s.root, "pane-only");
  writeSettings(pane, hook);
  // Never entered: node_modules, a nested repository, a linked folder; a monorepo's root when only a subfolder is known.
  writeSettings(join(repo, "node_modules", "x"), hook);
  const nested = project(repo, "vendor/lib");
  writeSettings(nested, hook);
  writeSettings(join(s.root, "outside"), hook);
  symlinkSync(join(s.root, "outside"), join(repo, "linked"));
  const mono = project(s.root, "mono");
  writeSettings(mono, hook);
  mkdirSync(join(mono, "pkg", "a"), { recursive: true });
  const untouched = [join(repo, "node_modules", "x"), nested, join(s.root, "outside"), mono].map((d) => [d, read(settings(d))]);

  assert.deepEqual(ledgerFolders(s.app), [deep]);
  const r = migrateHooks([repo, join(mono, "pkg", "a")], { appHome: s.app, also: [...ledgerFolders(s.app), pane] });
  assert.deepEqual(r.rewritten.sort(), [settings(sub), settings(deep), settings(pane)].sort());
  for (const [dir, text] of untouched) assert.equal(read(settings(dir)), text, `${dir} left alone`);
  assert.deepEqual(revertHooks([repo, join(mono, "pkg", "a")], { appHome: s.app, also: [deep, pane] }).restored.sort(), r.rewritten.sort());
});

test("botPaneFolders: the folders of live, bot-labelled local panes; none when hc doesn't answer", () => {
  const answers = {
    "ls --json": { terminals: [{ address: "t1", state: "live" }, { address: "t2", state: "live" }, { address: "m1/t3", state: "live" }, { address: "t4", state: "exited" }] },
    "get t1 --json": { labels: { bot: "b-aaaaaaaaaa" }, cwd: "/p/sub" },
    "get t2 --json": { labels: {}, cwd: "/p/shell" },
  };
  const run = (cmd, args) => { const a = answers[args.join(" ")]; if (cmd !== "hc" || !a) throw new Error("no"); return JSON.stringify(a); };
  assert.deepEqual(botPaneFolders(run), ["/p/sub"]);
  assert.deepEqual(botPaneFolders(() => { throw new Error("no hc"); }), []);
});
test("botPaneFolders: the foreground's cwd wins over the pane's own (Attach writes the hook there)", () => {
  const answers = {
    "ls --json": { terminals: [{ address: "t1", state: "live", cwd: "/p/row" }] },
    "get t1 --json": { labels: { bot: "b-aaaaaaaaaa" }, cwd: "/p/shell", foreground: { cwd: "/p/attached" } },
  };
  const run = (cmd, args) => { const a = answers[args.join(" ")]; if (cmd !== "hc" || !a) throw new Error("no"); return JSON.stringify(a); };
  assert.deepEqual(botPaneFolders(run), ["/p/attached"]);
});

test("knownProjects: the sidebar's remembered projects (both keys) and the CLI's lists, this computer's only", (t) => {
  const s = scratch(t);
  write(join(s.app, "shared.json"), JSON.stringify({
    "am.sidebar.projects": [{ key: "/p/a" }, { key: "/p/remote", machine: "m1" }], "spaces-agents.projects": [{ key: "/p/b" }],
  }));
  write(join(s.app, "am-sidebar-projects.json"), JSON.stringify(["/p/c", "relative"]));
  write(join(s.app, "spaces-agents-projects.json"), JSON.stringify(["/p/a", "/p/d"]));
  assert.deepEqual(knownProjects(s.app, ["/p/open"]), ["/p/a", "/p/b", "/p/c", "/p/d", "/p/open"]);
});

// ---- the acceptance runs: the real pack copied into a scratch app home ----

const MAIN_ID = "b-aaaaaaaaaa";
/** A fake `hc` in sh: this terminal carries the main bot's label, and nothing else is running. */
const FAKE_HC = `#!/bin/sh
case "$1" in
  get) printf '%s' '{"address":"t1","labels":{"bot":"${MAIN_ID}"},"created_ms":1000,"parent":null,"foreground":{"argv":["claude"],"cwd":"/"},"status":{"app":"claude-code","state":"idle"}}' ;;
  ls) printf '%s' '{"machines":[],"terminals":[{"address":"t1","state":"live","status":"idle","parent":null}]}' ;;
  *) exit 1 ;;
esac
`;

/** An app home holding a copy of the pack's sidebar folder, a project with one Claude bot, and a fake hc. */
function botHome(t) {
  const s = scratch(t);
  cpSync(PACK, join(s.mods, "spaces-agents"), { recursive: true });
  const proj = project(s.root, "proj", "w1");
  write(join(proj, ".herdr", "bots.json"), JSON.stringify({
    version: 1, categories: [],
    bots: [{ id: MAIN_ID, name: "Genie", kind: "main", look: { character: "star", colour: "blue" }, role: "Runs the project", instructions: "", agent: "claude" }],
  }));
  write(join(s.app, "spaces-agents-projects.json"), JSON.stringify([proj]));
  writeSettings(proj, v020(s.app));
  const bin = join(s.root, "bin");
  write(join(bin, "hc"), FAKE_HC);
  chmodSync(join(bin, "hc"), 0o755);
  // Run once before any timing: macOS checks a new executable on its first run, which can take
  // longer than briefing.mjs's 1.5 s per call. The 2 s criterion is about the hook, not that check.
  execFileSync(join(bin, "hc"), ["ls"]);
  /** The hook as Claude Code runs it: `sh -c <command>` in the project, stdin the event, then closed. */
  const hook = (command, { input = "{}", appHome = true } = {}) => {
    const started = Date.now();
    const env = { PATH: `${bin}:${NODE_DIR}:/usr/bin:/bin`, HOME: s.root, HC_TERMINAL_ID: "t1", CLAUDE_PROJECT_DIR: proj };
    if (appHome) env.HERDR_APP_HOME = s.app;
    const r = spawnSync("sh", ["-c", command], { cwd: proj, input, encoding: "utf8", env });
    return { ...r, ms: Date.now() - started };
  };
  return { ...s, proj, worker: join(proj, ".claude", "worktrees", "w1"), hook };
}

test("acceptance: a v0.2.0 hook is moved and backed up; through the new command the block comes within 2 s", (t) => {
  const s = botHome(t);
  const original = read(settings(s.proj));
  const r = syncHooks({ modsDir: s.mods });
  assert.equal(r.direction, "forward");
  assert.deepEqual(r.rewritten, [settings(s.proj)]);
  assert.equal(read(stableBriefingPath(s.app)), read(join(PACK, "briefingEntry.mjs")), "the entry point is in place");
  assert.equal(read(settings(s.proj) + BACKUP_SUFFIX), original);
  const command = commands(settings(s.proj))[1];
  assert.equal(command, hookCommand(s.app));
  const run = s.hook(command);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^<herdr-bot>\n/, `${run.ms} ms, stderr: ${run.stderr}`);
  assert.match(run.stdout, /You are Genie, this project's main bot/);
  assert.equal(run.stderr, "");
  assert.ok(run.ms < 2000, `the block took ${run.ms} ms`);
  // As Claude Code runs it, with no HERDR_APP_HOME: the script finds its app home from its own
  // place, so the session it records lands in this scratch app home's ledger.
  const bare = s.hook(command, { appHome: false, input: JSON.stringify({ session_id: "s-1" }) });
  assert.match(bare.stdout, /You are Genie/);
  assert.match(read(ledgerPath(s.app)), /"session":"s-1"/);
});

test("acceptance: after a later folder rename (simulated), the same hook still runs; a rollback to v0.3 puts v0.3's path back", (t) => {
  const s = botHome(t);
  syncHooks({ modsDir: s.mods });
  const command = commands(settings(s.proj))[1];
  // Group 7's rename, simulated: the sidebar folder becomes am-sidebar; no settings file changes.
  renameSync(join(s.mods, "spaces-agents"), join(s.mods, "am-sidebar"));
  const run = s.hook(command);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /You are Genie/);
  assert.ok(run.ms < 2000, `the block took ${run.ms} ms`);
  // The old path is gone now: it would have printed nothing.
  assert.equal(s.hook(legacyHookCommand(s.app)).stdout, "");
  const again = syncHooks({ modsDir: s.mods });
  assert.deepEqual([again.direction, again.rewritten], ["forward", []], "nothing to move after the rename");

  // A rollback to a v0.3-shaped spaces-agents (no entry point of its own): the hooks go back.
  renameSync(join(s.mods, "am-sidebar"), join(s.mods, "spaces-agents"));
  rmSync(join(s.mods, "spaces-agents", "briefingEntry.mjs"));
  const back = syncHooks({ modsDir: s.mods });
  assert.equal(back.direction, "back");
  assert.deepEqual(back.restored, [settings(s.proj)]);
  assert.deepEqual(commands(settings(s.proj)), ["brain recall", legacyHookCommand(s.app)]);
  assert.deepEqual(readJson(settings(s.proj)).permissions, v020(s.app).permissions);
  assert.match(s.hook(legacyHookCommand(s.app)).stdout, /You are Genie/);
});

test("relink: the CLI link follows the sidebar folder; --version works through it; a file or another link stays", (t) => {
  const s = scratch(t);
  cpSync(PACK, join(s.mods, "am-sidebar"), { recursive: true });
  const bin = join(s.root, "home", ".local", "bin");
  mkdirSync(bin, { recursive: true });
  const link = join(bin, "automagik-herdr");
  symlinkSync(join(s.mods, "spaces-agents", "bin", "automagik-herdr.mjs"), link);
  const owned = new Set(["am-sidebar"]);
  assert.match(relink({ binDir: bin, modsDir: s.mods, owned }), /^linked /);
  // The folder ships the bin/automagik-herdr wrapper (it runs the .mjs through bin/run.sh): the link names it.
  assert.equal(readlinkSync(link), join(s.mods, "am-sidebar", "bin", "automagik-herdr"));
  const v = spawnSync(link, ["--version"], { encoding: "utf8", env: { PATH: `${NODE_DIR}:/usr/bin:/bin`, HOME: join(s.root, "home"), HERDR_APP_HOME: s.app } });
  assert.equal(v.status, 0, v.stderr);
  assert.equal(v.stdout, `automagik-herdr ${read(join(PACK, "VERSION")).trim()}\n`);
  assert.equal(relink({ binDir: bin, modsDir: s.mods, owned }), null, "already there");
  assert.deepEqual(readdirSync(bin), ["automagik-herdr"], "no temp name left");
  // Another link, a file, nothing: left as they are.
  rmSync(link);
  symlinkSync("/usr/bin/true", link);
  assert.equal(relink({ binDir: bin, modsDir: s.mods, owned }), null);
  assert.equal(readlinkSync(link), "/usr/bin/true");
  rmSync(link);
  write(link, "#!/bin/sh\necho mine\n");
  assert.match(relink({ binDir: bin, modsDir: s.mods, owned }), /left .* alone: it is a file, not a link/);
  assert.equal(read(link), "#!/bin/sh\necho mine\n");
  rmSync(link);
  assert.equal(relink({ binDir: bin, modsDir: s.mods, owned }), null);
  assert.equal(existsSync(link), false);
});

/** The pack's sidebar folder as an am-sidebar release tarball (PACK_MODS overridden), at `version`. */
function amSidebarPack(root, version) {
  const tree = join(root, `pack-${version}`);
  const dir = join(tree, "am-sidebar");
  cpSync(PACK, dir, { recursive: true });
  renameSync(join(dir, "release.js"), join(dir, "releaseFull.js"));
  write(join(dir, "release.js"), 'export * from "./releaseFull.js";\nexport const PACK_MODS = ["am-sidebar"];\n');
  write(join(dir, "VERSION"), `${version}\n`);
  const out = join(root, `automagik-herdr-pack-${version}.tgz`);
  execFileSync("tar", ["-czf", out, "-C", tree, "am-sidebar"], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  return out;
}

test("update.mjs: install across the rename moves the hooks; rollback to v0.3 puts them and the CLI link back; pocket-link untouched", (t) => {
  const s = botHome(t);
  // v0.3-shaped: spaces-agents with no entry point, the record listing it, the CLI linked to it.
  rmSync(join(s.mods, "spaces-agents", "briefingEntry.mjs"));
  write(join(s.app, "automagik-herdr", "installed-by-install.sh"), "version=0.3.0\nmods=spaces-agents\nbefore=none\n");
  write(join(s.mods, "pocket-link", ".state", "pairing.key"), "secret\n");
  writeSettings(s.worker, { hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: legacyHookCommand(s.app), timeout: 10 }] }] } });
  const home = join(s.root, "home");
  const bin = join(home, ".local", "bin");
  mkdirSync(bin, { recursive: true });
  const link = join(bin, "automagik-herdr");
  const env = { HOME: home, PATH: `${NODE_DIR}:/usr/bin:/bin`, AUTOMAGIK_HERDR_NO_UPDATE: "1" };
  const cli = (...args) => spawnSync(process.execPath, [UPDATE, ...args, "--mods", s.mods], { env, encoding: "utf8" });

  const tgz = amSidebarPack(s.root, "9.9.9");
  const installed = cli("install", "--from", tgz, "--version", "9.9.9");
  assert.equal(installed.status, 0, installed.stderr);
  assert.ok(existsSync(join(s.mods, "am-sidebar", "briefing.mjs")) && !existsSync(join(s.mods, "spaces-agents")));
  assert.deepEqual(commands(settings(s.proj)), ["brain recall", hookCommand(s.app)]);
  assert.deepEqual(commands(settings(s.worker)), [hookCommand(s.app)], "the worker's worktree too");
  // The notice, last: each rewritten file with its project, running sessions, unknown projects.
  const said = installed.stderr.split("\n").filter((l) => l.startsWith("notice: ")).map((l) => l.slice(8));
  assert.match(said[0], /^IMPORTANT: the bots' briefing hook moved to a new path in 2 settings files:$/);
  for (const dir of [s.proj, s.worker]) assert.ok(said.includes(`  ${dir}: ${settings(dir)}`), `${dir} is listed: ${said.join("\n")}`);
  assert.ok(said.some((l) => /keeps the OLD hook and gets NO briefing until it is restarted, or until \/hooks is run in it once/.test(l)));
  assert.ok(said.some((l) => /not rewritten .*automagik-herdr start <bot>.*automagik-herdr attach <bot>/.test(l)));
  assert.ok(installed.stderr.trimEnd().endsWith(said.at(-1)), "the notice is the last thing logged");
  const viaEntry = s.hook(hookCommand(s.app));
  assert.match(viaEntry.stdout, /You are Genie/, `the hook runs am-sidebar's briefing (${viaEntry.ms} ms, stderr: ${viaEntry.stderr})`);

  // install.sh would link the CLI to am-sidebar's wrapper; the rollback points it back.
  symlinkSync(join(s.mods, "am-sidebar", "bin", "automagik-herdr"), link);
  const back = cli("rollback");
  assert.equal(back.status, 0, back.stderr);
  assert.match(back.stderr, /^notice: IMPORTANT: the bots' briefing hook went back to the older release's path in 2 settings files:$/m);
  assert.match(back.stderr, /^notice: A Claude session already running in those projects keeps the hook it loaded/m);
  assert.ok(existsSync(join(s.mods, "spaces-agents", "briefing.mjs")) && !existsSync(join(s.mods, "am-sidebar")));
  assert.deepEqual(commands(settings(s.proj)), ["brain recall", legacyHookCommand(s.app)]);
  assert.deepEqual(commands(settings(s.worker)), [legacyHookCommand(s.app)]);
  assert.deepEqual(readJson(settings(s.proj)).permissions, v020(s.app).permissions);
  // The kept spaces-agents (this checkout's) ships the wrapper too: the link names it.
  assert.equal(readlinkSync(link), join(s.mods, "spaces-agents", "bin", "automagik-herdr"));
  const v = spawnSync(link, ["--version"], { encoding: "utf8", env: { PATH: `${NODE_DIR}:/usr/bin:/bin`, HOME: home, HERDR_APP_HOME: s.app } });
  assert.equal(v.status, 0, v.stderr);
  assert.match(v.stdout, /^automagik-herdr \d+\.\d+\.\d+\n$/);
  assert.equal(read(join(s.mods, "pocket-link", ".state", "pairing.key")), "secret\n");
  assert.deepEqual(readdirSync(join(s.mods, "pocket-link")), [".state"]);
});

test("revertHooks: a direct hook (written with no entry point to place) goes back to v0.3's path too", (t) => {
  const s = scratch(t);
  const proj = project(s.root, "direct");
  writeSettings(proj, { permissions: { allow: ["Edit"] }, hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: directHookCommand(s.app), timeout: 10 }] }] } });
  assert.match(directHookCommand(s.app), /\/mods\/am-sidebar\/briefing\.mjs"$/);
  const r = revertHooks([proj], { appHome: s.app });
  assert.deepEqual(r.restored, [settings(proj)]);
  assert.deepEqual(commands(settings(proj)), [legacyHookCommand(s.app)]);
  assert.deepEqual(readJson(settings(proj)).permissions, { allow: ["Edit"] });
  assert.deepEqual(revertHooks([proj], { appHome: s.app }).restored, [], "nothing the second time");
});

test("hooksNotice: every file with its project, the running sessions, unknown projects; nothing when nothing moved", () => {
  const files = ["/p/a/.claude/settings.local.json", "/p/b/sub/.claude/settings.local.json"];
  const forward = hooksNotice({ direction: "forward", rewritten: files, skipped: [] });
  assert.deepEqual(forward.slice(0, 3), ["IMPORTANT: the bots' briefing hook moved to a new path in 2 settings files:",
    `  /p/a: ${files[0]}`, `  /p/b/sub: ${files[1]}`]);
  assert.match(forward[3], /running .* keeps the OLD hook and gets NO briefing until it is restarted, or until \/hooks is run in it once\.$/);
  assert.match(forward[4], /^Projects the pack doesn't know about were not rewritten/);
  const back = hooksNotice({ direction: "back", restored: [files[0]], skipped: [] });
  assert.equal(back[0], "IMPORTANT: the bots' briefing hook went back to the older release's path in 1 settings file:");
  assert.equal(back.length, 3, "no unknown-projects line on the way back");
  for (const none of [null, undefined, { direction: null, skipped: [] }, { direction: "forward", rewritten: [], skipped: [] },
    { direction: "back", restored: [], skipped: [], crossed: true }]) assert.deepEqual(hooksNotice(none), []);
  // Across the rename with nothing rewritten: still the warning, and both lines.
  const silent = hooksNotice({ direction: "forward", rewritten: [], skipped: [], crossed: true });
  assert.equal(silent.length, 3);
  assert.match(silent[0], /^IMPORTANT: the sidebar moved to a new folder, and no settings file's briefing hook was rewritten/);
  assert.match(silent[1], /a bot's project keeps the OLD hook and gets NO briefing/);
  assert.match(silent[2], /^Projects the pack doesn't know about were not rewritten/);
});
