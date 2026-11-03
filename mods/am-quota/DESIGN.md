# am-quota — design notes

The decisions this mod is built on, so the panel cannot drift from them. `policy.js`, `proxy.js`,
`translate.js`, `write.js`, `switch.js` and `lock.js` are the tested parts
(`test/am-quota-*.test.mjs`); `main.js` is the panel that wires them. `RECIPE.md` is the
person-facing version.

## Where the facts come from (measured against `https://juice.lembr.ai`, 2026-11-01)

| Call | Gives |
|---|---|
| `GET /v0/management/plugins/cpa-quota-api-extension/v1/quotas` | per credential: `windows[]` of `{id, used_percent, remaining_percent, reset_at}`, `credential_state`, `status` — the panel's rows |
| `GET …/v1/accounts` | redacted inventory: email, account type, `last_refresh`, `recent_requests`, `status` |
| `GET /v8/management/credentials` | the same credentials plus `path`, `access_token_expires_at` and `quota.signals` (a fallback when the plugin is absent) |
| `GET /v8/management/credentials/download?name=<file>` | the credential file itself — **live tokens** |

Both the base URL and the management key are configuration, never constants: the base URL is
`<app home>/cliproxy.json`'s `url`, the key is `$CLIPROXY_MGMT_KEY` or `~/.config/cliproxyapi/mgmt.key`.
The key **travels in an environment variable or a file, never in `argv`** — `ps` shows argv, and it
is never echoed in a URL or an error.

When the quota extension does not answer, the management API's accounts are still listed and the
panel shows an error line over them; it does not render a column of "no window" as if the accounts
had no quota.

## Writing a credential locally

| Client | Where it reads | What a switch writes |
|---|---|---|
| Codex | `$CODEX_HOME/auth.json`, default `~/.codex/auth.json` | that file, translated from the proxy's flat form (`access_token, refresh_token, id_token, account_id, last_refresh`) to Codex's `{OPENAI_API_KEY: null, auth_mode: "chatgpt", last_refresh, tokens: {…}}` |
| Claude Code | on macOS the **Keychain** item `Claude Code-credentials`; with `CLAUDE_CONFIG_DIR` set, that profile's own item `Claude Code-credentials-<sha256(dir)[:8]>` (the CLI reads it first — measured below), and the profile's `$CLAUDE_CONFIG_DIR/.credentials.json` | the item (suffixed for a profile), translated to `{claudeAiOauth: {accessToken, refreshToken, expiresAt, refreshTokenExpiresAt, scopes, subscriptionType, rateLimitTier}}`; with a `CLAUDE_CONFIG_DIR`, or on a platform without `security`, the profile's / default file as well |

**A `CLAUDE_CONFIG_DIR` has its own Keychain item.** Measured on the installed CLI 2.1.316 with
`CLAUDE_CONFIG_DIR=/tmp/cc-scratch` and a `security` shim on `PATH`, the CLI ran
`find-generic-password -a feliperosa -w -s "Claude Code-credentials-bde599a8"`, then
`… -s "Claude Code-bde599a8"`, and `sha256("/tmp/cc-scratch")[:8]` is `bde599a8`. The digest is of
the directory **as given** — no `~` expansion, no trailing-slash trimming — and the item the CLI
actually keeps is the *credentials* one, suffixed. Writing the unsuffixed item there would replace
the person's **default-profile** login, so `translate.keychainService` never falls back to it: the
name is computed by `shasum -a 256` in the shell (the mod has no crypto module) and only the base
service name — never a secret — is an argument. A profile whose digest cannot be resolved makes a
read "unknown" and a switch fail **before** anything is written. The profile's file is written too,
because a `CLAUDE_CONFIG_DIR` is a separate profile, not the Keychain-only default route.

Rules for the write, from the coordinator and from the experiment:

- write `0600`, into a temporary file in the **same** directory, then **atomic rename** — never a
  partial credential on disk. The payload's folder is forced `0700` *before* any payload exists,
  which is what keeps the file out of reach; the file itself is `0600`d the moment it is created
  (`writeTextFile` replaces the inode, so a mode set beforehand would not survive);
- back up the file being replaced, and keep the backup out of any log;
- **never** put a token in a log, a `notify` body, a shared state key, or an error message;
- a failed download or write leaves the previous credential in place and says so without detail;
- the Keychain item is written the way the installed CLI writes it: `security -i` fed one command
  line on **stdin**, with the payload hex-encoded through `-X`. Measured alternatives are all
  worse — `security … -w "$(cat file)"` puts the token in `security`'s `argv` (`ps -ww`), and
  `-w` with no value prompts twice and **truncates at 128 bytes** (a real credential is ~1.2 kB,
  so it would have stored garbage);
- **both** the 4000-character guard and the read-back are load-bearing, from two measurements.
  `security -i` answers with the status of the *last* command it ran, so a failed inner add can
  still exit 0; and an over-long line is not refused up front — it runs a **truncated add**
  (2,012 bytes stored in the measurement) and only then reports an error. The guard refuses what
  cannot fit; the read-back catches a truncated store;
- a Keychain value holding `0x0a` is stored correctly; it is `security find-generic-password -w`
  that prints it as **hex**. The Claude payload is therefore compact JSON — one line, no trailing
  newline — so the read-back (`-w`, one trailing newline stripped) compares text with text, and
  `keychainScript()` refuses a multi-line file rather than write something it could not verify;
- **the item is merged, not replaced.** The CLI keeps other keys there (`mcpOAuth`, …); the panel
  reads the existing item, changes only `claudeAiOauth`, and writes the merged JSON back, so a
  quota switch cannot wipe an MCP token;
