// The pack's other install path and its index, run as the person would against scratch folders:
// the mod manager's core.js (staged installs, linked state, the catalog's commit) and
// scripts/catalog.mjs (strict flags, --check). install.sh and update.mjs have their own tests.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../mods/mod-manager/core.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = join(ROOT, "scripts", "catalog.mjs");

/** core.js's io over real processes and files; `fail(cmd, args)` true makes that call fail. */
const ioOf = (fail = () => false) => ({
  exec: async (cmd, args) => {
    if (fail(cmd, args)) return { code: 1, stdout: "", stderr: "injected failure" };
    const r = spawnSync(cmd, args, { encoding: "utf8" });
    return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? String(r.error ?? "") };
  },
  readText: async (path) => readFileSync(path, "utf8"),
  writeText: async (path, text) => writeFileSync(path, text),
});
const scratch = (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "mod-manager-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};
const git = (cwd, ...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" }).trim();

test("fetchSource installs at the catalog's headCommit, not whatever HEAD is", async (t) => {
  const root = scratch(t);
  const repo = join(root, "repo");
  mkdirSync(join(repo, "mods", "demo"), { recursive: true });
  git(root, "init", "-q", "-b", "main", repo);
  writeFileSync(join(repo, "mods", "demo", "main.js"), "// pinned\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "pinned");
  const pinned = git(repo, "rev-parse", "HEAD");
  writeFileSync(join(repo, "mods", "demo", "main.js"), "// newer\n");
  git(repo, "commit", "-qam", "newer");
  const source = `file://${repo}`;
  const catalog = core.parseCatalog({ mods: [{ fullName: source, headCommit: pinned, modNames: ["demo"] }] });
  assert.equal(core.catalogCommit(catalog, source), pinned);
  assert.equal(core.catalogCommit(catalog, "someone/else"), null);
  assert.equal(core.catalogCommit(core.parseCatalog({ mods: [{ fullName: source, headCommit: "", modNames: ["demo"] }] }), source), null);
  const at = await core.fetchSource(ioOf(), source, join(root, "cache"), pinned);
  assert.equal(at.sha, pinned);
  assert.equal(readFileSync(join(at.dir, "mods", "demo", "main.js"), "utf8"), "// pinned\n");
  const head = await core.fetchSource(ioOf(), source, join(root, "cache"));
  assert.equal(readFileSync(join(head.dir, "mods", "demo", "main.js"), "utf8"), "// newer\n");
});

/** A package at `base` (mods/demo, new code) and an app home where demo is installed with private state. */
function installed(root) {
  const base = join(root, "pkg");
  mkdirSync(join(base, "mods", "demo", ".state"), { recursive: true });
  writeFileSync(join(base, "mods", "demo", "main.js"), "// new\n");
  writeFileSync(join(base, "mods", "demo", ".state", "default.json"), "{}\n");
  const appHome = join(root, "app");
  const live = join(appHome, "mods", "demo");
  mkdirSync(live, { recursive: true });
  writeFileSync(join(live, "main.js"), "// old\n");
  writeFileSync(join(live, ".token"), "mine\n");
  const elsewhere = join(root, "state-elsewhere");
  mkdirSync(elsewhere);
  writeFileSync(join(elsewhere, "key"), "secret\n");
  symlinkSync(elsewhere, join(live, ".state"));
  const plan = { clashes: [], mods: ["demo"], layouts: [], base, keyAdds: [], keyConflicts: [], risks: [] };
  return { base, appHome, live, elsewhere, plan, record: { mods: ["demo"], layouts: [], keys: [] } };
}

test("applyInstall stages the new folder, keeps a linked .state a link and a dotfile a file, and moves the old one aside", async (t) => {
  const s = installed(scratch(t));
  await core.applyInstall(ioOf(), { appHome: s.appHome, plan: s.plan, source: "x", prefix: "", sha: "0", record: s.record });
  assert.equal(readFileSync(join(s.live, "main.js"), "utf8"), "// new\n");
  assert.equal(lstatSync(join(s.live, ".state")).isSymbolicLink(), true, "a linked .state stays a link (probe C2)");
  assert.equal(readlinkSync(join(s.live, ".state")), s.elsewhere);
  assert.equal(readFileSync(join(s.elsewhere, "key"), "utf8"), "secret\n");
  assert.equal(readFileSync(join(s.live, ".token"), "utf8"), "mine\n");
  const backups = readdirSync(join(s.appHome, "automagik-herdr", "backup"));
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(join(s.appHome, "automagik-herdr", "backup", backups[0], "main.js"), "utf8"), "// old\n");
  assert.deepEqual(readdirSync(join(s.appHome, "automagik-herdr", "staging")), [], "nothing left staged");
  assert.deepEqual(readdirSync(join(s.appHome, "mods")), ["demo"]);
});

test("applyInstall that fails mid-way (copy or rename) leaves the old folder in place, whole (probes P2, C4)", async (t) => {
  for (const failing of [(cmd, args) => cmd === "cp" && args[0] === "-P", (cmd, args) => cmd === "mv" && /\/staging\//.test(args[0])]) {
    const s = installed(scratch(t));
    await assert.rejects(core.applyInstall(ioOf(failing), { appHome: s.appHome, plan: s.plan, source: "x", prefix: "", sha: "0", record: s.record }), /injected failure/);
    assert.equal(readFileSync(join(s.live, "main.js"), "utf8"), "// old\n");
    assert.equal(lstatSync(join(s.live, ".state")).isSymbolicLink(), true);
    assert.equal(readFileSync(join(s.live, ".token"), "utf8"), "mine\n");
    assert.deepEqual(readdirSync(join(s.appHome, "automagik-herdr", "staging")), [], "staging cleared");
    assert.deepEqual(readdirSync(join(s.appHome, "automagik-herdr", "backup")), [], "nothing left aside");
  }
});

test("the manager never installs over, records or removes pocket-link", async (t) => {
  const s = installed(scratch(t));
  const args = { appHome: s.appHome, source: "x", prefix: "", sha: "0" };
  await assert.rejects(core.applyInstall(ioOf(), { ...args, plan: { ...s.plan, mods: [core.POCKET_LINK] }, record: null }), /automagik-pocket/);
  await assert.rejects(core.applyInstall(ioOf(), { ...args, plan: s.plan, record: { mods: [core.POCKET_LINK] } }), /automagik-pocket/);
  await assert.rejects(core.uninstall(ioOf(), { appHome: s.appHome, record: { mods: [core.POCKET_LINK] } }), /automagik-pocket/);
  assert.equal(existsSync(join(s.appHome, "automagik-herdr", "staging")), false, "refused before anything was written");
});

test("catalog.mjs: --check passes on this checkout and writes nothing; an unknown flag exits 2", (t) => {
  const index = join(ROOT, "catalog", "index.json");
  const before = readFileSync(index, "utf8");
  const check = spawnSync(process.execPath, [CATALOG, "--check"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.match(check.stdout, /catalog matches the checkout/);
  for (const bad of [["--chek"], ["--refresh", "-x"]]) {
    const r = spawnSync(process.execPath, [CATALOG, ...bad], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 2, bad.join(" "));
    assert.match(r.stderr, /unknown flag/);
  }
  assert.equal(spawnSync(process.execPath, [CATALOG, "--help"], { encoding: "utf8" }).status, 0);
  assert.equal(readFileSync(index, "utf8"), before, "the index is untouched");
  const pack = JSON.parse(before).mods.find((e) => e.fullName === "automagik-dev/automagik-herdr");
  assert.equal(pack.modNames.includes("pocket-link"), false);
});
