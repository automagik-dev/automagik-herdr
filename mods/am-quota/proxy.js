// am-quota's reader: the proxy's own endpoints, turned into the accounts `policy.choose` reads.
//
// Pure parsing plus a small client that takes its `fetch` and key from the caller, so tests need
// no network and the management key never travels in a URL, a log line or `argv`.
//
// Shapes, measured against a live proxy (2026-11-01):
//   GET <base>/v0/management/plugins/cpa-quota-api-extension/v1/quotas
//     { accounts: [{ auth_index, name, provider, credential_state, status, supported,
//                    windows: [{ id, used_percent, remaining_percent, reset_at }] }] }
//   GET <base>/v8/management/credentials
//     { files: [{ name, provider, status, disabled, requires_sign_in, failed, path,
//                 access_token_expires_at, quota: { signals } }] }
//   GET <base>/v8/management/credentials/download?name=<file>   → the credential JSON itself

export const QUOTA_EXTENSION = "/v0/management/plugins/cpa-quota-api-extension/v1";
const CREDENTIALS = "/v8/management/credentials";

/** A credential name we will ask for: a plain file name, never a path. */
export function safeName(name) {
  const s = typeof name === "string" ? name.trim() : "";
  if (!s || s.includes("/") || s.includes("\\") || s === "." || s === ".." || s.includes("\0")) return null;
  return s;
}

const share = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The quota extension's list → one entry per credential, windows normalized. */
export function parseQuotas(json) {
  const rows = Array.isArray(json?.accounts) ? json.accounts : [];
  return rows.map((row) => ({
    id: safeName(row?.name) ?? row?.auth_index ?? null,
    name: row?.name ?? null,
    provider: row?.provider ?? null,
    authIndex: row?.auth_index ?? null,
    credentialState: row?.credential_state ?? null,
    status: row?.status ?? null,
    supported: row?.supported !== false,
    fetchedAt: Number.isFinite(Date.parse(row?.fetched_at)) ? Date.parse(row.fetched_at) : null,
    windows: (Array.isArray(row?.windows) ? row.windows : []).map((w) => ({
      id: typeof w?.id === "string" ? w.id : null,
      used_percent: share(w?.used_percent),
      remaining_percent: share(w?.remaining_percent),
      reset_at: typeof w?.reset_at === "string" ? w.reset_at : null,
    })).filter((w) => w.id && w.used_percent !== null),
  })).filter((row) => row.id);
}

/** The management API's credential list → the flags `policy.usable` reads. */
export function parseCredentials(json) {
  const rows = Array.isArray(json?.files) ? json.files : [];
  return rows.map((row) => ({
    id: safeName(row?.name) ?? null,
    name: row?.name ?? null,
    provider: row?.provider ?? null,
    status: row?.status ?? null,
    disabled: Boolean(row?.disabled),
    failed: Boolean(row?.failed),
    requiresSignIn: Boolean(row?.requires_sign_in),
    credentialState: row?.credential_state ?? null,
    expiresAt: typeof row?.access_token_expires_at === "string" ? row.access_token_expires_at : null,
    path: typeof row?.path === "string" ? row.path : null,
  })).filter((row) => row.id);
}

/**
 * Both lists, joined by credential name, in the shape `policy.choose` expects. A credential only
 * the management API knows (no window yet) is kept: `choose` treats no window as "nothing to
 * project", and the panel still shows the account.
 */
export function mergeAccounts(quotas, credentials) {
  const byName = new Map(credentials.map((c) => [c.id, c]));
  const out = [];
  for (const q of quotas) {
    const c = byName.get(q.id) ?? {};
    out.push({
      id: q.id,
      name: q.name ?? c.name ?? q.id,
      provider: q.provider ?? c.provider ?? null,
      status: c.status ?? q.status ?? null,
      disabled: Boolean(c.disabled),
      failed: Boolean(c.failed),
      requires_sign_in: Boolean(c.requiresSignIn),
      credential_state: c.credentialState ?? q.credentialState ?? null,
      access_token_expires_at: c.expiresAt ?? null,
      path: c.path ?? null,
      fetched_at: q.fetchedAt ?? null,
      windows: q.windows,
    });
    byName.delete(q.id);
  }
  for (const c of byName.values()) {
    out.push({
      id: c.id,
      name: c.name ?? c.id,
      provider: c.provider ?? null,
      status: c.status ?? null,
      disabled: c.disabled,
      failed: c.failed,
      requires_sign_in: c.requiresSignIn,
      credential_state: c.credentialState,
      access_token_expires_at: c.expiresAt,
      path: c.path,
      fetched_at: null,
      windows: [],
    });
  }
  return out;
}

/**
 * The previous reading of each window, carried forward so `choose` can project a burn rate.
 *
 * `prior` is what the last call returned as `samples`; `accounts` is one snapshot from `mergeAccounts`.
 * Each account keeps the last reading of each window id, but only while `reset_at` is the same —
 * after a reset the old reading says nothing about the new window. A snapshot no newer than the
 * stored one (the proxy's `fetched_at` can repeat between two polls) does not replace it, so a slow
 * feed still yields an interval to measure instead of overwriting the only sample.
 *
 * Returns `{ accounts, samples }`: `accounts` with `previous` attached where a usable pair exists,
 * `samples` for the next call.
 */
