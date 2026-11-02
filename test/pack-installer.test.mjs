// The installer's edges, run as the person would: a bad flag must stop before anything is read or
// written, a malformed pack must not half-install, and the published index URL must be one string.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INSTALL = join(ROOT, "scripts", "install.mjs");
const CORE = join(ROOT, "mods", "mod-manager", "core.js");

const run = (args, { cwd = ROOT, script = INSTALL } = {}) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });

// A pack laid out like this repo, minus everything the installer does not read.
function pack({ keys = "{}" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "pack-"));
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "mods", "demo"), { recursive: true });
  writeFileSync(join(dir, "scripts", "install.mjs"), readFileSync(INSTALL, "utf8"));
  writeFileSync(join(dir, "mods", "demo", "main.js"), "export default class Demo {}\n");
  writeFileSync(join(dir, "mods", "demo", "mod.json"), '{ "place": "none" }\n');
  writeFileSync(join(dir, "keys.json"), keys);
  return dir;
}

test("an unknown flag, or a flag without its value, stops with exit 2 and writes nothing", () => {
  const home = join(mkdtempSync(join(tmpdir(), "home-")), "app");
  for (const args of [["--apphome", home], ["--app-home", "--dry-run"], ["--app-home"], ["extra"]]) {
    const r = run(args);
    assert.equal(r.status, 2, `${args.join(" ")} → exit 2 (${r.stderr.split("\n")[0]})`);
    assert.match(r.stderr, /install\.mjs:/);
    assert.equal(existsSync(home), false, "nothing was created");
  }
});

test("a dry run against a scratch home changes nothing", () => {
  // A pack of its own: this test must not depend on which mods the slice under review ships.
  const dir = pack();
  const home = join(mkdtempSync(join(tmpdir(), "home-")), "app");
  const r = run(["--dry-run", "--app-home", home], { cwd: dir, script: join(dir, "scripts", "install.mjs") });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /would write/);
  assert.equal(existsSync(home), false, "a dry run writes nothing at all");
});

test("an unreadable keys.json refuses before any folder moves", () => {
  // The file that used to crash late is the person's: mergeKeys() rewrites it after the mods are
  // written. Both files are checked now, and this test breaks the one in the app home.
  const dir = pack();
  const home = join(mkdtempSync(join(tmpdir(), "home-")), "app");
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, "keys.json"), "{ not json");
  const r = run(["--app-home", home], { cwd: dir, script: join(dir, "scripts", "install.mjs") });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /this app home's keys\.json is unreadable/);
  assert.equal(existsSync(join(home, "mods")), false, "not one mod folder was written");
});

// The manager arrives with a later slice; until it does there is nothing to compare against.
test("the published index URL is one string, on the pack's own branch", { skip: !existsSync(CORE) }, () => {
  const installer = /PUBLISHED_CATALOG = "([^"]+)"/.exec(readFileSync(INSTALL, "utf8"))?.[1];
  const manager = /CATALOG_URL = "([^"]+)"/.exec(readFileSync(CORE, "utf8"))?.[1];
  assert.ok(installer, "install.mjs declares PUBLISHED_CATALOG");
  assert.ok(manager, "core.js declares CATALOG_URL");
  assert.equal(installer, manager, "the installer and the manager cannot drift apart");
  assert.match(installer, /automagik-herdr\/dev\/catalog\/index\.json$/, "the pack publishes from dev");
});
