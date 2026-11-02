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

test("applyInstall refuses a package that ships a link (a .state pointing outside, a dangling dotfile), changing nothing", async (t) => {
  for (const [name, target] of [[".state", "/tmp"], [".dangling", "/nowhere"]]) {
    const s = installed(scratch(t));
    rmSync(join(s.base, "mods", "demo", name), { recursive: true, force: true });
    symlinkSync(target, join(s.base, "mods", "demo", name));
    await assert.rejects(core.applyInstall(ioOf(), { appHome: s.appHome, plan: s.plan, source: "x", prefix: "", sha: "0", record: s.record }), /link ou arquivo especial/, name);
    assert.equal(readFileSync(join(s.live, "main.js"), "utf8"), "// old\n");
    assert.equal(readlinkSync(join(s.live, ".state")), s.elsewhere);
    assert.equal(readFileSync(join(s.elsewhere, "key"), "utf8"), "secret\n", "nothing written through the link");
    assert.deepEqual(readdirSync(join(s.appHome, "automagik-herdr", "staging")), []);
  }
});

test("applyInstall whose key write fails puts the mods and layouts back, writing no layout", async (t) => {
  const s = installed(scratch(t));
  mkdirSync(join(s.base, "layouts"));
  writeFileSync(join(s.base, "layouts", "demo.json"), "{}\n");
  const plan = { ...s.plan, layouts: ["demo.json"], keyAdds: [{ section: "global", key: "cmd-k", action: "demo.open" }] };
  const io = { ...ioOf(), readText: async () => "{}", writeText: async () => { throw new Error("disk full"); } };
  await assert.rejects(core.applyInstall(io, { appHome: s.appHome, plan, source: "x", prefix: "", sha: "0", record: s.record }), /disk full/);
  assert.equal(readFileSync(join(s.live, "main.js"), "utf8"), "// old\n");
  assert.equal(existsSync(join(s.appHome, "layouts", "demo.json")), false);
  assert.deepEqual(readdirSync(join(s.appHome, "automagik-herdr", "backup")), []);
});

/** Every file under `dir`, path → bytes, links as their target: equal means byte-identical. */
const snapshot = (dir) => {
  const out = {};
  const walk = (at, rel) => {
    for (const name of readdirSync(at).sort()) {
      const path = join(at, name), st = lstatSync(path);
      if (st.isSymbolicLink()) out[`${rel}${name}`] = `-> ${readlinkSync(path)}`;
      else if (st.isDirectory()) walk(path, `${rel}${name}/`);
      else out[`${rel}${name}`] = readFileSync(path, "utf8");
    }
  };
  walk(dir, "");
  return out;
};

test("names differing only in case: Pocket-Link, Demo and Main.json never touch the person's folders", async (t) => {
  const s = installed(scratch(t));
  const pocket = join(s.appHome, "mods", "pocket-link");
  mkdirSync(join(pocket, ".state"), { recursive: true });
  writeFileSync(join(pocket, ".state", "pairing.key"), "secret\n");
  mkdirSync(join(s.appHome, "layouts"));
  writeFileSync(join(s.appHome, "layouts", "main.json"), "{\"mine\":true}\n");
  writeFileSync(join(s.appHome, "keys.json"), "{}\n");
  for (const m of ["Pocket-Link", "Demo", "fresh"]) {
    mkdirSync(join(s.base, "mods", m), { recursive: true });
    writeFileSync(join(s.base, "mods", m, "main.js"), `// ${m} from the package\n`);
  }
  mkdirSync(join(s.base, "layouts"));
  writeFileSync(join(s.base, "layouts", "Main.json"), "{\"theirs\":true}\n");
  const before = snapshot(s.appHome);
  // The plan flags them before anything runs.
  const plan = await core.planInstall(ioOf(), { appHome: s.appHome, dir: s.base, pkg: { prefix: "", mods: ["Demo", "Pocket-Link"], layouts: ["layouts/Main.json"], keys: false, files: [] },
    record: null, existingMods: ["demo", "pocket-link"], existingLayouts: ["main.json"] });
  assert.deepEqual(plan.clashes, ["mods/Demo", "mods/Pocket-Link", "layouts/Main.json"]);
  // And applyInstall refuses them even when handed a plan that missed them.
  const args = { appHome: s.appHome, source: "x", prefix: "", sha: "0", record: null };
  const bare = { clashes: [], layouts: [], base: s.base, keyAdds: [], keyConflicts: [], risks: [] };
  await assert.rejects(core.applyInstall(ioOf(), { ...args, plan: { ...bare, mods: ["Pocket-Link"] } }), /automagik-pocket/);
  await assert.rejects(core.applyInstall(ioOf(), { ...args, plan: { ...bare, mods: ["Demo"] } }), /nome recusado: Demo/);
  await assert.rejects(core.applyInstall(ioOf(), { ...args, plan: { ...bare, mods: ["demo"] } }), /já existe: mods\/demo/);
  // A layout that clashes (on macOS's disk) after a mod was placed: the undo removes only that mod.
  await core.applyInstall(ioOf(), { ...args, plan: { ...bare, mods: ["fresh"], layouts: ["Main.json"] } }).catch(() => {});
  const caseless = existsSync(join(s.appHome, "layouts", "MAIN.JSON"));
  if (caseless) assert.equal(existsSync(join(s.appHome, "mods", "fresh")), false, "the undo took back the mod it placed");
  rmSync(join(s.appHome, "mods", "fresh"), { recursive: true, force: true });
  // Created only on a case-sensitive disk (Linux); on macOS's that name is the person's main.json.
  if (readdirSync(join(s.appHome, "layouts")).includes("Main.json")) rmSync(join(s.appHome, "layouts", "Main.json"));
  assert.equal(readFileSync(join(s.appHome, "layouts", "main.json"), "utf8"), "{\"mine\":true}\n");
  const after = snapshot(s.appHome);
  for (const k of Object.keys(after)) if (k.startsWith("automagik-herdr/")) delete after[k];
  for (const k of Object.keys(before)) if (k.startsWith("automagik-herdr/")) delete before[k];
  assert.deepEqual(after, before, "the person's mods and layouts are byte-identical");
});
