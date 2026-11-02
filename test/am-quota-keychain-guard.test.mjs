// No test may reach the owner's machine through `security`, `launchctl`, `defaults` or
// `osascript`. On 2026-11-02 the Keychain tests ran the real `security` with a scratch HOME, and
// macOS put a "Keychain Not Found" dialog on the owner's screen; with the real HOME they would
// have written test items into the login keychain. The runtime guards live in
// ./am-quota-keychain.mjs: importing it puts a trap `security` first on the process PATH (exit 99,
// a marker, an after() hook that fails the run), and `keychain()` refuses an env where
// `command -v security` is not the recording stand-in. This file is the source half: it fails on
// any test that could run those tools, or a product Keychain script, another way.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const STAND_IN = "am-quota-keychain.mjs";
const SELF = "am-quota-keychain-guard.test.mjs";
const all = readdirSync(here).filter((n) => /\.(?:mjs|js|cjs|sh)$/.test(n) && n !== SELF);
const files = all.filter((n) => n !== STAND_IN);

// A spawn whose program is one of these, by name or by path.
const TOOL = String.raw`(?:[\w./-]*/)?(?:security|launchctl|defaults|osascript)`;
const DIRECT = new RegExp(String.raw`\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\(\s*["'\x60]${TOOL}["'\x60\s]`);
// A shell line that runs one: `security find-…`, `| security -i`, `launchctl load`, `defaults write`.
const SHELL = new RegExp(String.raw`(?:^|[;&|(]\s*|\$\(\s*|["'\x60]\s*)${TOOL}\s+(?:-i\b|[a-z]+-[a-z-]+|load|unload|bootstrap|bootout|kickstart|write|delete|import|-e)`);
// A path to a `security` binary: a spawn through a constant holding one skips PATH, trap included.
const SECURITY_PATH = /\/usr\/bin\/security|["'\x60][^"'\x60\s]*\/security["'\x60]/;
// A product Keychain script handed to something that runs it: `X(script(` or `X("sh", ["-c",
// script(`. X must be the stand-in's kc.sh or kc.exec(...), or an assert.* that only reads text.
const RUN_SCRIPT = /((?:[\w.]+)(?:\([^()]*\))?)\(\s*(?:["'](?:\/bin\/)?sh["']\s*,\s*\[\s*["']-c["']\s*,\s*)?keychain(?:Backup|Restore|Read)?Script\(/g;
const RUN_OK = /^(?:(?:w\.)?kc\.(?:sh|exec\([^()]*\))|assert\.\w+)$/;
const runsOutsideStandIn = (line) => [...line.matchAll(RUN_SCRIPT)].some((m) => !RUN_OK.test(m[1]));
// The product's Keychain scripts: a test that runs one must take its env from the stand-in.
const KEYCHAIN_SCRIPTS = /\b(?:keychainScript|keychainBackupScript|keychainRestoreScript|keychainReadScript|install)\b/;

test("guard: no test spawns security, launchctl, defaults or osascript directly", () => {
  assert.ok(files.length > 10, `found the test files (${files.length})`);
  const hits = [];
  for (const name of files) {
    readFileSync(join(here, name), "utf8").split("\n").forEach((line, i) => {
      if (DIRECT.test(line)) hits.push(`${name}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, [], "spawn the stand-in (keychain().run / .sh) instead");
});

test("guard: no test carries its own shell line for those tools", () => {
  const hits = [];
  for (const name of files) {
    readFileSync(join(here, name), "utf8").split("\n").forEach((line, i) => {
      const code = line.replace(/^\s*(?:\/\/|\*).*$/, "");   // comments may name them
      // Checks on script text, and test titles, name the tools without running them.
      if (/assert\.(?:match|doesNotMatch|ok)\(|\.includes\(|^\s*test\(/.test(code)) return;
      if (SHELL.test(code)) hits.push(`${name}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, [], "a test's own shell must go through the stand-in too");
});

test("guard: every test that runs a product Keychain script imports the stand-in", () => {
  const loose = [];
  for (const name of files) {
    const src = readFileSync(join(here, name), "utf8");
    const imports = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']\.\.\/mods\/am-quota\/(?:write|translate|switch)\.js["']/g)];
    const named = imports.some((m) => KEYCHAIN_SCRIPTS.test(m[1].replace(/\bkeychainServiceScript\b/g, "")));
    if (named && !src.includes(`from "./${STAND_IN}"`)) loose.push(name);
  }
  assert.deepEqual(loose, [], "these run a script that calls `security` without the stand-in's env");
});

test("guard: no test names a path to a security binary", () => {
  const hits = [];
  for (const name of all) {
    readFileSync(join(here, name), "utf8").split("\n").forEach((line, i) => {
      if (SECURITY_PATH.test(line)) hits.push(`${name}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, [], "a program held in a constant skips PATH and the trap: use keychain().run");
});

test("guard: a product Keychain script runs only through kc.sh or kc.exec", () => {
  const hits = [];
  for (const name of files) {
    readFileSync(join(here, name), "utf8").split("\n").forEach((line, i) => {
      if (runsOutsideStandIn(line)) hits.push(`${name}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, [], "run it with keychain().sh(script, ...) or keychain().exec(env)");
});

test("guard: the patterns catch the incident's own lines", () => {
  for (const line of [
    'const forget = (svc) => spawnSync("security", ["delete-generic-password", "-s", svc]);',
    'spawnSync("/usr/bin/security", ["-i"], { input });',
    "execSync(`osascript -e 'beep'`)",
  ]) assert.ok(DIRECT.test(line), line);
  for (const line of ["sh(`printf x | security -i`)", 'sh("security find-generic-password -w -s x")', 'run("launchctl bootout gui/501")', 'sh("defaults write com.x y 1")']) {
    assert.ok(SHELL.test(line), line);
  }
  // The review's two lines (PR #49): a plain sh running a Keychain script, a constant path.
  assert.ok(runsOutsideStandIn('sh(keychainScript(), "svc", "/nonexistent");'));
  assert.ok(runsOutsideStandIn('spawnSync("sh", ["-c", keychainReadScript(), "sh", svc]);'));
  assert.ok(runsOutsideStandIn('execWith(env)("sh", ["-c", keychainBackupScript(), "sh", svc, b]);'));
  assert.ok(SECURITY_PATH.test('const SEC = "/usr/bin/security";'));
  assert.ok(SECURITY_PATH.test("const SEC = `${root}/bin/security`;"));
  for (const ok of ['kc.sh(keychainScript(), svc, p);', 'await kc.exec({ A: 1 })("sh", ["-c", keychainReadScript(), "sh", s]);',
    'assert.match(keychainRestoreScript(), /x/);', 'const script = keychainScript();']) assert.ok(!runsOutsideStandIn(ok), ok);
});
