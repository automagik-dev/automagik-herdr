// bots.js over stand-ins for Herdr's `herdr` and `fs/promises` modules (herdr-stub.mjs,
// fs-stub.mjs) and real scratch repositories: discovery keys worktree spaces to one project,
// writes land in the main checkout only, another machine is asked with `on`, and a
// remembered project is forgotten on a null read, never on a rejected one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { state } from "./use-stubs.mjs";
import { PROJECTS_FILE } from "../mods/spaces-agents/model.js";
const { discoverProjects, writeBots, rememberProject, keyOf } = await import("../mods/spaces-agents/bots.js");

const run = promisify(execFile);
const ID = { main: "b-aaaaaaaaaa", dev: "b-cccccccccc" };
const bot = (id, kind) => ({ id, name: id.slice(2, 5), kind, look: { character: "star", colour: "blue" }, role: "r", instructions: "i", agent: "claude" });
const sample = () => ({ version: 1, categories: [], bots: [bot(ID.main, "main"), bot(ID.dev, "member")] });

function scratch(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "automagik-herdr-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
async function repo(t) {
  const root = scratch(t);
  const main = join(root, "proj");
  mkdirSync(main);
  await run("git", ["init", "-q", main]);
  await run("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init"], { cwd: main });
  const tree = join(root, "proj-wt");
  await run("git", ["worktree", "add", "-q", "-b", "wt", tree], { cwd: main });
  return { root, main, tree };
}
const put = (dir, file) => { mkdirSync(join(dir, ".herdr"), { recursive: true }); writeFileSync(join(dir, ".herdr", "bots.json"), typeof file === "string" ? file : JSON.stringify(file)); };
function reset() {
  Object.assign(state, { spaces: [], shared: new Map(), setSharedCalls: 0, offline: new Set(), calls: [] });
}

test("writeBots from a worktree's key writes the main checkout only, and remembers it", async (t) => {
  reset();
  const { main, tree } = await repo(t);
  const key = await keyOf(tree);
  assert.equal(key, main);
  await writeBots(key, sample(), null);
  assert.equal(existsSync(join(tree, ".herdr")), false);
  const written = readFileSync(join(main, ".herdr", "bots.json"), "utf8");
  assert.deepEqual(JSON.parse(written), sample());
  assert.deepEqual(state.shared.get("spaces-agents.projects"), [{ key: main, machine: null }]);
  // The snapshot is required, and a stale one rejects instead of losing an edit.
  await assert.rejects(writeBots(key, sample()), /text the edit started from/);
  await assert.rejects(writeBots(key, sample(), null), /stale/);
  await writeBots(key, sample(), written);
  // A file checkBots faults is refused before any write.
  const two = sample();
  two.bots[1].kind = "main";
  await assert.rejects(writeBots(key, two, written), /exactly one/);
});

test("discoverProjects: a project open as two spaces (checkout and worktree) comes back once", async (t) => {
  reset();
  const { main, tree } = await repo(t);
  put(main, sample());
  state.spaces = [{ id: "s1", folder: main, machine: null }, { id: "s2", folder: tree, machine: null }];
  const found = await discoverProjects();
  assert.equal(found.length, 1);
  assert.equal(found[0].key, main);
  assert.deepEqual(found[0].spaces, ["s1", "s2"]);
  assert.equal(found[0].file.bots.length, 2);
  assert.deepEqual(found[0].warnings, []);
});

test("discoverProjects: outside git, a local space finds the bots.json above it", async (t) => {
  reset();
  const root = scratch(t);
  mkdirSync(join(root, "a", "b"), { recursive: true });
  put(join(root, "a"), sample());
  state.spaces = [{ id: "s1", folder: join(root, "a", "b"), machine: null }];
  const found = await discoverProjects();
  assert.deepEqual(found.map((p) => p.key), [join(root, "a")]);
});

test("discoverProjects: an open space on another machine is asked there, with on", async (t) => {
  reset();
  const root = scratch(t);
  mkdirSync(join(root, "srv", "app"), { recursive: true });
  put(join(root, "srv"), sample());
  state.spaces = [{ id: "r1", folder: join(root, "srv", "app"), machine: "far" }];
  const found = await discoverProjects();
  assert.deepEqual(found.map((p) => [p.key, p.machine]), [[join(root, "srv"), "far"]]);
  const git = state.calls.filter((c) => c.kind === "exec" && c.command === "git");
  // Every read but this computer's own app home (the CLI's project list) goes to "far".
  const reads = state.calls.filter((c) => c.kind === "read" && !c.path.startsWith(`${state.appHome}/`));
  assert.ok(git.length >= 1);
  assert.ok(reads.some((c) => c.path === join(root, "srv", ".herdr", "bots.json")));
  for (const c of [...git, ...reads]) assert.equal(c.on, "far", JSON.stringify(c));
});

