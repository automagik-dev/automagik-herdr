import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  BOT_LABEL, MAX_INSTRUCTIONS, CHARACTERS, COLOURS, projectKeyOf, parseBots, checkBots, effectiveLead, newBotId, defaultLook,
} from "../mods/spaces-agents/model.js";

const run = promisify(execFile);
// What bots.js hands projectKeyOf, over Node instead of Herdr's exec.
const git = async (args, cwd) => {
  try { return (await run("git", args, { cwd })).stdout; } catch { return null; }
};
const exists = async (path) => existsSync(path);
const noGit = async () => null;
// No git installed: the adapter answers null, as bots.js does for a program that can't start.
const missingGit = async (args, cwd) => {
  try { return (await run("no-such-git-here", args, { cwd })).stdout; } catch { return null; }
};
const unreachable = async () => { throw new Error("machine unreachable"); };

// A scratch repository with one commit, a worktree and a subfolder, under $TMPDIR
// (realpath: on macOS /var/folders is /private/var/folders, and git answers with the real one).
function scratch(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "herdr-bots-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
async function repo(t) {
  const root = scratch(t);
  const main = join(root, "proj");
  mkdirSync(join(main, "src", "deep"), { recursive: true });
  await run("git", ["init", "-q", main]);
  await run("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init"], { cwd: main });
  const tree = join(root, "proj-wt");
  await run("git", ["worktree", "add", "-q", "-b", "wt", tree], { cwd: main });
  return { root, main, tree };
}

test("project key: a main checkout is its own project", async (t) => {
  const { main } = await repo(t);
  assert.equal(await projectKeyOf(main, git, exists), main);
  assert.equal(await projectKeyOf(`${main}/`, git, exists), main);
});

test("project key: a worktree belongs to its main checkout", async (t) => {
  const { main, tree } = await repo(t);
  assert.equal(await projectKeyOf(tree, git, exists), main);
});

test("project key: a subfolder belongs to its main checkout", async (t) => {
  const { main } = await repo(t);
  assert.equal(await projectKeyOf(join(main, "src", "deep"), git, exists), main);
});

test("project key: a worktree's committed bots.json is not its project", async (t) => {
  const { main, tree } = await repo(t);
  mkdirSync(join(tree, ".herdr"));
  writeFileSync(join(tree, ".herdr", "bots.json"), "{}");
  assert.equal(await projectKeyOf(tree, git, exists), main);
});

test("project key: outside git, the nearest folder holding .herdr/bots.json", async (t) => {
  const root = scratch(t);
  const deep = join(root, "a", "b", "c");
  mkdirSync(deep, { recursive: true });
  mkdirSync(join(root, "a", ".herdr"));
  writeFileSync(join(root, "a", ".herdr", "bots.json"), "{}");
  assert.equal(await projectKeyOf(deep, git, exists), join(root, "a"));
  assert.equal(await projectKeyOf(join(root, "a"), git, exists), join(root, "a"));
});

test("project key: outside git with no bots.json above, the folder itself", async (t) => {
  const root = scratch(t);
  const deep = join(root, "x", "y");
  mkdirSync(deep, { recursive: true });
  assert.equal(await projectKeyOf(deep, git, exists), deep);
});

test("project key: git missing or failing reads as outside git", async (t) => {
  const { main } = await repo(t);
  const sub = join(main, "src", "deep");
  // Inside a real repository, but git can't answer: the folder rule applies.
  assert.equal(await projectKeyOf(sub, noGit, exists), sub);
  assert.equal(await projectKeyOf(sub, missingGit, exists), sub);
  mkdirSync(join(main, ".herdr"));
  writeFileSync(join(main, ".herdr", "bots.json"), "{}");
  assert.equal(await projectKeyOf(sub, missingGit, exists), main);
});

test("project key: a machine that can't be asked rejects, never guessing outside git", async () => {
  await assert.rejects(projectKeyOf("/srv/app-wt", unreachable, async () => false), /unreachable/);
  await assert.rejects(projectKeyOf("/srv/app-wt", noGit, unreachable), /unreachable/);
});

test("project key: injected git and exists, as on a remote machine", async () => {
  const calls = [];
  const fakeGit = async (args, cwd) => { calls.push([args.join(" "), cwd]); return "/srv/app/.git\n"; };
  assert.equal(await projectKeyOf("/srv/app-wt/lib", fakeGit, async () => false), "/srv/app");
  assert.deepEqual(calls, [["rev-parse --path-format=absolute --git-common-dir", "/srv/app-wt/lib"]]);
  const seen = [];
  const fakeExists = async (p) => { seen.push(p); return p === "/srv/.herdr/bots.json"; };
  assert.equal(await projectKeyOf("/srv/x/y", noGit, fakeExists), "/srv");
  assert.deepEqual(seen, ["/srv/x/y/.herdr/bots.json", "/srv/x/.herdr/bots.json", "/srv/.herdr/bots.json"]);
  assert.equal(await projectKeyOf("/nowhere/z", noGit, async () => false), "/nowhere/z");
});

