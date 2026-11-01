# automagik-herdr pack

A Herdr pack: a bundle of mods that installs itself and manages its own marketplace, instead of a
single plugin. `mods/` holds each piece, `catalog/index.json` is the index of what we ship and what
we carry, `scripts/install.mjs` puts it into an app home, `scripts/catalog.mjs` rebuilds the index.

## What you see

Nothing of its own: the pack is what it installs. The main mod is **`spaces-agents`** — the
sidebar and the Bots in it (a project's main bot and its team, Automagik's characters, the
Create/Edit form, Start/Attach, the per-turn briefing, and `bin/automagik-herdr.mjs`); its own
`RECIPE.md` describes it. Beside it are the pieces that make the sidebar usable — `sidebar-chrome`
(the footer rail), `auto-tabs` (the tab bar), `new-menu-tui` (the `+` menu), `md-menu`
(Markdown straight from a terminal — the menu and the preview in one mod), `space-icon` (the icon dialog), `automations` (scheduled agent prompts) — and **`mod-manager`**, the table at
`⌘⇧M` that lists every installed mod with on/off switches, `herdr-app check` results, versions,
sources from our catalog and paths, plus the marketplace (`m`) and the review before any copy.

Every mod brings its own `RECIPE.md`, `LICENSE` and keys.

## How it behaves

- **Install** (`node scripts/install.mjs`): copies every `mods/<name>/` into
  `<app home>/mods/`, merges the pack's `keys.json` (only free keys — one in use stays the
  person's, printed as `key = … stays …`), writes `<app home>/data/mod-manager/catalog.json` with
  the index URL, then runs `herdr-app check` per mod and fails the run if any fails. Layouts,
  settings, terminals and Herdr's own mods are untouched. `--dry-run`, `--app-home`, `--catalog`.
- **Catalog** (`node scripts/catalog.mjs`, `--refresh`, `--check`): reads the remotes and HEAD of this
  checkout, lists every `mods/*/main.js` as a mod of the pack's entry, appends `catalog/repos.json`'s
  repos that pass the gate (each of ours needs RECIPE.md + LICENSE; a curated repo needs a licence
  and an upstream RECIPE.md; a mod name has one owner, ours first — every refusal is printed), and writes
  `catalog/index.json` in the shape `herdr.dev/mods` publishes (`schemaVersion`, `generatedAt`,
  `modCount`, `repositoryCount`, `mods[]` with `owner/repo/fullName/url/stars/pushedAt/headCommit/
  path/name/blurb/modNames/hasKeys/hasPreview/recipeBytes/previewUrl`). One mod has one owner: the
  first entry to claim a name keeps it (the pack is first), and a repo left with nothing drops out.
- **At run time** the manager reads that index: `data/mod-manager/catalog.json` → `{ url }`, a
  local path in a checkout or the published raw URL after a push. From it, each installed mod gets
  its repo, blurb, stars and head commit; `d` compares the folder against that commit; `u` adopts a
  hand-installed catalog mod so later updates are ordinary.

## Built from

- `mods/mod-manager/` — `main.js`, `core.js`, `mod.json`, `RECIPE.md` (vendored from
  `jacksonpires/herdr-app-mod-manager`, MIT, retargeted at our index).
- `catalog/index.json` (generated), `catalog/repos.json` (the other repos we carry).
- `scripts/catalog.mjs`, `scripts/install.mjs` (Node, no dependencies; `gh` optional for stars).
- `keys.json` — `cmd-shift-m` → `mod.open:mod-manager`.
- Programs the pack runs: `git`, `herdr-app check`, `node`; the manager adds `gh`, `find`,
  `shasum`, `stat`, `rm`, `mv`, `mkdir`, `cp`, `open`.

## Watch out

- The installer owns `mods/` and `keys.json`; the manager owns what it installs (shared
  `"mod-manager.installed"`). Installed copies of a pack mod are replaced wholesale by the
  installer — edit here, not in the app home.
- The pack's entry is generated from this checkout: a stale HEAD in `catalog/index.json` makes the
  manager think the pack is behind. Regenerate before tagging a release.
- A catalog `path` names the subfolder a multi-mod repo nests its mods in; get it wrong and the
  mod's entry lands with an empty `modNames` and disappears from the marketplace.
- `whats-in-the-catalog` needs to be true: dedupe keeps the first claim, so ordering matters (the
  pack first, then curated repos).
- The manager can't draw catalog preview images (mod `fetch` is text/JSON only).

## Done when

- `herdr-app check mods/mod-manager` passes.
- `node scripts/catalog.mjs` writes an index whose first entry is this pack, whose `modNames` is
  exactly the folders under `mods/`, and with no mod name claimed twice; `--check` exits 0 on that
  index and 1 when it is older than 7 days or any entry drifted.
- `node scripts/install.mjs --app-home <temp>` installs every mod, adds only free keys, writes the
  catalog config and prints `check passed` for each mod.
- In the app: `⌘⇧M` opens the table; a mod installed from our catalog shows its repo and stars;
  `d` reports equal or differing file counts; a switch moves the folder to `mods-disabled/`.
