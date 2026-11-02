// The read side, pinned by tests: where each client keeps its credential, which Keychain item wins,
// and how the item's bytes become text.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { credentialTarget, TARGETS, itemText, hexToUtf8, fingerprint, tokenIdentity, keychainService, keychainServiceScript, keychainReadScript } from "../mods/am-quota/translate.js";
import { keychain } from "./am-quota-keychain.mjs";

/** The runtime's `exec` shape, with a test's environment. */
const execWith = (env = {}) => async (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", env: { ...process.env, ...env } });
  return { code: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
};
const hex = (s) => Buffer.from(s, "utf8").toString("hex");

test("the credential target follows CODEX_HOME and CLAUDE_CONFIG_DIR", () => {
  const home = "/Users/ada";
  assert.equal(credentialTarget("codex", { home }).file, "/Users/ada/.codex/auth.json");
  assert.equal(credentialTarget("codex", { home, env: { CODEX_HOME: "/srv/codex/" } }).file, "/srv/codex/auth.json");
  assert.equal(credentialTarget("codex", { home, env: { CODEX_HOME: "" } }).file, "/Users/ada/.codex/auth.json", "empty means default");
  assert.equal(credentialTarget("claude", { home }).file, "/Users/ada/.claude/.credentials.json");
  assert.equal(credentialTarget("claude", { home, env: { CLAUDE_CONFIG_DIR: "~/claude-work" } }).file, "/Users/ada/claude-work/.credentials.json");
  assert.equal(credentialTarget("claude", { home, env: { CODEX_HOME: "/srv/codex" } }).file, "/Users/ada/.claude/.credentials.json", "no mixing");

  // macOS Claude reads the Keychain first; elsewhere there is no `security`, and the file is the answer.
  assert.equal(credentialTarget("claude", { home }).keychain, "Claude Code-credentials");
  assert.equal(credentialTarget("claude", { home, platform: "linux" }).keychain, null);
  // Codex has no item to rely on.
  assert.equal(credentialTarget("codex", { home }).keychain, null);
  assert.equal(credentialTarget("nope", { home }), null);

  // A separate profile's item is the suffixed one; only a default-profile machine uses the plain name.
  assert.equal(credentialTarget("claude", { home }).keychainSuffix, false);
  assert.equal(credentialTarget("claude", { home, env: { CLAUDE_CONFIG_DIR: "" } }).keychainSuffix, false, "empty means default");
  assert.equal(credentialTarget("claude", { home, env: { CLAUDE_CONFIG_DIR: "/p" } }).keychainSuffix, true);
  assert.equal(credentialTarget("claude", { home, platform: "linux", env: { CLAUDE_CONFIG_DIR: "/p" } }).keychainSuffix, false, "no item at all without security");
  assert.equal(credentialTarget("codex", { home }).keychainSuffix, false);
});

test("the measured suffix: CLAUDE_CONFIG_DIR=/tmp/cc-scratch is Claude Code-credentials-bde599a8 (CLI 2.1.316)", async () => {
  const r = await execWith({ CLAUDE_CONFIG_DIR: "/tmp/cc-scratch" })("sh", ["-c", keychainServiceScript(), "sh", "Claude Code-credentials"]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, "Claude Code-credentials-bde599a8");
  assert.equal(createHash("sha256").update("/tmp/cc-scratch").digest("hex").slice(0, 8), "bde599a8",
    "the digest is sha256 of the directory exactly as the variable gave it");
});

test("a CLAUDE_CONFIG_DIR profile reads its own suffixed item, never the default profile's", async () => {
  const kc = keychain();
  const dir = mkdtempSync(join(tmpdir(), "am-quota-profile-"));   // a real scratch profile folder
  const env = { ...kc.env, CLAUDE_CONFIG_DIR: dir };
  const plan = credentialTarget("claude", { home: "/Users/ada", env: { CLAUDE_CONFIG_DIR: dir }, keychainWritten: true });
  assert.equal(plan.keychain, TARGETS.claude.keychain, "the base name is all the plan carries");
  assert.equal(plan.keychainSuffix, true);

  const service = await keychainService(plan, { exec: execWith(env) });
  assert.equal(service, `${TARGETS.claude.keychain}-${createHash("sha256").update(dir).digest("hex").slice(0, 8)}`);
  assert.notEqual(service, TARGETS.claude.keychain, "the default profile's login is not the target");

  // The read the panel does for the badge goes to that item — and only to it.
  const absent = await execWith(env)("sh", ["-c", keychainReadScript(), "sh", service]);
  assert.equal(absent.code, 44, "no item yet");
  kc.seed(service, JSON.stringify({ claudeAiOauth: { refreshToken: "rt-profile-0123456789abcdef" } }));
  const got = await execWith(env)("sh", ["-c", keychainReadScript(), "sh", service]);
  assert.equal(got.code, 0);
  assert.equal(tokenIdentity("claude", got.stdout), fingerprint("rt-profile-0123456789abcdef"), "the profile's own login");
  assert.deepEqual(kc.services(), [service, service]);
  assert.ok(!kc.services().some((s) => s === TARGETS.claude.keychain), "the default profile's item was never read");
});

test("without a profile the plain item is the service; an unresolvable profile is null, never the plain item", async () => {
  const plain = credentialTarget("claude", { home: "/Users/ada" });
  assert.equal(plain.keychainSuffix, false);
  assert.equal(await keychainService(plain, { exec: async () => { throw new Error("must not run"); } }), TARGETS.claude.keychain);
  // A profile whose digest cannot be computed must not fall back to the default login.
  const broken = { keychain: TARGETS.claude.keychain, keychainSuffix: true };
  assert.equal(await keychainService(broken, { exec: async () => ({ code: 1, stdout: "" }) }), null);
  assert.equal(await keychainService({ keychain: TARGETS.claude.keychain, keychainSuffix: true }, { exec: async () => ({ code: 1, stdout: "" }) }), null);
  assert.equal(await keychainService({ keychain: null, keychainSuffix: false }), null);
  assert.equal(await keychainService(credentialTarget("codex", { home: "/Users/ada" })), null);
});

test("an item's bytes are read back as text, or as hex when it holds a newline", () => {
  const item = JSON.stringify({ claudeAiOauth: { accessToken: "t" }, mcpOAuth: {} }, null, 2);
  assert.equal(itemText(JSON.stringify({ a: 1 })), '{"a":1}');
  assert.equal(itemText(`${JSON.stringify({ a: 1 })}\n`), '{"a":1}', "security -w appends one newline");
  assert.equal(itemText(`${hex(item)}\n`), item, "hex is what -w prints for a value holding 0x0a");
  assert.equal(hexToUtf8(hex(item)), item, "and it decodes through the same reader the tests use");
  assert.equal(itemText("") , null);
  assert.equal(itemText("nonsense"), null);
  assert.equal(itemText("7b"), null, "hex that is not JSON is not an item");
  assert.equal(itemText(null), null);
});

test("hex item text decodes as UTF-8: a non-ASCII key is not mojibake", () => {
  const item = JSON.stringify({ claudeAiOauth: { accessToken: "t" }, mcpOAuth: { "café": { token: "x" } }, note: "Café ☕" });
  assert.equal(itemText(hex(item)), item, "a byte is not a character");
  assert.equal(hexToUtf8(hex("Café ☕")), "Café ☕", "two-, three- and four-byte runes");
  assert.equal(hexToUtf8(hex("😀")), "😀", "astral runes become a surrogate pair");
  assert.equal(hexToUtf8(""), "");
  assert.equal(hexToUtf8("7"), null, "half a byte is not hex");
  assert.equal(hexToUtf8("zz"), null);
  assert.equal(hexToUtf8(null), null);
  assert.equal(hexToUtf8("ff"), "\ufffd", "invalid UTF-8 degrades, it never throws");
});

test("a fingerprint identifies a token without keeping it, so the badge can be checked", () => {
  const a = fingerprint("rt-one-0123456789abcdef");
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.equal(fingerprint("rt-one-0123456789abcdef"), a, "stable across calls");
  assert.notEqual(fingerprint("rt-two-0123456789abcdef"), a);
  assert.equal(fingerprint(""), null);
  assert.ok(!a.includes("0123456789"), "the token is not in its fingerprint");

  assert.equal(tokenIdentity("claude", JSON.stringify({ claudeAiOauth: { refreshToken: "rt-x-0123456789abcdef" } })), fingerprint("rt-x-0123456789abcdef"));
  assert.equal(tokenIdentity("codex", JSON.stringify({ tokens: { refresh_token: "rt-c-0123456789abcdef", account_id: "acc-7" } })), fingerprint("acc-7"), "the account id survives a token refresh");
  assert.equal(tokenIdentity("codex", JSON.stringify({ tokens: { refresh_token: "rt-c-0123456789abcdef" } })), fingerprint("rt-c-0123456789abcdef"));
  assert.equal(tokenIdentity("claude", JSON.stringify({ claudeAiOauth: {} })), null);
  assert.equal(tokenIdentity("claude", "not json"), null);
  assert.equal(tokenIdentity("codex", null), null);
  assert.equal(tokenIdentity("claude", hex(JSON.stringify({ claudeAiOauth: { refreshToken: "rt-y-0123456789abcdef" }, mcpOAuth: { "café": 1 } }))),
    fingerprint("rt-y-0123456789abcdef"), "a hex item is read too");
});
