# Mod manager

A table of every mod in a Herdr app home, with the switches, versions and origins that let a
person run their own mod set: install from a marketplace, update, switch off, remove — each after
a review that lists what enters, what the code does, and which keys it takes.

It is vendored from `jacksonpires/herdr-app-mod-manager` (MIT) and changed for this pack: the
catalog it reads is ours (`catalog/index.json`), the table gained on/off, `herdr-app check`,
catalog pairing and drift, and it is written against Herdr's current mod API.

## What it shows

A dialog at 80% × 75% (`⌘⇧M`, `mod.open:mod-manager`), `popover` background, 13 px text.

- **Header**: `Mods`, then counts — `N seus · N do Herdr · N desligados · N com erro ·
  checando N` — and, when the index can't be read, `catálogo indisponível: …` instead of silence.
- **Table** (fixed columns, one row per mod, scrolling): `ON` (30×17 switch, accent when on;
  `–` for Herdr's own mods, which cannot move), `NAME`, `KIND` (`instalado`, `catálogo`, `clone`,
  `local`, `Herdr`, `off`, `erro`), `CHECK` (`…` → `ok` / `erro` from `herdr-app check`),
  `VERSION` (`commit <sha7>`, `← <clone> v<version>`, `upstream <sha7>`), `SOURCE`
  (`owner/repo[/path] ★stars`, `owner (installer)`, `with Herdr`), `INSTALLED`, `CHANGED` (folder
  mtime), `PATH` (`mods/<name>` or `mods-disabled/<name>`).
- **Detail line** under the table: `path:`, the catalog's name and blurb with stars, the drift
  result when checked, origin/commit/mods/layouts/keys/installed date, or the error from a failed
  check. A selected mod that is switched off says so.
- **Marketplace** (`m`): the index's repos, ten per page, with stars and description; `/`
  searches, `s` sorts (stars / updated), `←→` pages, `o` opens a repo, `enter` reviews.
- **Review** before install or update: what enters (mods, layouts, file count, commit), what the
  code does (runs programs, reaches the network, reads/writes files — a pattern match over the
  source), the keys it adds and the keys it keeps, and `Bloqueado` when a name is taken.

## How it behaves

- **On/off** moves the folder between `mods/` and `mods-disabled/` (`core.setEnabled`): the app
  loads only `mods/`, so off is real and nothing is deleted. Herdr's own mods are refused.
- **Records** of what the manager installed live in shared `"mod-manager.installed"` (source,
  prefix, commit, mods, layouts, keys added, risks seen). Update and remove work off them.
- **Catalog**: `core.catalogUrl` reads `data/mod-manager/catalog.json` (`{ url }`) or the mod's own
  `catalog.json`, else the published index; a local path is read, an `https` URL is fetched. A mod
  is matched by the entry's `modNames`, so an installed folder with no record still knows its repo,
  blurb and head commit.
- **Origin**: installs come from the **GitHub topic search** (`herdr-mod`) — that is where a source
  is chosen. The catalog (`catalog/index.json`) only labels a mod's origin and drift; it is not an
  install source, and an entry that is a link to someone else's installer (`"external": true`,
  e.g. Pocket Link) carries no `modNames`, no path and no install action.
- **Drift** (`d`): shallow clone at the catalog's commit, SHA-256 both sides, skipping the files
  Herdr writes into every mod folder (`gpui-kit.d.ts`, `jsconfig.json`). Reports changed / new /
  removed counts — "differs from upstream", which is edited *or* behind.
- **Check**: `herdr-app check` once per enabled non-Herdr mod, one at a time, streamed into the
  `CHECK` column; a failure turns the name red and puts the message in the detail line.
- **Install / update / remove**: clone into `~/.config/herdr-app/.mod-manager-cache/`, review, then
  copy `mods/<name>/` and `layouts/*`, merge `keys.json` (never overwriting a key in use), check,
  toast. An update or a removal **moves the old folder aside** to
  `<app home>/automagik-herdr/backup/<mod>-<stamp>` — a rename, never `rm -rf` — and an update puts
  the mod's own `.state/`, other dot paths and `node_modules/` back into the fresh folder. A name
  the manager didn't install blocks the install until the person removes or renames it.
- **Bulk update** (`U`) is a queue of reviews, one package at a time: nothing is applied that a
  person has not seen, because a plan can add a risk or clash with a name.
- **Pocket Link is read-only**: the mod, its LaunchAgent and its pairing key belong to
  `automagik-dev/automagik-pocket`. Its row refuses install, update and remove and `o` opens that
  repo's installer; the manager never touches `mods/pocket-link`.
- **Marketplace search**: `gh api search/repositories` for the topic, else the same URL through
  `fetch` anonymously. The risk scan reads aliased imports too (`import { exec as sh }`,
  `const { exec: sh } = …`), so renaming a call does not hide it.

## Built from

- `mods/mod-manager/`: `main.js` (the view: table, marketplace, review, form), `core.js` (files,
  git, catalog, drift — no Herdr import, so `node` can run it), `mod.json`
  (`place: "none"`, dialog overlay 0.8 × 0.75).
- Herdr API: `exec`, `appHome`, `readTextFile`, `writeTextFile`, `shared`/`setShared`, `props`,
  `closeOverlay`, `openOverlay`, `notify`, `theme`, `layout`, `panes`; `fetch`; `fs/promises`
  (`readFile`, `writeFile`, `mkdir`, `unlink`, `stat`); `InputState`/`Input`.
- Programs: `git`, `gh` (optional), `herdr-app check`, `find`, `shasum`, `stat`, `rm`, `mv`,
  `mkdir`, `cp`, `open`.
- Keys: `cmd-shift-m` → `mod.open:mod-manager` (from the pack's `keys.json`).

## Watch out

- **It runs programs, reaches the network and moves files**: it clones repos, searches GitHub,
  copies into `mods/`, `layouts/` and `keys.json`, and moves folders to `mods-disabled/`. That is
  its job; the review screen exists so a person sees the same about every mod they add.
- The risk scan is a regex over source text: it over-reports and cannot prove a mod safe.
- Switching off a mod a layout still points at leaves that block empty — hide the block too.
- A mod's failure is only visible through `herdr-app check`; Herdr writes no `<mod>.error` file.
- `exec` has a time limit, and each check is one process: the sweep runs one at a time.
- The dialog's preview images from a catalog (`previewUrl`) are not shown: the mod `fetch`
  returns text/JSON only, so there is no binary to draw.
- The pack's installer (`scripts/install.mjs`) owns `mods/` and `keys.json`; the manager owns what
  it installs. Both record what they did, in different places.

## Done when

- `herdr-app check mods/mod-manager` passes.
- `node scripts/catalog.mjs` writes `catalog/index.json` with this pack first, every `mods/*`
  folder in its `modNames`, and one owner per mod name.
- `node scripts/install.mjs --app-home <temp>` copies the mods, adds only free keys, writes the
  catalog config and passes `herdr-app check` on each copied mod.
- `⌘⇧M` opens the table; a mod installed from the pack's catalog shows its repo and stars in
  `SOURCE`; `d` reports equal or differing counts; the switch moves a folder to `mods-disabled/`.
