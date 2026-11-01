// am-quota's translations: the proxy's credential shape → the shape each client actually reads.
//
// Pure, so `node --test` proves them. The measured shapes (2026-11-01):
//   proxy codex  { access_token, account_id, id_token, refresh_token, expired, email, last_refresh, plan_type }
//   codex auth   { OPENAI_API_KEY: null, auth_mode: "chatgpt", last_refresh, tokens: { access_token,
//                  account_id, id_token, login_owner_id?, oauth_provenance?, refresh_token } }
//   proxy claude { access_token, refresh_token, expired, account_uuid, organization_uuid,
//                  organization_name, email, claude_device_ids, last_refresh }
//   claude creds { claudeAiOauth: { accessToken, refreshToken, expiresAt, refreshTokenExpiresAt,
//                  scopes, subscriptionType, rateLimitTier } }

const str = (v) => (typeof v === "string" ? v.trim() : "");
/** A token is opaque, but it is not arbitrary text: no whitespace, and long enough to be one. */
const isToken = (v) => { const s = str(v); return s.length >= 16 && !/\s/.test(s); };
const epochMs = (v, fallback) => {
  if (typeof v === "number" && Number.isFinite(v)) return v > 1e12 ? Math.round(v) : Math.round(v * 1000);
  if (typeof v === "string" && v) {
    const ms = Date.parse(v);
    if (Number.isFinite(ms)) return ms;
  }
  return fallback;
};

/** What stops a credential from being installed at all, for people. */
export function problems(provider, credential) {
  const out = [];
  if (!credential || typeof credential !== "object") return ["the proxy returned no credential"];
  if (!isToken(credential.access_token)) out.push(str(credential.access_token) ? "the access token is not a token" : "no access token");
  if (!isToken(credential.refresh_token)) out.push(str(credential.refresh_token) ? "the refresh token is not a token" : "no refresh token");
  if (provider === "codex" && !str(credential.account_id) && !str(credential.id_token)) out.push("no account id or id token");
  if (provider === "claude" && !str(credential.refresh_token)) out.push("nothing to refresh with");
  return out;
}

/** The proxy's Codex credential, as `~/.codex/auth.json` expects it. */
export function toCodex(credential, { now = new Date() } = {}) {
  const missing = problems("codex", credential);
  if (missing.length) throw new Error(missing.join("; "));
  const tokens = {
    access_token: str(credential.access_token),
    refresh_token: str(credential.refresh_token),
    account_id: str(credential.account_id) || undefined,
    id_token: str(credential.id_token) || undefined,
  };
  for (const key of Object.keys(tokens)) if (tokens[key] === undefined) delete tokens[key];
  return {
    OPENAI_API_KEY: null,
    auth_mode: "chatgpt",
    last_refresh: (typeof credential.last_refresh === "string" && credential.last_refresh) || now.toISOString(),
    tokens,
  };
}

/** The proxy's Claude credential, as the Keychain item / `.credentials.json` expects it. */
export function toClaude(credential, { now = new Date(), scopes, subscriptionType = "pro" } = {}) {
  const missing = problems("claude", credential);
  if (missing.length) throw new Error(missing.join("; "));
  const hour = 3600000;
  return {
    claudeAiOauth: {
      accessToken: str(credential.access_token),
      refreshToken: str(credential.refresh_token),
      expiresAt: epochMs(credential.expired ?? credential.expires_at, now.getTime() + hour),
      refreshTokenExpiresAt: epochMs(credential.refresh_token_expired, now.getTime() + 30 * 24 * hour),
      scopes: Array.isArray(scopes) && scopes.length ? scopes : ["user:inference", "user:profile"],
      subscriptionType: str(credential.plan_type) || subscriptionType,
      rateLimitTier: str(credential.rate_limit_tier) || "default",
    },
  };
}

/** A directory from an environment variable, `~` expanded, no trailing slash. */
const envDir = (value, fallback, home) => {
  const s = typeof value === "string" ? value.trim() : "";
  const p = !s ? fallback : s === "~" ? home : s.startsWith("~/") ? `${home}${s.slice(1)}` : s;
  return p.replace(/\/+$/, "") || "/";
};