test("discoverProjects: a machine away keeps its known key, and is skipped when never keyed", async (t) => {
  reset();
  const { main, tree } = await repo(t);
  put(main, sample());
  put(tree, { ...sample(), bots: [] }); // a worktree's committed copy: never read
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  state.offline.add("away");
  state.spaces = [{ id: "r1", folder: tree, machine: "away" }];
  assert.deepEqual(await discoverProjects(), []);
  state.offline.clear();
  const seen = await discoverProjects();
  assert.deepEqual(seen.map((p) => [p.key, p.file.bots.length]), [[main, 2]]);
  // Away again, with the cached key a minute old: git rejects, the key holds (no flip to
  // the worktree folder, whose bots.json is never read), and the rejected read keeps the
  // last good definitions.
  t.mock.timers.tick(61_000);
  state.offline.add("away");
  state.calls = [];
  const later = await discoverProjects();
  assert.deepEqual(later.map((p) => [p.key, p.file.bots.length]), [[main, 2]]);
  assert.ok(state.calls.some((c) => c.command === "git"), "the key was asked again");
  assert.ok(!state.calls.some((c) => c.kind === "read" && c.path.startsWith(tree)));
});

test("discoverProjects: a file that doesn't parse on its first read shows with the reason", async (t) => {
  reset();
  const { main } = await repo(t);
  put(main, "{ not json");
  state.spaces = [{ id: "s1", folder: main, machine: null }];
  const [p] = await discoverProjects();
  assert.deepEqual(p.file.bots, []);
  assert.equal(p.warnings.length, 1);
  assert.match(p.warnings[0], /bots\.json/);
});

test("discoverProjects: a remembered project with no space is found; forgotten only on a null read", async (t) => {
  reset();
  const { main } = await repo(t);
  put(main, sample());
  rememberProject(main, null);
  rememberProject(main, null);
  assert.equal(state.setSharedCalls, 1);
  rememberProject(main, "far");
  assert.equal((await discoverProjects()).length, 2);
  // "far" unreachable: its read rejects, it stays remembered and keeps its last good read.
  state.offline.add("far");
  assert.equal((await discoverProjects()).length, 2);
  assert.equal(state.shared.get("spaces-agents.projects").length, 2);
  // The file gone (read returns null): forgotten here, and still remembered for "far".
  unlinkSync(join(main, ".herdr", "bots.json"));
  const gone = await discoverProjects();
  assert.deepEqual(gone.map((p) => p.machine), ["far"]);
  assert.deepEqual(state.shared.get("spaces-agents.projects"), [{ key: main, machine: "far" }]);
});

test("discoverProjects: the CLI's project list is found with no space; a gone one is hidden, the list left alone", async (t) => {
  reset();
  const { root, main, tree } = await repo(t);
  put(main, sample());
  const app = join(root, "app");
  mkdirSync(app);
  const list = join(app, PROJECTS_FILE);
  const text = JSON.stringify([main, join(root, "gone"), 7, "relative"]);
  writeFileSync(list, text);
  const appHome = state.appHome;
  state.appHome = app;
  t.after(() => { state.appHome = appHome; });
  // Listed, and also open as a worktree space: one entry, under that space.
  state.spaces = [{ id: "s1", folder: tree }];
  const found = await discoverProjects();
  assert.deepEqual(found.map((p) => [p.key, p.spaces]), [[main, ["s1"]]]);
  state.spaces = [];
  assert.deepEqual((await discoverProjects()).map((p) => [p.key, p.spaces]), [[main, []]]);
  // Its file gone: not shown; the CLI's file untouched and nothing remembered or forgotten.
  unlinkSync(join(main, ".herdr", "bots.json"));
  assert.deepEqual(await discoverProjects(), []);
  assert.equal(readFileSync(list, "utf8"), text);
  assert.equal(state.setSharedCalls, 0);
  // A list that doesn't parse lists nothing.
  put(main, sample());
  writeFileSync(list, "{nope");
  assert.deepEqual(await discoverProjects(), []);
});
