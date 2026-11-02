# am-quota — design notes

The decisions this mod is built on, so the panel cannot drift from them. `policy.js`, `proxy.js`
and `translate.js` are the tested parts (`test/am-quota-*.test.mjs`); `main.js` is the panel that
wires them. `RECIPE.md` is the person-facing version. The panel is **read-only**: it lists, it
advises, and it writes nothing.

## Where the facts come from (measured against `https://juice.lembr.ai`, 2026-11-01)

| Call | Gives |
|---|---|
| `GET /v0/management/plugins/cpa-quota-api-extension/v1/quotas` | per credential: `windows[]` of `{id, used_percent, remaining_percent, reset_at}`, `credential_state`, `status` — the panel's rows |
| `GET …/v1/accounts` | redacted inventory: email, account type, `last_refresh`, `recent_requests`, `status` |
| `GET /v8/management/credentials` | the same credentials plus `path`, `access_token_expires_at` and `quota.signals` (a fallback when the plugin is absent) |
| `GET /v8/management/credentials/download?name=<file>` | the credential file itself — **live tokens** (not used by the read-only panel) |

Both the base URL and the management key are configuration, never constants: the base URL is
`<app home>/cliproxy.json`'s `url`, the key is `$CLIPROXY_MGMT_KEY` or `~/.config/cliproxyapi/mgmt.key`.
The key **travels in an environment variable or a file, never in `argv`** — `ps` shows argv, and it
is never echoed in a URL or an error.

When the quota extension does not answer, the management API's accounts are still listed and the
panel shows an error line over them; it does not render a column of "no window" as if the accounts
had no quota.

Every request carries a **30-second `AbortSignal.timeout`**, so a hung server leaves the panel
showing its last read instead of "reading the proxy…" forever. A runtime without
`AbortSignal.timeout` gets no signal rather than an exception.

## What is installed, and where

| Client | Where it keeps the account | What the panel reads |
|---|---|---|
| Codex | `$CODEX_HOME/auth.json`, default `~/.codex/auth.json` | that file |
| Claude Code | on macOS the **Keychain** item `Claude Code-credentials`; with `CLAUDE_CONFIG_DIR` set, that profile's own item (below) | the item on macOS, the file elsewhere |

**A `CLAUDE_CONFIG_DIR` has its own Keychain item.** Measured on the installed CLI 2.1.316 with
`CLAUDE_CONFIG_DIR=/tmp/cc-scratch` and a `security` shim on `PATH`, the CLI ran
`find-generic-password -a feliperosa -w -s "Claude Code-credentials-bde599a8"`, then
`… -s "Claude Code-bde599a8"`, and `sha256("/tmp/cc-scratch")[:8]` is `bde599a8`. The digest is of
the directory **as given** — no `~` expansion, no trailing-slash trimming — and the item the CLI
keeps is the *credentials* one, suffixed. Writing the unsuffixed item there would replace the
person's **default-profile** login, so `translate.keychainService` never falls back to it: the name
is computed by `shasum -a 256` in the shell (the mod has no crypto module) and only the base service
name — never a secret — is an argument. A profile whose digest cannot be resolved makes the read
"unknown", not "the default item". The CLI reads the item first on macOS, with or without a profile,
which is why the panel asks the item and not the file there.

`data/am-quota/active.json` records, per provider, the credential name a switch installed and a
32-bit FNV-1a **fingerprint of its identity** — Codex's `account_id`, or Claude's refresh token (its
item holds nothing else); an identity, never the token. On each identity read the panel compares
that fingerprint with what is actually installed: a mismatch means the credential changed outside
this panel (an open session refreshing the old account back into the Keychain, or a rotation), and
the row says `changed outside this panel` instead of a false `in use`. An item that is gone says
`no longer installed`; an item that cannot be read (no `security`, a locked Keychain) keeps the
record's claim, because a guess is worse than the record. The item holds tokens, so it is re-read
**on open and then at most every five minutes** — not on every 60 s poll.

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

## The panel

A card filling its block: a 42 px header, then one block per provider with the rule's verdict and
one row per account — name, the in-use badge, `suggested`, a 5 px window bar and the window facts.
The poll skips a hidden panel and a copy that has not been drawn for two intervals, and drops a
response that a newer read has overtaken; `↻` forces a read. Rows are read-only: no click on this
panel changes a credential.