/**
 * Where a provider's credentials go, and how they are written. Used by the panel's writer.
 * `env` is the client's own environment, so `CODEX_HOME` and `CLAUDE_CONFIG_DIR` move the file the
 * way they move it for the client itself; an unset or empty variable means the default folder.
 */
export const TARGETS = {
  codex: {
    label: "Codex",
    keychain: null,
    file: (home, env = {}) => `${envDir(env.CODEX_HOME, `${home}/.codex`, home)}/auth.json`,
  },
  claude: {
    label: "Claude Code",
    keychain: "Claude Code-credentials",
    file: (home, env = {}) => `${envDir(env.CLAUDE_CONFIG_DIR, `${home}/.claude`, home)}/.credentials.json`,
  },
};

/**
 * One provider's write plan: the file, the Keychain service (if any), and whether the plaintext
 * file is skipped. On macOS Claude reads the Keychain first, so a verified Keychain write is the
 * whole job and the file — with its backups — is left alone; elsewhere (no `security`) the file is
 * the route. A `CLAUDE_CONFIG_DIR` is the file-only route (a separate Claude profile), so its file
 * is always written.
 */
export function credentialTarget(provider, { home, env = {}, keychainWritten = false, platform = "macos" } = {}) {
  const target = TARGETS[provider];
  if (!target) return null;
  const keychain = platform === "macos" ? target.keychain : null;
  return {
    label: target.label,
    keychain,
    file: target.file(home, env),
    skipFile: Boolean(keychain) && keychainWritten && !str(env.CLAUDE_CONFIG_DIR),
  };
}

/**
 * The text of a Keychain item as `security find-generic-password -w` printed it: the value itself
 * when it holds no 0x0a, its hex when it does (the stored bytes are right either way). Null when
 * neither reading is JSON.
 */
export function itemText(raw) {
  const s = typeof raw === "string" ? raw.replace(/\n+$/, "") : "";
  if (!s) return null;
  const isJson = (v) => { try { JSON.parse(v); return true; } catch { return false; } };
  if (isJson(s)) return s;
  if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) {
    let out = "";
    for (let i = 0; i < s.length; i += 2) out += String.fromCharCode(parseInt(s.slice(i, i + 2), 16));
    if (isJson(out)) return out;
  }
  return null;
}

/**
 * The item to store: the new `claudeAiOauth` over whatever else the item holds (`mcpOAuth` and
 * anything else the CLI keeps there), one line. An item that is not a JSON object has no keys to
 * keep, so it is replaced. Neither value is ever logged.
 */
export function mergeCredentialItem(existingText, incoming) {
  const fresh = typeof incoming === "string" ? incoming : JSON.stringify(incoming);
  const prev = itemText(existingText);
  if (!prev) return JSON.stringify(JSON.parse(fresh));
  const kept = JSON.parse(prev);
  if (!kept || typeof kept !== "object" || Array.isArray(kept)) return JSON.stringify(JSON.parse(fresh));
  return JSON.stringify({ ...kept, claudeAiOauth: JSON.parse(fresh)?.claudeAiOauth ?? kept.claudeAiOauth });
}

/** A stable 32-bit fingerprint (FNV-1a) of a token: an identity to compare, never the token. */
export function fingerprint(value) {
  const s = typeof value === "string" ? value : "";
  if (!s) return null;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/**
 * The installed credential's identity, from the file or item. Codex carries `account_id`, which a
 * token refresh does not change; a Claude item holds only tokens, so its identity is the refresh
 * token — a refresh there looks like a change, which is why the panel names it rather than guessing.
 */
export function tokenIdentity(provider, text) {
  const body = itemText(text);
  if (!body) return null;
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const token = provider === "codex"
    ? str(parsed?.tokens?.account_id) || str(parsed?.tokens?.refresh_token)
    : str(parsed?.claudeAiOauth?.refreshToken);
  return fingerprint(token);
}
