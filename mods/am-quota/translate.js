// am-quota's read side: where each client keeps its credentials, what the installed one says, and
// the text `security` hands back.
//
// Pure, so `node --test` proves it — except `keychainService`, which shells out to `shasum` for the
// digest the CLI names a separate profile's Keychain item with (the mod has no crypto module).
// The measured shapes (2026-11-01) — the switch's translation of them lives with the switch:
//   proxy codex  { access_token, account_id, id_token, refresh_token, expired, email, last_refresh, plan_type }
//   codex auth   { OPENAI_API_KEY: null, auth_mode: "chatgpt", last_refresh, tokens: { access_token,
//                  account_id, id_token, login_owner_id?, oauth_provenance?, refresh_token } }
//   proxy claude { access_token, refresh_token, expired, account_uuid, organization_uuid,
//                  organization_name, email, claude_device_ids, last_refresh }
//   claude creds { claudeAiOauth: { accessToken, refreshToken, expiresAt, refreshTokenExpiresAt,
//                  scopes, subscriptionType, rateLimitTier } }

const str = (v) => (typeof v === "string" ? v.trim() : "");
/** A directory from an environment variable, `~` expanded, no trailing slash. */
const envDir = (value, fallback, home) => {
  const s = typeof value === "string" ? value.trim() : "";
  const p = !s ? fallback : s === "~" ? home : s.startsWith("~/") ? `${home}${s.slice(1)}` : s;
  return p.replace(/\/+$/, "") || "/";
};

/**
 * Where a provider's credentials go, and how they are read. Used by the panel to find the file or
 * the item that says which account is installed.
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
 * One provider's credential target: the file, and the Keychain service (if any). On macOS Claude
 * reads the Keychain first, so its item is what says which account is installed; elsewhere (no
 * `security`) the file is the answer. A `CLAUDE_CONFIG_DIR` is a separate Claude profile: its
 * Keychain item is the suffixed one (`keychainSuffix`), which is why `keychain` alone is never the
 * service to hand `security` — see `keychainService`.
 */
export function credentialTarget(provider, { home, env = {}, platform = "macos" } = {}) {
  const target = TARGETS[provider];
  if (!target) return null;
  const keychain = platform === "macos" ? target.keychain : null;
  return {
    label: target.label,
    keychain,
    keychainSuffix: Boolean(keychain) && Boolean(str(env.CLAUDE_CONFIG_DIR)),
    file: target.file(home, env),
  };
}

/**
 * The service name a separate profile's item is called: `Claude Code-credentials-<sha256(dir)[:8]>`.
 * Measured on the installed CLI 2.1.316: with `CLAUDE_CONFIG_DIR=/tmp/cc-scratch` it ran
 * `find-generic-password … -s "Claude Code-credentials-bde599a8"` (then the legacy
 * `Claude Code-bde599a8`), and `sha256("/tmp/cc-scratch")[:8]` is `bde599a8`. The directory is
 * digested exactly as given — no `~` expansion, no trailing-slash trimming — because that is what
 * the CLI digests.
 *
 * The digest is computed in the shell (`shasum -a 256`), so this is a pure string; `$1` is the
 * base service name, which is not a secret. The directory is read from the environment in-shell.
 * Exit 1 when the digest cannot be computed or the variable is empty (the caller only runs this
 * when a profile is set, so an empty answer means the environment moved: never guess).
 */
export function keychainServiceScript() {
  return `set -eu
dir=$(printenv CLAUDE_CONFIG_DIR) || dir=""
[ -n "$dir" ] || exit 1
if command -v shasum >/dev/null 2>&1; then sum=$(printf '%s' "$dir" | shasum -a 256 | cut -c1-8)
elif command -v sha256sum >/dev/null 2>&1; then sum=$(printf '%s' "$dir" | sha256sum | cut -c1-8)
else exit 1; fi
printf '%s-%s' "$1" "$sum"`;
}

/**
 * The Keychain service this plan reads and writes. A separate profile's item is the suffixed one:
 * writing the unsuffixed `Claude Code-credentials` there would REPLACE the person's default-profile
 * login, so with `CLAUDE_CONFIG_DIR` set that name is never returned. Null when the service cannot
 * be resolved — a read is then "unknown" and a write refuses, rather than falling back to the
 * default item.
 */
export async function keychainService(plan, { exec } = {}) {
  if (!plan?.keychain) return null;
  if (!plan.keychainSuffix) return plan.keychain;
  const r = await exec("sh", ["-c", keychainServiceScript(), "sh", plan.keychain]);
  const name = r?.code === 0 ? String(r.stdout ?? "").trim() : "";
  return name.startsWith(`${plan.keychain}-`) ? name : null;
}

/** The item's value as `security` prints it (plain, or hex when it holds 0x0a). Read-only, for
 *  comparing what is installed with what this panel wrote; the caller never logs it. */
export function keychainReadScript() {
  return `set -eu
security find-generic-password -w -s "$1"`;
}

/**
 * UTF-8 text from a hex string of bytes, or null when the string is not whole bytes of hex.
 * `security find-generic-password -w` prints hex when the value holds 0x0a, and a byte is not a
 * character: `String.fromCharCode` would turn `Café` into `CafÃ©`. Malformed sequences decode to
 * U+FFFD, as a `TextDecoder` does; nothing throws.
 */
export function hexToUtf8(hex) {
  if (typeof hex !== "string" || !/^(?:[0-9a-fA-F]{2})*$/.test(hex)) return null;
  const s = hex;
  let out = "";
  let i = 0;
  const at = (k) => parseInt(s.slice(k, k + 2), 16);
  while (i < s.length) {
    const b = at(i);
    i += 2;
    if (b < 0x80) { out += String.fromCharCode(b); continue; }
    let need;
    let cp;
    if (b >= 0xc2 && b <= 0xdf) { need = 1; cp = b & 0x1f; }
    else if (b >= 0xe0 && b <= 0xef) { need = 2; cp = b & 0x0f; }
    else if (b >= 0xf0 && b <= 0xf4) { need = 3; cp = b & 0x07; }
    else { out += "\ufffd"; continue; }
    if (i + need * 2 > s.length) { out += "\ufffd"; break; }
    let ok = true;
    for (let k = 0; k < need; k++) {
      const c = at(i + k * 2);
      if ((c & 0xc0) !== 0x80) { ok = false; break; }
      cp = (cp << 6) | (c & 0x3f);
    }
    if (!ok) { out += "\ufffd"; continue; }   // the offending byte is read again, as its own sequence
    i += need * 2;
    const overlong = (need === 1 && cp < 0x80) || (need === 2 && cp < 0x800) || (need === 3 && cp < 0x10000);
    if (overlong || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) { out += "\ufffd"; continue; }
    if (cp > 0xffff) {
      const c = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
    } else out += String.fromCharCode(cp);
  }
  return out;
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
    const out = hexToUtf8(s);
    if (out && isJson(out)) return out;
  }
  return null;
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