export function carrySamples(accounts, prior = {}, { now = Date.now() } = {}) {
  const samples = {};
  const out = (accounts ?? []).map((account) => {
    const at = Number.isFinite(account?.fetched_at) ? account.fetched_at : now;
    const previous = {};
    const snap = {};
    for (const win of account.windows ?? []) {
      if (typeof win?.id !== "string") continue;
      const stored = prior?.[account.id]?.[win.id];
      const sameWindow = stored && String(stored.reset_at ?? "") === String(win.reset_at ?? "");
      if (sameWindow && Number.isFinite(stored.at) && at > stored.at) {
        previous[win.id] = { used_percent: stored.used_percent, at: stored.at };
        snap[win.id] = { used_percent: win.used_percent, at, reset_at: win.reset_at ?? null };
      } else if (sameWindow && Number.isFinite(stored.at)) {
        snap[win.id] = stored;   // nothing newer to store: keep the interval's first end
      } else {
        snap[win.id] = { used_percent: win.used_percent, at, reset_at: win.reset_at ?? null };
      }
    }
    if (Object.keys(snap).length) samples[account.id] = snap;
    return Object.keys(previous).length ? { ...account, previous } : account;
  });
  return { accounts: out, samples };
}

/**
 * Holds the panel's samples across polls. One instance per view: `read` is the whole of the
 * panel's involvement, and the same call is what the tests exercise.
 */
export class QuotaSampler {
  constructor() {
    this.samples = {};
  }

  read(accounts, { now = Date.now() } = {}) {
    const { accounts: out, samples } = carrySamples(accounts, this.samples, { now });
    this.samples = samples;
    return out;
  }
}

/** How long one request may take. A hung answer must not leave the panel — or a switch, which is
 *  `busy` until its download settles — waiting forever. */
export const REQUEST_TIMEOUT = 30000;

/**
 * A 30 s timeout for one request. `AbortSignal.timeout` where the runtime has it; otherwise an
 * `AbortController` and a timer, so no runtime ends up with no timeout at all. `done()` clears the
 * timer and must be called when the request settles.
 */
const abortSignal = () => {
  try {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      return { signal: AbortSignal.timeout(REQUEST_TIMEOUT), done: () => {} };
    }
  } catch {}
  try {
    if (typeof AbortController === "function") {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      return { signal: controller.signal, done: () => clearTimeout(timer) };
    }
  } catch {}
  return { signal: undefined, done: () => {} };
};

/**
 * The client the panel uses. `fetch` is injected (the mod's global fetch, a test's double), `key`
 * is the management key the caller read from a file or the environment — never passed in a URL.
 */
export function client({ base, key, fetch }) {
  // HTTPS only, so the key and the downloaded credential never travel in cleartext. Plain http is
  // allowed for loopback alone (a proxy on this machine). The URL is not echoed: it can carry
  // userinfo or a query with a key.
  const LOCAL = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i;
  if (!String(base ?? "").startsWith("https://") && !LOCAL.test(String(base ?? ""))) {
    throw new Error("am-quota: the base URL must be https (http is allowed only for localhost)");
  }
  if (!key) throw new Error("am-quota: no management key");
  const root = base.replace(/\/+$/, "");

  const get = async (path) => {
    const timeout = abortSignal();
    try {
      const res = await fetch(`${root}${path}`, {
        headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
        ...(timeout.signal ? { signal: timeout.signal } : {}),
      });
      if (!res || res.status !== 200) throw new Error(`am-quota: ${path} answered ${res?.status ?? "nothing"}`);
      try {
        return await res.json();
      } catch {
        throw new Error(`am-quota: ${path} answered with something that is not JSON`);
      }
    } finally {
      timeout.done();
    }
  };

  return {
    /**
     * Every credential with its windows, ready for `choose`, and what went wrong with the quota
     * read. Without the extension the accounts are still listed, but they have no windows — the
     * caller shows the error line rather than a panel full of "no window".
     */
    async accounts() {
      let quotaError = null;
      const [quotas, credentials] = await Promise.all([
        get(`${QUOTA_EXTENSION}/quotas`).catch((err) => {
          quotaError = String(err?.message ?? "the quota extension did not answer");
          return { accounts: [] };
        }),
        get(CREDENTIALS),
      ]);
      return { accounts: mergeAccounts(parseQuotas(quotas), parseCredentials(credentials)), quotaError };
    },
    /** The credential file's text, asked for by name; the caller writes it, never this module. */
    async credential(name) {
      const safe = safeName(name);
      if (!safe) throw new Error("am-quota: that is not a credential name");
      const timeout = abortSignal();
      try {
        const res = await fetch(`${root}${CREDENTIALS}/download?name=${encodeURIComponent(safe)}`, {
          headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          ...(timeout.signal ? { signal: timeout.signal } : {}),
        });
        if (!res || res.status !== 200) throw new Error(`am-quota: ${safe} answered ${res?.status ?? "nothing"}`);
        return await res.text();
      } finally {
        timeout.done();
      }
    },
  };
}
