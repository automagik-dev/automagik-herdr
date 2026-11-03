# am-status

The window's bottom status bar, with the installed Automagik Herdr version and its update check
beside "commands". Derived from Herdr's shipped `workspace-status`.

## What you see

A 28 px strip across the bottom of the window, `chrome` background with a top border, text
`muted`: the machine (monitor icon, "This computer", or server icon and its name), the branch, a
dot and "25 agents", "· 3 needs you" in `blocked` while any agent asks. On the right, the palette
hint ("⌘⇧P  commands", from the bound key), then the version:

```
This computer · main · 25 agents · 3 needs you          ⌘⇧P  commands   Automagik Herdr 0.8.0
This computer · main · 25 agents · 3 needs you          ⌘⇧P  commands   0.8.0 → 0.8.1 · update
This computer · main · 25 agents · 3 needs you          ⌘⇧P  commands   Automagik Herdr 0.8.0 · checking…
This computer · main · 25 agents · 3 needs you          ⌘⇧P  commands   0.8.0 · couldn't check
```

All `dim` like the hint; only **update** is `accent`. A tooltip says when it last checked, or why
it couldn't (offline, GitHub refusing, no node, no sidebar answering).

## How it behaves

- **Up to date**: click the version to check now ("checking…", then the answer).
- **Update available**: click **update** to open Herdr's `confirm` dialog naming both versions.
  Confirm runs `am-status.update`, and the sidebar installs the release with `node
  <pack>/update.mjs apply`, the path `automagik-herdr update` takes: the tarball checked against
  the release's `SHA256SUMS`, the replaced pack kept for `automagik-herdr update --rollback`. A
  notice then says to reload Herdr's mods (no mod can reload them itself).
- **Couldn't check**: the reason in the tooltip; click to try again. Never a notice, never a
  dialog: a failed look is retried on the sidebar's own timer.
- **Updates off** (`AUTOMAGIK_HERDR_NO_UPDATE` where the check runs): the version alone.

## How it works

Herdr refuses an import from another mod folder, so this mod runs no check. The sidebar
(`am-sidebar/updateCheck.js`) runs every check (20 s after load, then every 4 hours, every 30
minutes after a failure) and every install, one at a time across sidebar copies (a lock in the
shared value, freed when its holder goes quiet). Two shared values connect them:

- `am.update.state` (the sidebar writes): the last answer (`kind`, `current`, `latest`, `update`,
  `why`, `at`, `applyError`) and `busy` while a check or an install runs;
- `am.update.request` (this mod writes): `{ id, what: "check" | "apply", at }`. The sidebar
  takes it on its 250 ms timer; a request older than 2 minutes is dropped, and one no sidebar
  took within 10 s shows "couldn't check".

`label.js` turns the state, the request and the installed `VERSION` (read from
`<app home>/mods/am-sidebar/VERSION`) into the bar's text; it is pure and tested
(`test/am-status.test.mjs`). The releases come from wherever `update.mjs` looks (`release.js`):
this mod names no repository.

## Wiring

The `automagik` layout's `status` block names `am-status` in place of `workspace-status`. A
layout of your own: set that block's `content.mod` to `am-status`.

`monitor.svg`, `server.svg` and `branch.svg` are Herdr's, copied from `workspace-chrome` so the
bar doesn't depend on another mod's folder.