// A valid file to vary.
const ID = { main: "b-aaaaaaaaaa", cap: "b-bbbbbbbbbb", dev: "b-cccccccccc", tst: "b-dddddddddd", plan: "b-eeeeeeeeee" };
const bot = (id, kind, extra = {}) => ({
  id, name: id.slice(2, 5), kind, look: { character: "star", colour: "blue" }, role: "r", instructions: "i", agent: "claude", ...extra,
});
function sample(edit = (f) => f) {
  return edit({
    version: 1,
    categories: [{ id: "eng", title: "Engineering", sub: "build it" }],
    bots: [
      bot(ID.main, "main"),
      bot(ID.cap, "member", { category: "eng" }),
      bot(ID.dev, "member", { lead: ID.cap }),
      bot(ID.tst, "member", { lead: ID.cap, model: "GPT-6.1 Sol" }),
      bot(ID.plan, "member", { agent: undefined, planned: { wave: 3, note: "waits for auth v2" } }),
    ],
  });
}
const text = (f) => JSON.stringify(f);

test("schema: a valid file parses with no warnings and checks clean", () => {
  const { file, warnings } = parseBots(text(sample()));
  assert.deepEqual(warnings, []);
  assert.equal(file.bots.length, 5);
  assert.equal(file.categories[0].sub, "build it");
  assert.deepEqual(file.bots[4].planned, { wave: 3, note: "waits for auth v2" });
  assert.deepEqual(checkBots(file), []);
});

test("schema: raw is the file as read, entries left out of file included, and a separate copy", () => {
  const source = sample((f) => { f.bots.push({ name: "nobody", kind: "member" }); f.categories.push({ title: "no id" }); return f; });
  const { file, raw } = parseBots(text(source));
  assert.equal(file.bots.length, 5);
  assert.deepEqual(raw, JSON.parse(text(source)));
  raw.bots[0].look.colour = "red";
  assert.equal(file.bots[0].look.colour, "blue");
});

test("schema: not a version-1 file throws", () => {
  assert.throws(() => parseBots("not json"));
  assert.throws(() => parseBots(text({ version: 2, bots: [] })), /version/);
  assert.throws(() => parseBots(text({ version: 1 })), /bots/);
});

test("schema: instructions over 4,000 characters warn and fail the write check", () => {
  const long = "x".repeat(MAX_INSTRUCTIONS + 1);
  const { file, warnings } = parseBots(text(sample((f) => { f.bots[1].instructions = long; return f; })));
  assert.equal(file.bots.length, 5);
  assert.ok(warnings.some((w) => w.startsWith(ID.cap) && /4000/.test(w)), warnings.join("\n"));
  assert.ok(checkBots(file).some((e) => /4000/.test(e)));
  const ok = parseBots(text(sample((f) => { f.bots[1].instructions = "x".repeat(MAX_INSTRUCTIONS); return f; })));
  assert.deepEqual(ok.warnings, []);
});

test("schema: an unknown kind is left out with a warning", () => {
  const { file, warnings } = parseBots(text(sample((f) => { f.bots[3].kind = "helper"; return f; })));
  assert.equal(file.bots.some((b) => b.id === ID.tst), false);
  assert.ok(warnings.some((w) => w.includes(ID.tst) && /unknown kind/.test(w)));
  assert.ok(checkBots({ ...file, bots: [...file.bots, bot("b-ffffffffff", "helper")] }).some((e) => /unknown kind/.test(e)));
});

test("schema: two main bots warn, the first counts, the write check refuses", () => {
  const { file, warnings } = parseBots(text(sample((f) => { f.bots.push(bot("b-ffffffffff", "main")); return f; })));
  assert.ok(warnings.some((w) => /2 main bots/.test(w) && w.includes(ID.main)));
  assert.equal(effectiveLead(file, ID.cap).lead, ID.main);
  assert.ok(checkBots(file).some((e) => /exactly one/.test(e)));
});

test("schema: no main bot warns", () => {
  const { warnings } = parseBots(text(sample((f) => { f.bots.shift(); return f; })));
  assert.ok(warnings.includes("no main bot"));
});

