// The hook scan never walks the home folder (Group 6b review): a project rooted at $HOME, at / or at
// an ancestor of $HOME is read at its own .claude only, so macOS's protected folders (Desktop,
// Documents, Downloads, Library…) are never opened; a normal repository is still scanned in depth,
// minus those folder names and dot-folders. A scratch HOME only; fs calls are recorded by a spy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs, { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { homedir, tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { hookCommand, legacyHookCommand } from "../mods/am-sidebar/briefingText.mjs";
import { foldersOf, migrateHooks } from "../mods/am-sidebar/migrateHooks.mjs";

process.env.GIT_CONFIG_GLOBAL = "/dev/null";
const REAL_HOME = realpathSync(homedir());
const PROTECTED = ["Desktop", "Documents", "Downloads", "Library"];
const settings = (dir) => join(dir, ".claude", "settings.local.json");
const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
const hook = (app) => `${JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: legacyHookCommand(app) }] }] } }, null, 2)}\n`;
const under = (path, dir) => path === dir || path.startsWith(dir + sep);
const reals = (list) => list.map((f) => realpathSync(f));

/** A scratch root holding Users/me as $HOME (restored after), each protected folder seeded with a .claude. */
function scratchHome(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "am-homescan-")));
  const before = process.env.HOME;
  t.after(() => { process.env.HOME = before; rmSync(root, { recursive: true, force: true }); });
  const home = join(root, "Users", "me");
  const app = join(root, "app");
  mkdirSync(app, { recursive: true });
  write(settings(home), hook(app));
  for (const name of PROTECTED) write(settings(join(home, name, "proj")), hook(app));
  write(settings(join(home, "Library", "Mobile Documents", "proj")), hook(app));
  write(settings(join(home, "code", "app")), hook(app));
  process.env.HOME = home;
  return { root, home, app };
}

/** Every path readdirSync, lstatSync and statSync are called with while `fn` runs. */
function recording(t, fn) {
  const calls = { readdir: [], stat: [] };
  const orig = { readdirSync: fs.readdirSync, lstatSync: fs.lstatSync, statSync: fs.statSync };
  fs.readdirSync = (p, ...rest) => { calls.readdir.push(String(p)); return orig.readdirSync(p, ...rest); };
  fs.lstatSync = (p, ...rest) => { calls.stat.push(String(p)); return orig.lstatSync(p, ...rest); };
  fs.statSync = (p, ...rest) => { calls.stat.push(String(p)); return orig.statSync(p, ...rest); };
  syncBuiltinESMExports();
  try { return { result: fn(), calls }; } finally { Object.assign(fs, orig); syncBuiltinESMExports(); }
}

function assertUntouched(calls, home) {
  for (const p of calls.readdir) {
    assert.ok(!under(p, home), `no folder at or under HOME is listed: ${p}`);
    assert.ok(!under(p, REAL_HOME), `the real home is never listed: ${p}`);
  }
  for (const p of [...calls.readdir, ...calls.stat]) {
    for (const name of PROTECTED) assert.ok(!under(p, join(home, name)), `${name} is never opened: ${p}`);
  }
}

test("a project rooted at $HOME: only its own .claude is read and moved; Desktop, Documents, Downloads, Library never opened", (t) => {
  const s = scratchHome(t);
  const { result, calls } = recording(t, () => ({ folders: foldersOf([s.home]), moved: migrateHooks([s.home], { appHome: s.app }) }));
  assert.deepEqual(reals(result.folders), [s.home]);
  assert.deepEqual(result.moved.rewritten, [settings(s.home)]);
  assert.equal(JSON.parse(readFileSync(settings(s.home), "utf8")).hooks.UserPromptSubmit[0].hooks[0].command, hookCommand(s.app));
  for (const name of PROTECTED) assert.equal(readFileSync(settings(join(s.home, name, "proj")), "utf8"), hook(s.app), `${name}'s hook stays`);
  assert.equal(readFileSync(settings(join(s.home, "code", "app")), "utf8"), hook(s.app), "no subfolder of HOME is walked");
  assertUntouched(calls, s.home);
});

test("/ and an ancestor of $HOME behave like $HOME: never walked", (t) => {
  const s = scratchHome(t);
  const users = join(s.root, "Users");
  write(settings(users), hook(s.app));
  const { result, calls } = recording(t, () => ({ ancestor: foldersOf([users]), slash: foldersOf(["/"]) }));
  assert.deepEqual(reals(result.ancestor), [users], "the ancestor's own .claude only");
  assert.deepEqual(result.slash, [], "/ is never a project");
  assert.ok(!calls.readdir.some((p) => under(p, users)), `nothing under the ancestor is listed: ${calls.readdir}`);
  assert.ok(!calls.readdir.includes("/"), "/ is never listed");
  assertUntouched(calls, s.home);
});

test("a repo-rooted project still finds its hooks at depth; protected names and dot-folders are not entered", (t) => {
  const s = scratchHome(t);
  const repo = join(s.root, "repo");
  mkdirSync(repo);
  execFileSync("git", ["init", "-q", repo], { stdio: "pipe" });
  const deep = join(repo, "a", "b", "c", "d");
  for (const dir of [deep, join(repo, "a", "b", "c", "d", "e"), join(repo, "Documents"), join(repo, "Library", "x"), join(repo, ".hidden")]) {
    write(settings(dir), hook(s.app));
  }
  // A sibling whose name merely starts with HOME's is no ancestor: walked as usual.
  const sibling = join(s.root, "Users", "me-old");
  write(settings(join(sibling, "sub")), hook(s.app));
  const { result, calls } = recording(t, () => ({ repo: foldersOf([repo]), sibling: foldersOf([sibling]) }));
  assert.deepEqual(reals(result.repo), [repo, deep], "depth 4 found, depth 5 still past the limit");
  assert.deepEqual(reals(result.sibling), [sibling, join(sibling, "sub")]);
  assert.ok(calls.readdir.some((p) => under(p, join(repo, "a"))), "the repo is walked");
  for (const name of ["Documents", "Library", ".hidden"]) {
    assert.ok(!calls.readdir.some((p) => under(p, join(repo, name))), `${name} is not entered`);
  }
  assertUntouched(calls, s.home);
});
