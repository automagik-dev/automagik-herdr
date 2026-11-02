# am-quota

The quota each Claude Code and Codex account has left, side by side. The left sidebar panel lists
every account the CLIProxyAPI knows, with its usage windows, and names the handoff the rule would
make before a window runs dry — no proxy in the traffic path, no rewiring. This panel only reads;
it changes nothing on your machine.

## Setup

The panel reads two files and does not create either of them:

- **`~/.config/herdr-app/cliproxy.json`** (or `$HERDR_APP_HOME/cliproxy.json` when that variable
  moves the app home) — JSON with one key for this panel:

  ```json
  { "url": "https://juice.lembr.ai" }
  ```

  `url` is the CLIProxyAPI base URL, `https` (plain `http` is accepted only for `localhost` /
  `127.0.0.1`). No trailing slash needed; a path prefix is fine.
- **`~/.config/cliproxyapi/mgmt.key`** — the management key as plain text, one line, mode `0600`:

  ```sh
  install -m 600 /dev/null ~/.config/cliproxyapi/mgmt.key
  printf '%s\n' '<the management key>' > ~/.config/cliproxyapi/mgmt.key
  ```

  Or set **`CLIPROXY_MGMT_KEY`** in the environment Herdr itself runs in; the variable wins over the
  file. The key is only ever read — it is not written to a log, a notify, shared state or a command
  line.

## What you see

A card filling its block (`rounded(10)`, 1 px `border`, `background`): a 42 px header — **Quota**, a
status line (`the quota each account has left, and the rule's advice`) and `↻` — then, per provider,
a small caps label with the rule's verdict (`keep`, `handoff → <account>`, `no advice`) and one row
per account: name, `in use` on the account this machine is on, `suggested` on the one the rule
points at, a 5 px window bar (green → amber → red as the window fills), and
`N% used · resets in <time>`, plus `no window`, `sign-in needed` or `disabled` when they apply.
Errors appear as one red line under the header; when the quota extension does not answer, a second
line says the windows are unknown instead of showing a column of `no window`. A row this panel
installed that no longer matches what is on the machine reads `changed outside this panel`.

## How it behaves

- **Reading**: `cliproxy.json`'s `url` + `$CLIPROXY_MGMT_KEY` or `~/.config/cliproxyapi/mgmt.key`
  make the client; then `…/v1/quotas` joined with `/v8/management/credentials` (`proxy.js`).
  Refresh on open, every 60 s while the panel is drawn, and on `↻`. A poll that a newer one has
  overtaken is dropped, and a hidden panel does not poll. Every request gives up after 30 seconds,
  so a hung proxy cannot leave the panel reading forever. The management key rides only in the
  `Authorization` header.
- **Deciding**: `policy.choose` per provider, with this panel's record of what it installed as the
  active account. The burn rate comes from the last two polls (`prev` per account and window, dropped
  when the window resets). Projected exhaustion before the reset, the soonest-resetting account with
  headroom wins, near-reset (15 min) held, no reserve, providers never mix, fixed tie-break.
- **Which account is installed**: the Codex `auth.json` file, or on macOS Claude's Keychain item.
  With `CLAUDE_CONFIG_DIR` set, Claude keeps a **separate item** for that profile —
  `Claude Code-credentials-<sha256(dir)[:8]>` (measured on CLI 2.1.316) — and the panel reads that
  one, never the default profile's login. The item holds tokens, so it is re-read on open and then
  at most every five minutes.

## Built from

`main.js` (the panel), `policy.js` (the decision, pure), `proxy.js` (the reader and the per-window
samples, pure), `translate.js` (where each client keeps its credential, item text, Keychain service
name, fingerprints; pure apart from the `shasum` lookup), `mod.json` (`place: none`), `LICENSE`,
`DESIGN.md` (endpoints, reading rules), and tests for every module in the repository's `test/`.

Herdr API: `exec`, `theme`, `appHome`, `home`, `readTextFile`; the runtime's `fetch`. Programs: `sh`,
`security` (macOS Keychain), `shasum` for a profile's item name.

## Watch out

- **The panel writes nothing.** It reports what the quota endpoints say and what is installed; a
  change of account is not wired yet.
- **`login status` / `auth status` are shallow** — a garbage token reported "logged in". The panel
  therefore reports what it reads, not that the account *works*.
- `CODEX_HOME` and `CLAUDE_CONFIG_DIR` are honoured: the panel looks where the client would read —
  including the separate Keychain item a `CLAUDE_CONFIG_DIR` profile reads.
- A provider with no window is shown but never suggested (nothing to project).
- The proxy's quota extension (`cpa-quota-api-extension`) supplies the windows; without it the panel
  still lists accounts and shows the error line, with no advice.

## Done when

`herdr-app check mods/am-quota` passes; the panel lists both providers' accounts with their windows;
the in-use badge matches what is installed; no token appears in any log, notify or state.
