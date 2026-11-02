// am-quota's reader, tested against the shapes the proxy actually returns (fixtures below were
// copied from live responses, with values changed). No network here: `fetch` is a double.
import test from "node:test";
import assert from "node:assert/strict";

import { client, parseQuotas, parseCredentials, mergeAccounts, safeName, QuotaSampler, REQUEST_TIMEOUT } from "../mods/am-quota/proxy.js";
import { choose } from "../mods/am-quota/policy.js";

const NOW = Date.parse("2026-11-01T12:00:00Z");

const QUOTAS = {
  accounts: [
    {
      auth_index: "a1", name: "claude-15baa1dd-x.json", provider: "claude",
      credential_state: "active", status: "active", supported: true, fetched_at: "2026-11-01T11:59:00Z",
      windows: [
        { id: "seven_day", used_percent: 100, remaining_percent: 1, reset_at: "2026-11-04T12:59:59Z" },
        { id: "five_hour", used_percent: 40, remaining_percent: 60, reset_at: "2026-11-01T15:00:00Z" },
      ],
    },
    {
      auth_index: "c1", name: "codex-052d99cd-x.json", provider: "codex",
      credential_state: "active", status: "active", supported: true,
      windows: [{ id: "primary", used_percent: 31, remaining_percent: 69, reset_at: "2026-11-04T06:42:00Z" }],
    },
    { name: "../escape.json", provider: "claude", windows: [] },
  ],
};

const CREDENTIALS = {
  files: [
    { name: "claude-15baa1dd-x.json", provider: "claude", status: "active", path: "/var/lib/cliproxyapi/auths/claude-15baa1dd-x.json", access_token_expires_at: "2026-11-01T13:00:00Z" },
    { name: "codex-052d99cd-x.json", provider: "codex", status: "active" },
    { name: "claude-disabled.json", provider: "claude", status: "disabled", disabled: true },
    { name: "codex-signin.json", provider: "codex", requires_sign_in: true },
  ],
};

test("a credential name is a name, never a path", () => {
  assert.equal(safeName("codex-abc.json"), "codex-abc.json");
  assert.equal(safeName("  spaced.json "), "spaced.json");
  for (const bad of ["../x.json", "a/b.json", "a\\b.json", ".", "..", "", null, 42]) assert.equal(safeName(bad), null, String(bad));
});

test("parseQuotas keeps real windows and drops the unusable rows", () => {
  const rows = parseQuotas(QUOTAS);
  assert.equal(rows.length, 2, "the traversal name is refused");
  const claude = rows[0];
  assert.equal(claude.id, "claude-15baa1dd-x.json");
  assert.equal(claude.windows.length, 2);
  assert.deepEqual(claude.windows[0], { id: "seven_day", used_percent: 100, remaining_percent: 1, reset_at: "2026-11-04T12:59:59Z" });
  assert.equal(claude.fetchedAt, Date.parse("2026-11-01T11:59:00Z"));
  // A window without a usable percentage is not a window.
  const partial = parseQuotas({ accounts: [{ name: "x.json", windows: [{ id: "w" }, { id: "keep", used_percent: 5 }] }] });
  assert.equal(partial[0].windows.length, 1);
});

test("parseCredentials reads the flags policy relies on", () => {
  const rows = parseCredentials(CREDENTIALS);
  assert.equal(rows.length, 4);
  const disabled = rows.find((r) => r.id === "claude-disabled.json");
  assert.equal(disabled.disabled, true);
  assert.equal(disabled.status, "disabled");
  const signin = rows.find((r) => r.id === "codex-signin.json");
  assert.equal(signin.requiresSignIn, true);
  assert.equal(rows[0].path, "/var/lib/cliproxyapi/auths/claude-15baa1dd-x.json");
});

