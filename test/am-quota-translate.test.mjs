// The one place that knows the proxy's credential shape vs each client's, pinned by tests.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { toCodex, toClaude, problems, credentialTarget, TARGETS, mergeCredentialItem, itemText, hexToUtf8, fingerprint, tokenIdentity, keychainService, keychainServiceScript, keychainReadScript } from "../mods/am-quota/translate.js";
import { keychain } from "./am-quota-keychain.mjs";

const NOW = new Date("2026-11-01T12:00:00Z");

const codex = {
  access_token: "at-codex-0123456789abcdef", account_id: "acc-1", id_token: "idt", refresh_token: "rt-codex-0123456789abcdef",
  expired: "2026-11-01T13:00:00Z", email: "x@y.z", last_refresh: "2026-11-01T11:00:00Z", plan_type: "pro",
};
const claude = {
  access_token: "at-claude-0123456789abcdef01", refresh_token: "rt-claude-0123456789abcdef01", expired: "2026-11-01T13:00:00Z",
  account_uuid: "u-1", organization_uuid: "o-1", organization_name: "Namastex", email: "x@y.z",
  claude_device_ids: ["d1"], last_refresh: "2026-11-01T11:00:00Z",
};

/** The runtime's `exec` shape, with a test's environment. */
const execWith = (env = {}) => async (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", env: { ...process.env, ...env } });
  return { code: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
};
const hex = (s) => Buffer.from(s, "utf8").toString("hex");

test("codex: flat proxy credential becomes auth.json's nested shape", () => {
  const out = toCodex(codex, { now: NOW });
  assert.equal(out.auth_mode, "chatgpt");
  assert.equal(out.OPENAI_API_KEY, null);
  assert.equal(out.last_refresh, "2026-11-01T11:00:00Z");
  assert.deepEqual(out.tokens, { access_token: "at-codex-0123456789abcdef", refresh_token: "rt-codex-0123456789abcdef", account_id: "acc-1", id_token: "idt" });
  // Optional fields do not become undefined keys in the JSON.
  const minimal = toCodex({ access_token: "at-0123456789abcdef", refresh_token: "rt-0123456789abcdef", account_id: "acc-2" }, { now: NOW });
  assert.deepEqual(Object.keys(minimal.tokens).sort(), ["access_token", "account_id", "refresh_token"]);
  assert.equal(minimal.last_refresh, NOW.toISOString());
  // And a credential with no account identity is refused rather than written half-usable.
  assert.throws(() => toCodex({ access_token: "at-0123456789abcdef", refresh_token: "rt-0123456789abcdef" }, { now: NOW }), /no account id or id token/);
});

test("claude: proxy credential becomes claudeAiOauth with epoch millis", () => {
  const out = toClaude(claude, { now: NOW, subscriptionType: "max" });   // caller's default when none is given
  assert.equal(out.claudeAiOauth.accessToken, "at-claude-0123456789abcdef01");
  assert.equal(out.claudeAiOauth.refreshToken, "rt-claude-0123456789abcdef01");
  assert.equal(out.claudeAiOauth.expiresAt, Date.parse("2026-11-01T13:00:00Z"));
  assert.equal(out.claudeAiOauth.subscriptionType, "max");   // plan_type absent → the caller's default
  assert.equal(toClaude({ ...claude, plan_type: "pro" }).claudeAiOauth.subscriptionType, "pro");
  assert.equal(out.claudeAiOauth.rateLimitTier, "default");
  assert.ok(out.claudeAiOauth.scopes.includes("user:inference"));
  // A missing expiry falls back to an hour out, never to 1970.
  const noExpiry = toClaude({ access_token: "at-0123456789abcdef", refresh_token: "rt-0123456789abcdef" }, { now: NOW });
  assert.equal(noExpiry.claudeAiOauth.expiresAt, NOW.getTime() + 3600000);
});

test("problems name what is missing, before anything is written", () => {
  assert.deepEqual(problems("codex", codex), []);
  assert.deepEqual(problems("claude", claude), []);
  assert.deepEqual(problems("codex", {}), ["no access token", "no refresh token", "no account id or id token"]);
  assert.deepEqual(problems("claude", { access_token: "at-0123456789abcdef" }), ["no refresh token", "nothing to refresh with"]);
  assert.deepEqual(problems("codex", null), ["the proxy returned no credential"]);
  assert.throws(() => toCodex({ access_token: "" }), /no access token/);
  assert.throws(() => toClaude({}), /no access token/);
});

test("a token-shaped string is required: garbage never becomes a credential the client trusts", () => {
  // Short, whitespace-bearing or non-string values are refused by name, not silently defaulted.
  assert.deepEqual(problems("codex", { access_token: "short", refresh_token: "rt-" + "0".repeat(20), account_id: "a" }),
    ["the access token is not a token"]);
  assert.deepEqual(problems("codex", { access_token: "at-" + "0".repeat(20), refresh_token: "two words here!", account_id: "a" }),
    ["the refresh token is not a token"]);
  assert.throws(() => toClaude({ access_token: "at-" + "0".repeat(20), refresh_token: "x y" }), /not a token/);
  // And a real-looking pair still passes.
  assert.deepEqual(problems("claude", { access_token: "at-" + "0".repeat(24), refresh_token: "rt-" + "0".repeat(24) }), []);
});

test("the write target follows CODEX_HOME and CLAUDE_CONFIG_DIR, and skips the file once the item is written", () => {
  const home = "/Users/ada";
  assert.equal(credentialTarget("codex", { home }).file, "/Users/ada/.codex/auth.json");
  assert.equal(credentialTarget("codex", { home, env: { CODEX_HOME: "/srv/codex/" } }).file, "/srv/codex/auth.json");
  assert.equal(credentialTarget("codex", { home, env: { CODEX_HOME: "" } }).file, "/Users/ada/.codex/auth.json", "empty means default");
  assert.equal(credentialTarget("claude", { home }).file, "/Users/ada/.claude/.credentials.json");
  assert.equal(credentialTarget("claude", { home, env: { CLAUDE_CONFIG_DIR: "~/claude-work" } }).file, "/Users/ada/claude-work/.credentials.json");
  assert.equal(credentialTarget("claude", { home, env: { CODEX_HOME: "/srv/codex" } }).file, "/Users/ada/.claude/.credentials.json", "no mixing");

  // macOS Claude reads the Keychain first: a verified item means the plaintext file is not written.
  assert.equal(credentialTarget("claude", { home, keychainWritten: true }).skipFile, true);
  assert.equal(credentialTarget("claude", { home, keychainWritten: false }).skipFile, false);
  // A separate profile is the file-only route, so its file is always written.
  assert.equal(credentialTarget("claude", { home, keychainWritten: true, env: { CLAUDE_CONFIG_DIR: "/p" } }).skipFile, false);
  // Codex has no item to rely on.
  assert.equal(credentialTarget("codex", { home, keychainWritten: true }).skipFile, false);
  // Elsewhere there is no `security`: the file is the route, never skipped.
  assert.equal(credentialTarget("claude", { home, platform: "linux", keychainWritten: true }).keychain, null);
  assert.equal(credentialTarget("claude", { home, platform: "linux", keychainWritten: true }).skipFile, false);
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

test("the Keychain item is merged, not replaced: other keys survive a switch", () => {
  const existing = JSON.stringify({ claudeAiOauth: { accessToken: "old" }, mcpOAuth: { "srv": { token: "mcp" } }, theme: "dark" });
  const { claudeAiOauth } = toClaude(claude, { now: NOW });
  const incoming = JSON.stringify({ claudeAiOauth });
  const merged = JSON.parse(mergeCredentialItem(existing, incoming));
  assert.deepEqual(merged.claudeAiOauth, claudeAiOauth, "the fresh tokens win");
  assert.deepEqual(merged.mcpOAuth, { "srv": { token: "mcp" } }, "an MCP token is not wiped by a quota switch");
  assert.equal(merged.theme, "dark");
  assert.ok(!mergeCredentialItem(existing, incoming).includes("\n"), "one line, as the Keychain step requires");

  // An item that is not a JSON object has no keys to keep.
  assert.equal(mergeCredentialItem("not json", incoming), incoming);
  assert.equal(mergeCredentialItem(null, incoming), incoming);
  assert.equal(mergeCredentialItem("[]", incoming), incoming);
});

test("merge: a kept key with a non-ASCII name survives byte-for-byte", () => {
  // The item can come back as hex (it holds 0x0a); the kept key is not ASCII. Decoding the bytes
  // one-per-character would rewrite "café" as "cafÃ©" — a key the CLI never reads again.
  const existing = JSON.stringify({ claudeAiOauth: { accessToken: "old" }, mcpOAuth: { "café": { token: "mcp" } } });
  const incoming = JSON.stringify({ claudeAiOauth: toClaude(claude, { now: NOW }).claudeAiOauth });
  const merged = JSON.parse(mergeCredentialItem(hex(existing), incoming));
  assert.deepEqual(merged.mcpOAuth, { "café": { token: "mcp" } });
  assert.equal(merged.claudeAiOauth.accessToken, claude.access_token);
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
