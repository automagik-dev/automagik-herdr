# am-quota

One account per client, and the handoff before a window runs dry. The left sidebar panel lists every
Claude Code and Codex account the CLIProxyAPI knows, with its window, and switches the *local*
credentials so the clients use the one you pick — no proxy in the traffic path, no rewiring.

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
status line (`one account per client, switched before it runs dry`, or what a switch is doing) and
`↻` — then, per provider, a small caps label with the rule's verdict (`keep`, `handoff → <account>`,
`no advice`) and one row per account: name, `in use` on the account this panel installed,
`suggested` on the one the rule points at, a **Use** button, a 5 px window bar (green → amber →
red as the window fills), and `N% used · resets in <time>`, plus `no window`, `sign-in needed` or
`disabled` when they apply. Errors appear as one red line under the header; when the quota extension
does not answer, a second line says the windows are unknown instead of showing a column of
`no window`. A row this panel installed that no longer matches what is on the machine reads
`changed outside this panel`.

## How it behaves

- **Reading**: `cliproxy.json`'s `url` + `$CLIPROXY_MGMT_KEY` or `~/.config/cliproxyapi/mgmt.key`
  make the client; then `…/v1/quotas` joined with `/v8/management/credentials` (`proxy.js`).
  Refresh on open, every 60 s while the panel is drawn, and on `↻`. A poll that a newer one has
  overtaken is dropped, and a hidden panel does not poll. The management key rides only in the
  `Authorization` header.
- **Deciding**: `policy.choose` per provider, with this panel's record of what it installed as the
  active account. The burn rate comes from the last two polls (`prev` per account and window, dropped
  when the window resets). Projected exhaustion before the reset, the soonest-resetting account with
  headroom wins, near-reset (15 min) held, no reserve, providers never mix, fixed tie-break.
  One switch at a time: a second click while one runs is refused.
- **Switching** (`Use`): `GET …/credentials/download?name=<file>` → translate → write:
  - Codex: `$CODEX_HOME/auth.json` (default `~/.codex/auth.json`; `OPENAI_API_KEY: null`,
    `auth_mode: "chatgpt"`, `last_refresh`, `tokens{…}`), previous file kept as
    `auth.json.bak-<stamp>`;
  - Claude: the Keychain item **first** on macOS. With no `CLAUDE_CONFIG_DIR` that is
    `Claude Code-credentials`; with one, it is that profile's own item,
    `Claude Code-credentials-<sha256(dir)[:8]>` (measured on CLI 2.1.316), so a profile switch never
    replaces your default-profile login — and the profile's `.credentials.json` is written as well.
    On Linux there is no item: the profile's / default `.credentials.json` is the route. The item is
    **merged**: only `claudeAiOauth` changes, so other keys the CLI keeps there (`mcpOAuth`, …)
    survive. The old item is saved to a `0600` file before the write and put back if a later step
    fails. On macOS with the item verified and no `CLAUDE_CONFIG_DIR`, the plaintext
    `~/.claude/.credentials.json` is not written or backed up at all. An existing item too large for
    one `security -i` line (past ~1,950 bytes once merged) is refused — "this login item is too large
    to switch safely" — rather than truncated or stripped of its other keys.
  Written through `sh`: the payload lives in a `0700` folder, is `0600`d the moment it exists, and
  becomes the real file by `mv` (atomic rename); the token is read from a file by the shell, so it
  never appears in `argv`, a log, a notify, shared state or an error message. Backups are pruned to
  the three newest. The Keychain item is written via `security -i` on stdin with the payload
  hex-encoded (`-X`) — the same mechanism the installed CLI uses; `security -w` would put the token
  in `argv` and, read from the prompt, truncates at 128 bytes. It is read back before success is
  reported, because an over-long `-i` line can store a truncated item and still exit 0. The scratch
  file is deleted afterwards, success or failure.
- **After a switch**: the panel records `<provider> → <credential name + token fingerprint>` in
  `data/am-quota/active.json` and says "restart new sessions (or /restart an open one)". Sessions
  already running keep the old account — that is the client's behaviour, not a defect.
- **The refresh token is shared with the proxy.** Both sides hold the same one, and Anthropic rotates
  it on use, so whichever side refreshes first can sign the other out. Expect to re-import or sign in
  on the side that lost it; the panel's footer says so too.

## Built from

`main.js` (the panel), `policy.js` (the decision, pure), `proxy.js` (the reader and the per-window
samples, pure), `translate.js` (proxy credential → client credential, item merge, Keychain service
name, fingerprints; pure apart from the `shasum` lookup), `write.js` (the shell that writes; pure),
`switch.js` (the install flow, with its shell and files injected so it is tested end to end),
`lock.js` (one switch at a time), `mod.json` (`place: none`), `LICENSE`, `DESIGN.md` (endpoints,
writers, secret rules), and tests for every module in the repository's `test/`.

Herdr API: `exec`, `theme`, `appHome`, `home`, `readTextFile`, `writeTextFile`, `fs/promises`; the
runtime's `fetch`. Programs: `sh`, `security` (macOS Keychain), `od`/`tr` for the hex encoding.

## Watch out

- **It writes real credentials.** That is its purpose; the old file is always kept as a dated
  backup, the old Keychain item is saved and restored on failure, and no token is ever logged. A
  switch affects **new** client runs only.
- **`login status` / `auth status` are shallow** — a garbage token reported "logged in". The panel
  therefore reports what it *wrote*, not that the account *works*; a verification request is a
  separate, quota-spending action, and is not wired yet.
- Codex's `auth.json` expects a nested `tokens` object while the proxy's file is flat; `translate.js`
  is the only place that knows the mapping, and the tests pin it.
- `CODEX_HOME` and `CLAUDE_CONFIG_DIR` are honoured: the panel writes where the client would read —
  including the separate Keychain item a `CLAUDE_CONFIG_DIR` profile reads.
- A provider with no window is shown but never suggested (nothing to project).
- The proxy's quota extension (`cpa-quota-api-extension`) supplies the windows; without it the panel
  still lists accounts and shows the error line, with no advice.

## Done when

`herdr-app check mods/am-quota` passes; the panel lists both providers' accounts with their windows;
`Use` rewrites the file (and the Keychain item for Claude — the profile's own item under a
`CLAUDE_CONFIG_DIR`) with a backup and a 0600 permission; the next `claude`/`codex` run is on the
chosen account; no token appears in any log, notify or state.