test("mergeAccounts joins the two lists into what choose() reads", () => {
  const accounts = mergeAccounts(parseQuotas(QUOTAS), parseCredentials(CREDENTIALS));
  assert.equal(accounts.length, 4, "two with windows, two the management API alone knows");

  const claude = accounts.find((a) => a.id === "claude-15baa1dd-x.json");
  assert.equal(claude.provider, "claude");
  assert.equal(claude.windows.length, 2);
  assert.equal(claude.access_token_expires_at, "2026-11-01T13:00:00Z");
  assert.equal(claude.fetched_at, Date.parse("2026-11-01T11:59:00Z"));

  const signin = accounts.find((a) => a.id === "codex-signin.json");
  assert.deepEqual(signin.windows, []);
  assert.equal(signin.requires_sign_in, true);

  // And the policy reads them without further shaping: the exhausted claude hands off to codex.
  const d = choose(accounts.filter((a) => a.provider === "claude" && a.windows.length).map((a) => ({
    ...a, previous: { seven_day: { used_percent: 90, at: NOW - 3600000 } },
  })), { provider: "claude", now: NOW, activeId: "claude-15baa1dd-x.json" });
  assert.equal(d.action, "none", "the only other claude credential has no window and no headroom facts");
  const mixed = choose(accounts, { provider: "claude", now: NOW, activeId: "claude-15baa1dd-x.json" });
  assert.equal(mixed.action, "none", "no usable claude alternative in this fixture");
});

test("the client asks the right URLs and keeps the key out of them", async () => {
  const seen = [];
  const fetch = async (url, options) => {
    seen.push({ url, auth: options?.headers?.Authorization });
    if (url.includes("/v1/quotas")) return { status: 200, json: async () => QUOTAS };
    if (url.endsWith("/credentials")) return { status: 200, json: async () => CREDENTIALS };
    if (url.includes("/credentials/download")) return { status: 200, text: async () => '{"access_token":"x"}' };
    return { status: 404, json: async () => ({}) };
  };
  const c = client({ base: "https://proxy.example/", key: "SECRET", fetch });
  const { accounts, quotaError } = await c.accounts();
  assert.equal(accounts.length, 4);
  assert.equal(quotaError, null, "the quota extension answered");
  assert.ok(seen.every((s) => s.auth === "Bearer SECRET"));
  assert.ok(seen.every((s) => !s.url.includes("SECRET")), "the key never rides in a URL");
  assert.ok(seen.some((s) => s.url === "https://proxy.example/v8/management/credentials"), "no double slash");

  const text = await c.credential("codex-052d99cd-x.json");
  assert.match(text, /access_token/);
  await assert.rejects(() => c.credential("../etc/passwd"), /not a credential name/);
});

test("an unreachable quota extension still yields the management API's accounts, and says why", async () => {
  const fetch = async (url) => {
    if (url.includes("/v1/quotas")) throw new Error("network down");
    if (url.endsWith("/credentials")) return { status: 200, json: async () => CREDENTIALS };
    return { status: 404, json: async () => ({}) };
  };
  const { accounts, quotaError } = await client({ base: "https://p.example", key: "k", fetch }).accounts();
  assert.equal(accounts.length, 4);
  assert.ok(accounts.every((a) => a.windows.length === 0));
  assert.match(quotaError, /network down/, "the panel can show an error line instead of 'no window'");
});

test("every request carries a 30 s abort signal, and a runtime without AbortSignal.timeout still works", async () => {
  assert.equal(REQUEST_TIMEOUT, 30000, "a hang cannot hold a switch's busy flag, or the panel, open");
  const seen = [];
  const fetch = async (url, options) => {
    seen.push(options?.signal);
    if (url.endsWith("/credentials")) return { status: 200, json: async () => CREDENTIALS };
    if (url.includes("/v1/quotas")) return { status: 200, json: async () => QUOTAS };
    return { status: 200, text: async () => "{}" };
  };
  const c = client({ base: "https://p.example", key: "k", fetch });
  await c.accounts();
  await c.credential("codex-052d99cd-x.json");
  assert.equal(seen.length, 3);
  for (const signal of seen) {
    assert.ok(signal instanceof AbortSignal, "a real signal, not a bare option");
    assert.equal(signal.aborted, false);
  }

  // The guard: a runtime without AbortSignal.timeout gets no signal, not a crash.
  const saved = AbortSignal.timeout;
  try {
    delete AbortSignal.timeout;
    seen.length = 0;
    await client({ base: "https://p.example", key: "k", fetch }).credential("codex-052d99cd-x.json");
    assert.equal(seen[0], undefined);
  } finally {
    AbortSignal.timeout = saved;
  }
});

test("the client refuses to exist without a base and a key", () => {
  assert.throws(() => client({ base: "ftp://x", key: "k", fetch: async () => ({}) }), /must be https/);
  // Plain http is a downgrade: the key and the credential would travel in cleartext.
  assert.throws(() => client({ base: "http://proxy.example/", key: "k", fetch: async () => ({}) }), /must be https/);
  // …except on loopback, where the proxy is this machine.
  assert.doesNotThrow(() => client({ base: "http://127.0.0.1:8317", key: "k", fetch: async () => ({}) }));
  assert.doesNotThrow(() => client({ base: "http://localhost:8317/", key: "k", fetch: async () => ({}) }));
  assert.throws(() => client({ base: "https://x", key: "", fetch: async () => ({}) }), /no management key/);
});