- **before the item is replaced, the old one is saved** to a `0600` hex file in the `0700` payload
  folder. If any later step fails (the file write, the state write), that backup is put back — a
  `security -i` add that landed before a failure would otherwise leave Claude on the new account
  while the panel reports an error. With no old item, the rollback deletes the one the switch
  added. The backup is deleted on success and swept if a crash leaves it. A kill between the backup
  and the write leaves that `0600` hex file until the next open more than an hour later
  (`write.js`'s `sweepScript`); it is accepted, because the file is `0600` in a `0700` folder and
  the alternative is a restore that cannot be proved;
- a refusal that happens **before** the add exits `75`, and only an add that actually ran marks the
  item as touched. So a too-large or multi-line payload is never "put back" (the backup may not
  exist, and a restore of an untouched item would fail with a scarier message than the truth);
- **the item must fit one `security -i` line.** The command is
  `add-generic-password -U -a "<login>" -s "<service>" -X "<hex>"` under a 4000-character guard, so
  an item much past **1,950 bytes** cannot be carried. Merging keeps whatever the CLI stores beside
  the tokens, so an existing item that large is refused in plain words — "this login item is too
  large to switch safely" — before anything is written. Keys are never dropped and the item is
  never truncated, and there is no second write path;
- the add line **quotes** the login and the service (`security -i` splits on spaces, and
  `Claude Code-credentials` — suffixed or not — holds one). The payload itself is one hex word.
- on macOS with the Keychain write verified and no `CLAUDE_CONFIG_DIR`, the plaintext
  `~/.claude/.credentials.json` **is not written at all**: Claude reads the item first, and a stale
  file plus its backups are pure exposure;
- the payload file is created inside a `0700` folder and narrowed to `0600` at once, removed by the
  scripts and again in `finally`, and anything older than an hour is swept when the panel opens;
- backups are pruned to the three newest, so a click does not accumulate token-bearing files;
- the proxy client refuses a non-`https` base URL (plain `http` only for loopback), and a body
  that is not JSON is reported by name, never quoted;
- verification is a real request (a tiny prompt per client), because `claude auth status` and
  `codex login status` are shallow: a garbage `{"access_token":"nope"}` was reported as
  "Logged in using ChatGPT".

### The refresh token after a switch

The proxy and the local client end up holding the **same** refresh token. Anthropic rotates a
refresh token when one is used, so whichever side refreshes first invalidates the other's copy:
CLIProxyAPI refreshing the account signs the local CLI out, and a local CLI refresh makes the
proxy's stored credential stale (the proxy then reports a failed/sign-in-needed account). This is
inherent to sharing a credential and is not fixed by anything this mod writes — the panel says so
in its status line and footer, and the way back is to re-import the credential (or sign in) on the
side that was signed out.

## The policy

`choose(accounts, {provider, now, activeId, marginMinutes?, holdMinutes?})` →
`{action: "keep" | "switch" | "none", to, reason, facts}`. Rules in `policy.js`, each one tested:

- **Projection, not a percentage:** switch when the active account is projected to run dry before
  its window resets (`headroom / burnPerHour` vs `time to reset`), with a margin.
  A flat window (burn 0) never triggers; at the 2 % floor an account is dry now regardless of burn.
  The burn rate needs **two readings of the same window**, and `main.js` keeps them: `proxy.QuotaSampler`
  holds the last `used_percent` and timestamp per account and window, attaches it as
  `account.previous` on the next poll, and drops it when `reset_at` changes (a new window) or the
  proxy's `fetched_at` does not advance (the same reading twice must not erase the first).
- **Spend the window that would be wasted:** the candidate with the soonest reset and headroom wins —
  never the emptiest, never round-robin.
- **Hold is a switch-cost window (15 min), not a reservation:** do not move onto an account about to
  roll over; its fresh window arrives in minutes. Measured on the candidate, never on the active one.
- **No reserve**; **providers never mix**; an unusable account (disabled, failed, requires sign-in,
  not `active`) switches at once.
- **Fixed tie-break** (held, then reset, then headroom, then id) so two equal candidates cannot make
  the panel flip between suggestions.
- Resets re-rank when they happen; they are events, not predictions.

## The panel's own state

`data/am-quota/active.json` records, per provider, the credential name this panel installed and a
32-bit FNV-1a **fingerprint of its identity** — Codex's `account_id`, or Claude's refresh token (its
item holds nothing else); an identity, never the token. On each identity read the panel compares that
fingerprint with what is actually installed (the Keychain item, or the file when a
`CLAUDE_CONFIG_DIR` is used): a mismatch means the credential changed outside this panel (an open
session refreshing the old account back into the Keychain, or a rotation), and the row says
`changed outside this panel` instead of a false `in use`. An item that is gone says
`no longer installed`; an item that cannot be read (no `security`, a locked Keychain) keeps the
record's claim, because a guess is worse than the record.

The installed item holds tokens, so it is re-read for the badge **on open, after a switch, and then
at most every five minutes** — not on every 60 s poll.

One switch at a time: a second click while `busy` is set is refused with the running switch's text
(`lock.js`), so two writes cannot interleave. The success line is kept in `note` (the 60 s poll no
longer clears it), and the poll skips a hidden panel and a copy that has not been drawn for two
intervals, and drops a response that a newer read has overtaken.

Every request the proxy client makes carries a **30-second `AbortSignal.timeout`**, so a hung
server cannot leave a switch `busy` (or the panel reading forever). A runtime without
`AbortSignal.timeout` gets no signal rather than an exception.
