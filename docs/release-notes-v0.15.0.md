# The bridge to the Automagik monorepo

Automagik Herdr now lives in the Automagik monorepo (`automagik-dev/automagik`, its `herdr/`
folder) and ships on its releases, with the monorepo's one version (3.N.P). This is the last
release from this repository. It changes nothing in the sidebar, the bots or the layout: it
changes where updates come from and how they are checked.

## What changes for you

- **Your next update moves you to 3.60.x.** After this release is installed,
  `automagik-herdr update` (or the sidebar's update notice, or the status bar's **update**) offers
  the pack the monorepo released last, today 3.60.1. 0.15.0 → 3.60.1 is an update like any other:
  the replaced pack is kept, and `automagik-herdr update --rollback` brings 0.15.0 back.
- **Updates are signed.** The updater no longer reads this repository's releases. It reads one
  small file, the monorepo's `herdr-lane` pointer (`pack.json`, which names the newest pack, its
  tarball and that tarball's sha256), and its signature (`pack.json.sig`, ed25519). The signature
  must match a key this release ships (`mods/am-sidebar/pack-keys.json`, key id
  `herdr-pack-2026-11`), and the tarball must match the sha256 the signed pointer names, before
  anything is written. A pointer that does not verify is refused: nothing is installed, and the
  command says why.
- **No downgrades through the pointer.** Each update through the pointer records its `sequence`
  in the install record (`installed-by-install.sh`). A pointer older than the installed pack, by
  version or by sequence (an older signed pointer posted again), is refused with a clear message.
  To go back on purpose, use `automagik-herdr update --rollback`.
- **The installer follows.** `install.sh` installs the pack the signed pointer names, with the same
  checks. `--version <v>` installs a named monorepo release that carries the pack (not every
  release does), checked against that release's own `.sha256`, and says so; a 0.x release is no
  longer installed with `--version` (to go back to one, use `automagik-herdr update --rollback`
  after an update). The one-liner is now
  `curl -fsSL https://raw.githubusercontent.com/automagik-dev/automagik/main/herdr/install.sh | bash`;
  the old one in this repository keeps working and does the same.
- **The mod manager's catalog** is the monorepo's
  (`https://raw.githubusercontent.com/automagik-dev/automagik/dev/herdr/catalog/index.json`). A
  catalog setting that still holds this repository's catalog URL reads the new one; a URL you set
  yourself stays yours.

## How you get here

An installed 0.x takes this release the way it took every release before it: from this
repository, checked against the release's `SHA256SUMS`. That check proves the download is whole,
not who published it, so this release is the trust anchor for every 0.x install: the keys it
carries are the ones every later update is checked against.

Pocket Link (`mods/pocket-link`) and its LaunchAgent are not the pack's: nothing here installs,
updates or removes them.