test("a base URL carrying userinfo is never echoed back into an error", () => {
  try {
    client({ base: "https://user:hunter2@proxy.example/", key: "k", fetch: async () => ({}) });
  } catch {}
  try {
    client({ base: "http://user:hunter2@proxy.example/", key: "k", fetch: async () => ({}) });
    assert.fail("should have refused http");
  } catch (err) {
    assert.ok(!String(err.message).includes("hunter2"), "the URL's credentials stay out of the message");
  }
});

test("a response that is not JSON is named, not parsed into an error that quotes it", async () => {
  const fetch = async () => ({ status: 200, json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0: "<html>TOKEN-LEAK</html>"'); } });
  const c = client({ base: "https://p.example", key: "k", fetch });
  await assert.rejects(c.accounts(), (err) => {
    assert.match(err.message, /not JSON/);
    assert.ok(!err.message.includes("TOKEN-LEAK"), "the body never reaches the message");
    return true;
  });
});

test("two polls through the proxy give the policy a burn rate, so the projection fires", () => {
  const credentials = {
    files: [
      { name: "claude-a.json", provider: "claude", status: "active" },
      { name: "claude-b.json", provider: "claude", status: "active" },
    ],
  };
  // Only the quota extension knows fetched_at; that timestamp is the sample's other end.
  const snapshot = (at, usedA) => ({
    accounts: [
      { name: "claude-a.json", provider: "claude", status: "active", fetched_at: at,
        windows: [{ id: "seven_day", used_percent: usedA, reset_at: "2026-11-04T12:00:00Z" }] },
      { name: "claude-b.json", provider: "claude", status: "active", fetched_at: at,
        windows: [{ id: "seven_day", used_percent: 10, reset_at: "2026-11-03T12:00:00Z" }] },
    ],
  });
  // The panel's path: the client's merged accounts, then the sampler, then choose — no injected
  // `previous` anywhere.
  const sampler = new QuotaSampler();
  const read = (at, usedA) => sampler.read(mergeAccounts(parseQuotas(snapshot(at, usedA)), parseCredentials(credentials)));

  const first = read("2026-11-02T10:00:00Z", 60);
  const quiet = choose(first, { provider: "claude", now: Date.parse("2026-11-02T10:00:00Z"), activeId: "claude-a.json" });
  assert.equal(quiet.action, "keep", "one sample is not a rate");
  assert.equal(quiet.facts.find((f) => f.id === "claude-a.json").burnPerHour, null);

  // A poll inside the proxy's own refresh repeats fetched_at: that must not overwrite the sample.
  read("2026-11-02T10:00:00Z", 61);

  const second = read("2026-11-02T12:00:00Z", 80);
  const a = second.find((x) => x.id === "claude-a.json");
  assert.equal(a.previous.seven_day.used_percent, 60, "the interval starts at the first real sample");
  const d = choose(second, { provider: "claude", now: Date.parse("2026-11-02T12:00:00Z"), activeId: "claude-a.json" });
  assert.equal(d.action, "switch", "20 points in 2h is dry long before a 48h reset");
  assert.equal(d.to, "claude-b.json");
});

test("a window that reset between polls is a new window, not a negative burn", () => {
  const q = (at, used, reset) => ({ accounts: [{ name: "x.json", provider: "claude", fetched_at: at, windows: [{ id: "day", used_percent: used, reset_at: reset }] }] });
  const sampler = new QuotaSampler();
  const first = sampler.read(parseQuotas(q("2026-11-02T10:00:00Z", 90, "2026-11-02T12:00:00Z")), { now: Date.parse("2026-11-02T10:00:00Z") });
  assert.equal(first.length, 1);
  const second = sampler.read(parseQuotas(q("2026-11-02T12:01:00Z", 2, "2026-11-03T12:00:00Z")), { now: Date.parse("2026-11-02T12:01:00Z") });
  assert.equal(second[0].previous, undefined, "the old reading belongs to a window that is gone");
  const d = choose(second, { provider: "claude", now: Date.parse("2026-11-02T12:01:00Z"), activeId: "x.json" });
  assert.equal(d.action, "keep", "no projection from a stale window");
});
