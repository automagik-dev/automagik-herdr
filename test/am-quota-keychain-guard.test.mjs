// No test may reach the owner's machine through `security`, `launchctl`, `defaults` or
// `osascript`. On 2026-11-02 the Keychain tests ran the real `security` with a scratch HOME, and
// macOS put a "Keychain Not Found" dialog on the owner's screen; with the real HOME they would
// have written test items into the login keychain. The runtime guard is `keychain()` in
// ./am-quota-keychain.mjs (it refuses an env where `command -v security` is not the stand-in);
// this test is the source half: it fails on any test that could run those tools another way.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const STAND_IN = "am-quota-keychain.mjs";
const SELF = "am-quota-keychain-guard.test.mjs";
const files = readdirSync(here).filter((n) => /\.(?:mjs|js|cjs|sh)$/.test(n) && n !== STAND_IN && n !== SELF);

// A spawn whose program is one of these, by name or by path.
const TOOL = String.raw`(?:[\w./-]*/)?(?:security|launchctl|defaults|osascript)`;
const DIRECT = new RegExp(String.raw`\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\(\s*["'\x60]${TOOL}["'\x60\s]`);
// A shell line that runs one: `security find-…`, `| security -i`, `launchctl load`, `defaults write`.
const SHELL = new RegExp(String.raw`(?:^|[;&|(]\s*|\$\(\s*|["'\x60]\s*)${TOOL}\s+(?:-i\b|[a-z]+-[a-z-]+|load|unload|bootstrap|bootout|kickstart|write|delete|import|-e)`);
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

test("guard: the patterns catch the incident's own lines", () => {
  for (const line of [
    'const forget = (svc) => spawnSync("security", ["delete-generic-password", "-s", svc]);',
    'spawnSync("/usr/bin/security", ["-i"], { input });',
    "execSync(`osascript -e 'beep'`)",
  ]) assert.ok(DIRECT.test(line), line);
  for (const line of ["sh(`printf x | security -i`)", 'sh("security find-generic-password -w -s x")', 'run("launchctl bootout gui/501")', 'sh("defaults write com.x y 1")']) {
    assert.ok(SHELL.test(line), line);
  }
});
