// The switch, tested as a flow: the shell, the files and the Keychain (a stand-in) are real, and
// what lands — or is refused, or is put back — is observed rather than asserted about source text.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { install } from "../mods/am-quota/switch.js";
import { payloadDir } from "../mods/am-quota/write.js";
import { fingerprint, TARGETS } from "../mods/am-quota/translate.js";
import { keychain } from "./am-quota-keychain.mjs";

const PROXY = {
  access_token: "at-0123456789abcdef", refresh_token: "rt-0123456789abcdef", account_id: "acc-1",
  id_token: "idt", expired: "2026-11-01T13:00:00Z", plan_type: "max",
};
const mode = (p) => statSync(p).mode & 0o777;
const sha8 = (dir) => createHash("sha256").update(dir).digest("hex").slice(0, 8);

/**
 * A scratch machine: a home, an app home, a Keychain stand-in, and the runtime doubles the flow
 * takes. `env` is what the flow is told the client's environment is; `execEnv` is what the shell
 * actually sees (they differ only in the test that proves a mismatch is refused).
 */
function world({ env = {}, execEnv = env, kc = keychain() } = {}) {
  const root = mkdtempSync(join(tmpdir(), "am-quota-switch-"));
  const home = join(root, "home");
  const appHome = join(root, "app");
  mkdirSync(home);
  mkdirSync(appHome);
  const shellEnv = { ...process.env, ...kc.env, ...execEnv };
  const io = {
    exec: async (cmd, args) => {
      const r = spawnSync(cmd, args, { encoding: "utf8", env: shellEnv });
      return { code: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
    },
    readTextFile: async (p) => readFileSync(p, "utf8"),
    writeTextFile: async (p, text, before) => { writeFileSync(p, text, { flag: before === null ? "wx" : "w" }); },
    unlink: async (p) => { try { unlinkSync(p); } catch {} },
  };
  const run = (extra = {}) => install({
    api: { credential: async () => JSON.stringify(PROXY) },
    provider: "claude", account: { name: "claude-a.json" },
    home, appHome, env, ...io, ...extra,
  });
  return { root, home, appHome, kc, env, io, run };
}

test("a CLAUDE_CONFIG_DIR profile gets its own Keychain item and its own file — never the default login", async () => {
  const profile = mkdtempSync(join(tmpdir(), "am-quota-profile-"));
  const w = world({ env: { CLAUDE_CONFIG_DIR: profile } });
  const service = `${TARGETS.claude.keychain}-${sha8(profile)}`;
  // What the CLI keeps in that profile's item: our blob next to a key with a non-ASCII name.
  const oldItem = JSON.stringify({ claudeAiOauth: { accessToken: "old" }, mcpOAuth: { "café": { token: "mcp" } } });
  w.kc.seed(service, oldItem);

  const out = await w.run();
  const item = JSON.parse(w.kc.item(service));
  assert.equal(item.claudeAiOauth.accessToken, PROXY.access_token, "the profile's item took the new credential");
  assert.deepEqual(item.mcpOAuth, { "café": { token: "mcp" } }, "the kept key survives — non-ASCII name and all");
  assert.ok(w.kc.services().length > 0);
  assert.ok(w.kc.services().every((s) => s === service), `every call named the suffixed item, saw: ${w.kc.services().join(" | ")}`);
  assert.equal(w.kc.item(TARGETS.claude.keychain), null, "the default profile's item was never read or written");

  // The profile's file is written too (a CLAUDE_CONFIG_DIR is the file route), 0600, no leftover.
  const file = join(profile, ".credentials.json");
  assert.equal(JSON.parse(readFileSync(file, "utf8")).claudeAiOauth.accessToken, PROXY.access_token);
  assert.equal(mode(file), 0o600);
  assert.deepEqual(readdirSync(payloadDir(w.appHome)), [], "the payload and the item backup are gone");
  assert.equal(out.label, "Claude Code");
  assert.equal(out.fingerprint, fingerprint(PROXY.refresh_token));

  // The stand-in logs service names, never a value; nothing secret reached it.
  const log = readFileSync(join(w.kc.root, "log.jsonl"), "utf8");
  assert.ok(!log.includes(PROXY.access_token) && !log.includes(PROXY.refresh_token), "no token in the recorded calls");
});

test("macOS without a CLAUDE_CONFIG_DIR writes only the plain item, and leaves the plaintext file alone", async () => {
  const w = world();
  const file = join(w.home, ".claude", ".credentials.json");
  mkdirSync(join(w.home, ".claude"));
  writeFileSync(file, '{"old":true}');

  const out = await w.run();
  assert.equal(JSON.parse(w.kc.item(TARGETS.claude.keychain)).claudeAiOauth.accessToken, PROXY.access_token);
  assert.ok(w.kc.services().length >= 2);
  assert.ok(w.kc.services().every((s) => s === TARGETS.claude.keychain), "the default profile's own item, read and written");
  assert.equal(readFileSync(file, "utf8"), '{"old":true}', "the plaintext file and its backups are pure exposure, and are not touched");
  assert.equal(out.fingerprint, fingerprint(PROXY.refresh_token));
});

test("an existing item too large for the one-line add is refused in plain words, before any write", async () => {
  const w = world();
  const huge = JSON.stringify({ claudeAiOauth: { accessToken: "old" }, mcpOAuth: { blob: "x".repeat(2400) } });
  w.kc.seed(TARGETS.claude.keychain, huge);

  await assert.rejects(w.run(), (err) => {
    assert.equal(err.message, "this login item is too large to switch safely");
    assert.ok(!err.message.includes("old") && !err.message.includes("x".repeat(20)), "nothing from the item is quoted");
    return true;
  });
  assert.equal(w.kc.item(TARGETS.claude.keychain), huge, "the item is untouched");
  assert.equal(w.kc.calls().filter((c) => c.add).length, 0, "no add ran — so there is nothing to put back");
  assert.equal(w.kc.calls().filter((c) => c.cmd === "delete-generic-password").length, 0);
  assert.deepEqual(readdirSync(payloadDir(w.appHome)), [], "the payload and the backup were cleaned up");
});

test("a failure after the item was written puts the old item back", async () => {
  const blocked = join(mkdtempSync(join(tmpdir(), "am-quota-blocked-")), "not-a-directory");
  writeFileSync(blocked, "the profile path is a file, so the file install must fail");
  const w = world({ env: { CLAUDE_CONFIG_DIR: blocked } });
  const service = `${TARGETS.claude.keychain}-${sha8(blocked)}`;
  const oldItem = JSON.stringify({ claudeAiOauth: { accessToken: "old" }, mcpOAuth: { keep: "me" } });
  w.kc.seed(service, oldItem);

  await assert.rejects(w.run(), /put back/);
  assert.equal(w.kc.item(service), oldItem, "Claude is back on the account it was on, error and all");
  assert.ok(w.kc.calls().some((c) => c.add), "the add did run before the later step failed");
  assert.deepEqual(readdirSync(payloadDir(w.appHome)), [], "no token-bearing file is left behind");
});

test("a profile whose item cannot be resolved is refused instead of falling back to the default item", async () => {
  const profile = mkdtempSync(join(tmpdir(), "am-quota-profile-"));
  // The flow is told a profile is set; the shell does not see the variable (they moved apart).
  const w = world({ env: { CLAUDE_CONFIG_DIR: profile }, execEnv: {} });

  await assert.rejects(w.run(), /could not tell which Keychain item this profile reads/);
  assert.equal(w.kc.calls().length, 0, "security was never asked to touch anything");
  assert.equal(existsSync(payloadDir(w.appHome)), false, "and no payload folder was made");
});

test("codex: $CODEX_HOME/auth.json is written 0600 with a dated backup and no Keychain call", async () => {
  const w = world();
  const codexHome = join(w.root, "codex");
  const auth = join(codexHome, "auth.json");
  mkdirSync(codexHome);
  writeFileSync(auth, '{"old":true}');
  chmodSync(auth, 0o644);

  const out = await w.run({ provider: "codex", account: { name: "codex-a.json" }, env: { CODEX_HOME: codexHome } });
  const written = JSON.parse(readFileSync(auth, "utf8"));
  assert.equal(written.auth_mode, "chatgpt");
  assert.equal(written.tokens.account_id, "acc-1");
  assert.equal(mode(auth), 0o600);
  assert.equal(out.fingerprint, fingerprint("acc-1"), "Codex's identity is the account id");
  const backups = readdirSync(codexHome).filter((n) => n.startsWith("auth.json.bak-"));
  assert.equal(backups.length, 1, "the previous file is kept");
  assert.equal(readFileSync(join(codexHome, backups[0]), "utf8"), '{"old":true}');
  assert.equal(w.kc.calls().length, 0, "no Keychain on the Codex path");
});

test("a credential that is not JSON is named, not quoted, and no token is ever in the error", async () => {
  const w = world();
  const token = "at-SECRET-0123456789abcdef";
  await assert.rejects(
    w.run({ api: { credential: async () => `<html>${token}</html>` } }),
    (err) => {
      assert.match(err.message, /not JSON/);
      assert.ok(!err.message.includes(token), "the response body never reaches the message");
      return true;
    },
  );
  assert.equal(existsSync(payloadDir(w.appHome)), false, "nothing was even prepared");
});
