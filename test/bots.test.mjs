// bots.js over a stand-in `herdr` module (herdr-stub.mjs) and real scratch repositories:
// discovery keys worktree spaces to one project, writes land in the main checkout only,
// and a remembered project is forgotten on a null read, never on a rejected one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const stubUrl = new URL("./herdr-stub.mjs", import.meta.url).href;
registerHooks({
  resolve: (specifier, context, next) => (specifier === "herdr" ? { url: stubUrl, shortCircuit: true } : next(specifier, context)),
});
const { state } = await import(stubUrl);
const { discoverProjects, writeBots, rememberProject } = await import("../mods/spaces-agents/bots.js");

const run = promisify(execFile);
const ID = { main: "b-aaaaaaaaaa", dev: "b-cccccccccc" };
const bot = (id, kind) => ({ id, name: id.slice(2, 5), kind, look: { character: "star", colour: "blue" }, role: "r", instructions: "i", agent: "claude" });
const sample = () => ({ version: 1, categories: [], bots: [bot(ID.main, "main"), bot(ID.dev, "member")] });

async function repo(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "herdr-bots-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const main = join(root, "proj");
  mkdirSync(main);
  await run("git", ["init", "-q", main]);
  await run("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init"], { cwd: main });
  const tree = join(root, "proj-wt");
  await run("git", ["worktree", "add", "-q", "-b", "wt", tree], { cwd: main });
  return { root, main, tree };
}
function reset() {
  state.spaces = [];
  state.shared = new Map();
  state.setSharedCalls = 0;
  state.offline = new Set();
}

test("writeBots from a worktree's key writes the main checkout only, and remembers it", async (t) => {
  reset();
  const { main, tree } = await repo(t);
  const { keyOf } = await import("../mods/spaces-agents/bots.js");
  const key = await keyOf(tree);
  assert.equal(key, main);
  await writeBots(key, sample(), null);
  assert.ok(existsSync(join(main, ".herdr", "bots.json")));
  assert.equal(existsSync(join(tree, ".herdr")), false);
  assert.deepEqual(JSON.parse(readFileSync(join(main, ".herdr", "bots.json"), "utf8")), sample());
  assert.deepEqual(state.shared.get("spaces-agents.projects"), [{ key: main, machine: null }]);
  // Writing again with a stale snapshot rejects instead of losing an edit.
  await assert.rejects(writeBots(key, sample(), null), /stale/);
  // A file checkBots faults is refused before any write.
  const two = sample();
  two.bots[1].kind = "main";
  await assert.rejects(writeBots(key, two), /exactly one/);
});

test("discoverProjects: a project open as two spaces (checkout and worktree) comes back once", async (t) => {
  reset();
  const { main, tree } = await repo(t);
  mkdirSync(join(main, ".herdr"));
  writeFileSync(join(main, ".herdr", "bots.json"), JSON.stringify(sample()));
  state.spaces = [{ id: "s1", folder: main, machine: null }, { id: "s2", folder: tree, machine: null }];
  const found = await discoverProjects();
  assert.equal(found.length, 1);
  assert.equal(found[0].key, main);
  assert.deepEqual(found[0].spaces, ["s1", "s2"]);
  assert.equal(found[0].file.bots.length, 2);
  assert.deepEqual(found[0].warnings, []);
});

test("discoverProjects: a remembered project with no space is found; forgotten only on a null read", async (t) => {
  reset();
  const { main } = await repo(t);
  mkdirSync(join(main, ".herdr"));
  writeFileSync(join(main, ".herdr", "bots.json"), JSON.stringify(sample()));
  rememberProject(main, null);
  rememberProject(main, null);
  assert.equal(state.setSharedCalls, 1);
  rememberProject(main, "far");
  assert.equal((await discoverProjects()).length, 2);
  // "far" unreachable: its read rejects, it stays remembered and keeps its last good read.
  state.offline.add("far");
  const away = await discoverProjects();
  assert.equal(away.length, 2);
  assert.equal(state.shared.get("spaces-agents.projects").length, 2);
  // The file gone (read returns null): forgotten here, and still remembered for "far".
  state.offline.clear();
  state.offline.add("far");
  unlinkSync(join(main, ".herdr", "bots.json"));
  const gone = await discoverProjects();
  assert.deepEqual(gone.map((p) => p.machine), ["far"]);
  assert.deepEqual(state.shared.get("spaces-agents.projects"), [{ key: main, machine: "far" }]);
});