test("schema: entries with no id, a repeated id or no name are left out; other faults warn", () => {
  const { file, warnings } = parseBots(text(sample((f) => {
    f.bots.push({ name: "nobody", kind: "member" }, bot(ID.dev, "member"), bot("b-gggggggggg", "member", { name: "" }));
    f.bots[1].look = undefined;
    f.bots[2].agent = undefined;
    f.bots[3].look = { character: "dragon", colour: "plaid" };
    f.bots[4].planned = { wave: 0 };
    return f;
  })));
  assert.equal(file.bots.length, 5);
  assert.deepEqual(file.bots[1].look, defaultLook(ID.cap));
  assert.equal(file.bots[4].planned, undefined);
  for (const w of ["entry 6: no id", `${ID.dev}: id used twice`, "b-gggggggggg: no name", `${ID.cap}: no look`,
    `${ID.dev}: no coding agent`, `${ID.tst}: unknown character dragon`, `${ID.tst}: unknown colour plaid`, `${ID.plan}: planned`])
    assert.ok(warnings.some((x) => x.startsWith(w)), `missing warning ${w}\n${warnings.join("\n")}`);
});

test("schema: the write check wants A9 ids, known categories and an agent unless planned", () => {
  const errs = checkBots(sample((f) => {
    f.bots[1].id = "captain";
    f.bots[2].category = "nope";
    f.bots[3].agent = "";
    return f;
  }));
  assert.ok(errs.some((e) => /captain: id/.test(e)));
  assert.ok(errs.some((e) => /unknown category nope/.test(e)));
  assert.ok(errs.some((e) => e.startsWith(`${ID.tst}: no coding agent`)));
});

test("lead: absent means the main bot; a valid lead holds at any depth", () => {
  const file = sample();
  assert.deepEqual(effectiveLead(file, ID.cap), { lead: ID.main });
  assert.deepEqual(effectiveLead(file, ID.dev), { lead: ID.cap });
  assert.deepEqual(effectiveLead(file, ID.main), { lead: "" });
});

test("lead: a missing lead falls back to the main bot with a warning", () => {
  const file = sample((f) => { f.bots[2].lead = "b-zzzzzzzzzz"; return f; });
  const r = effectiveLead(file, ID.dev);
  assert.equal(r.lead, ID.main);
  assert.match(r.warning, /missing/);
  assert.ok(parseBots(text(file)).warnings.some((w) => w.startsWith(ID.dev) && /missing/.test(w)));
  assert.ok(checkBots(file).some((e) => e.startsWith(ID.dev)));
});

test("lead: a planned lead falls back to the main bot with a warning", () => {
  const file = sample((f) => { f.bots[2].lead = ID.plan; return f; });
  const r = effectiveLead(file, ID.dev);
  assert.equal(r.lead, ID.main);
  assert.match(r.warning, /planned/);
});

test("lead: a cycle falls back to the main bot for every bot in it, not for those under it", () => {
  const file = sample((f) => { f.bots[1].lead = ID.tst; f.bots[3].lead = ID.cap; return f; });
  for (const id of [ID.cap, ID.tst]) {
    const r = effectiveLead(file, id);
    assert.equal(r.lead, ID.main, id);
    assert.match(r.warning, /back to this bot/);
  }
  // dev's lead is cap, inside the cycle: dev stays under cap, which itself falls back.
  assert.deepEqual(effectiveLead(file, ID.dev), { lead: ID.cap });
  const self = sample((f) => { f.bots[2].lead = ID.dev; return f; });
  assert.equal(effectiveLead(self, ID.dev).lead, ID.main);
});

test("ids: b- plus 10 lowercase base32 characters, and random", () => {
  const ids = new Set(Array.from({ length: 200 }, () => newBotId()));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^b-[a-z2-7]{10}$/);
  assert.equal(newBotId(() => 0), "b-aaaaaaaaaa");
  assert.equal(newBotId(() => 0.999999), "b-7777777777");
});

test("look: defaultLook is stable per id and names Automagik characters and colours", () => {
  const ids = Array.from({ length: 300 }, (_, i) => `b-${String(i).padStart(10, "a")}`);
  const looks = ids.map(defaultLook);
  assert.deepEqual(ids.map(defaultLook), looks);
  for (const l of looks) {
    assert.ok(CHARACTERS.includes(l.character), l.character);
    assert.ok(COLOURS.includes(l.colour), l.colour);
  }
  assert.ok(new Set(looks.map((l) => l.character)).size > 3);
  assert.ok(new Set(looks.map((l) => l.colour)).size > 3);
  // Pinned to Automagik's own lookOf({ id }) (checked against it over 2,000 ids): a change
  // to the hash would give every bot without a stored look another face than in Automagik.
  assert.deepEqual(defaultLook("b-aaaaaaaaaa"), { character: "peanut", colour: "blue" });
  assert.deepEqual(defaultLook("b-k3m7q2zt5x"), { character: "star", colour: "violet" });
  assert.deepEqual(defaultLook("b-77777777ab"), { character: "moon", colour: "yellow" });
});

test("label key", () => {
  assert.equal(BOT_LABEL, "bot");
  assert.equal(MAX_INSTRUCTIONS, 4000);
});
