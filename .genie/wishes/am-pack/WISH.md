# Wish: The am pack — every Automagik mod in one download, renamed am-*

| Field | Value |
|-------|-------|
| **Status** | DRAFT |
| **Slug** | `am-pack` |
| **Date** | 2026-11-01 |
| **Author** | herdr-bots coordinator, from the owner's rulings |
| **Appetite** | large |
| **Branch** | `wish/am-pack` (integration branch; merges into `dev` once) |
| **Repos touched** | automagik-dev/automagik-herdr |
| **Design** | _No brainstorm — direct wish_ |

## Summary

Owner rulings: `.genie/brainstorms/am-pack/OWNER-RULINGS.md`, restated as D1–D13 below.

Automagik Herdr v0.2.0 ships one mod, the bot sidebar. The owner's pack session (t187) has vendored the other mods the owner runs onto `pack/vendor-on-dev`: tab bar, footer rail, `+` menu, Markdown, space icon, automations, mod manager and the quota panel, plus a marketplace catalog.

This wish turns that branch into the product:
- one release download that installs, updates and rolls back every mod together;
- one installer;
- the New bot entry moved into the footer;
- md-menu and markdown-browser merged into one mod, and space-icon folded into the sidebar;
- every mod renamed `am-*` and licensed Apache-2.0;
- a migration that carries v0.2.0 installs across the rename without losing state.

## Scope

### IN

- Land the vendored pack on the integration branch: nine mods, catalog, keys, NOTICE, RECIPE, README sections. Pocket Link stays out (D10).
- am-quota as its own reviewed group (credentials handling).
- One release: one pack tarball with every mod and `layouts/automagik.json`.
  - `update.mjs` swaps every pack-owned folder atomically, with one `.prev` set.
  - `install.sh` becomes the only installer: it absorbs `scripts/install.mjs`'s key merge, catalog config and per-mod `herdr-app check`.
  - A bridge asset for v0.2.0 updaters.
- The footer rail: a Bots tab, plus New bot at the footer instead of a sidebar row.
- Consolidation: `md-menu` + `markdown-browser` → one mod; `space-icon` → inside the sidebar mod.
- The rename to `am-*` as expand → migrate → contract-later:
  - folders, `mod.json` titles, mod commands (`spaces-agents.*`), shared keys (`spaces-agents.*`, `space.colors`, `sidebar.collapsed` → `am.*`), `keys.json`, `.prev` and `.before-install` state, layout references, tests and README.
- Apache-2.0 on every mod, with the upstream MIT notices kept verbatim.

### OUT

- Pocket Link (`mods/pocket-link`, its LaunchAgent and its state). It belongs to automagik-pocket. The footer tab that opens it already exists (pack commit eb3b7d0) and is the only touch.
- Removing the old-name compatibility (contract). It is deferred until no install reports a pre-rename VERSION. Trigger: one release after this ships.
- Splitting the bots out of the sidebar into their own mod (owner ruling 2: no split).
- Brain squads as bots (a team-design job), and the ae/1 JSON Schema group.
- Any change to Herdr itself, herdr-core or Automagik.
- Publishing the catalog to herdr.dev/mods.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | The bot mod is **`am-sidebar`**. It draws the whole sidebar, and Bots is one section. | Owner ruling 1. mod-manager switches mods by folder, so "am-bots" off would hide the spaces too. |
| D2 | **No split.** The bot tree stays under its project's space (herdr-bots A8, C2, C7). | Owner ruling 2. Two mods cannot interleave rows in one list. |
| D3 | **One download.** A release is `automagik-herdr-pack-<v>.tgz` (every mod folder plus `layouts/automagik.json`) and `SHA256SUMS`. Install, update and rollback treat the pack as one unit. | Owner ruling 4. |
| D4 | **Eight mods:** `am-sidebar` (spaces-agents + space-icon), `am-footer` (sidebar-chrome), `am-markdown` (md-menu + markdown-browser), `am-tabs` (auto-tabs), `am-new-menu` (new-menu-tui), `am-mods` (mod-manager), `am-quota` (new code against CLIProxyAPI), `am-automations` (automations). | Owner rulings 5, 8 and 10. `am-automations` confirmed (t187 for the owner, 2026-11-01). |
| D5 | **New bot leaves the sidebar body.** The footer gets a Bots tab that runs `run("spaces-agents.new-bot")` and `run("spaces-agents.edit")` (the existing pick popup). The sidebar's "New bot" row is removed. The bot management suite is the sidebar's existing dialogs, reached from the footer; no bot code is copied into the footer mod. | Owner ruling 6. `spaces-agents/main.js:682-695` already accepts these mod commands from any caller (`create.js` already runs `spaces-agents.refresh`), and Herdr mods cannot import across folders. |
| D6 | **Every mod is Apache-2.0.** The three MIT forks, automations (DnzzL), markdown-browser (ohneda) and mod-manager (jacksonpires), ship under Apache-2.0 as derived works, with the upstream MIT copyright and permission notice verbatim in `LICENSE-upstream` and NOTICE. | Owner ruling 7. MIT permits this; the notice is its one condition. |
| D7 | **am-quota is clean-room.** No line comes from 0xRowdy/herdr-cliproxy, which has no licence. | Owner ruling on cliproxy, and copyright law. |
| D8 | **One layout, `automagik`.** The pack's root `layouts/automagik.json` replaces v0.2.0's bots-only `mods/spaces-agents/layouts/automagik.json`. The installer replaces an installed copy only when it is byte-identical to the v0.2.0 file; otherwise it keeps it and prints a note. Every mod keeps `place: "none"`. | Owner ruling 9 and herdr-bots A18. |
| D9 | **Integration branch.** Groups merge into `wish/am-pack`; `dev` receives one merge, which cuts one release, **v0.3.0**. | Every shipping merge into `dev` cuts a release (herdr-bots A14). Landing the groups one by one would publish half-built packs. |
| D10 | **Pocket Link is not in the pack.** The installer writes only folders the pack owns. It moves a live folder aside to `<app home>/automagik-herdr/backup/<mod>-<timestamp>`, never deletes one, and keeps `.state/`, dotfiles and `node_modules`. | Owner rulings 10 and 11, after the 18:40 run erased Pocket Link's pairing key. |
| D11 | **Bridge asset for v0.2.0 updaters.** v0.3.0 also publishes `automagik-herdr-<v>.tgz` holding only `spaces-agents/` (the new am-sidebar code under the old prefix). v0.2.0's `update.mjs` accepts it, because it refuses any entry outside `spaces-agents/` (`update.mjs:88-138`). The new `update.mjs` it brings then installs the full pack and runs the migration on its next run, which happens at once. | v0.2.0 users already get "run automagik-herdr update" notices. Without the bridge, that command fails with "not a plain pack". One extra `git archive` line is cheaper than telling every install to rerun curl. |
| D12 | **Rename sequence: expand → migrate → contract-later.** Group 6 makes the installer and updater understand both names, through a migration map. Group 7 renames each surface. The old names stay readable for one release. | A wide rename on a live install needs both names to work while state moves. |
| D13 | **Writers.** t187 owns the pack content: Groups 1, 2 and 5a. The herdr-bots team owns release machinery, the footer, the sidebar and the rename: Groups 3, 4, 5b, 6, 7 and 8. Each group claims its card before it starts. | Two writers already touched `pack/vendor-on-dev`; disjoint file sets prevent collisions. |

## Simplicity Case

- **Simplest complete design:**
  - one tarball, one installer, one updater, one layout;
  - the footer reuses the sidebar's own dialogs through mod commands;
  - the rename is a map the installer applies once.
- **Added machinery:**
  - the bridge asset (D11), because v0.2.0 installs exist and their updater accepts only one prefix;
  - the migration map (D12), because shared keys and state folders live on in installs;
  - the integration branch (D9), because every shipping merge to `dev` releases.
- **Deferred until measured:**
  - removing the old-name support: after one release, once no `update --check` reports a pre-rename VERSION;
  - per-mod versions: only if a mod needs to ship alone;
  - catalog publication to herdr.dev.
- **Complexity removed:**
  - `scripts/install.mjs` as a second installer;
  - bot code in the footer;
  - two layouts;
  - Pocket Link snapshots;
  - per-mod `gpui-kit.d.ts`/`jsconfig.json` copies (editor typings, kept out of git);
  - sidebar-chrome's 25 unused icons.

## Dependencies

**depends-on:** herdr-bots
**blocks:** none

## Success Criteria

- [ ] On a scratch `HERDR_APP_HOME` with plain Herdr, the curl one-liner installs the eight `am-*` mods and `layouts/automagik.json`, `herdr-app check` passes for each, and after the layout switch Herdr shows the sidebar, footer rail, tab bar and `+` menu with no mod errors.
- [ ] A v0.2.0 install (spaces-agents, its before-install copy, `.prev`, shared keys, `automagik.json` layout) runs `automagik-herdr update` and ends on v0.3.0. It has the eight `am-*` folders, its shared keys under `am.*`, and its layout replaced only if unedited. Nothing outside the pack's folders has changed: Pocket Link's folder is byte-identical.
- [ ] `automagik-herdr update --rollback` returns that install to v0.2.0 working.
- [ ] The footer's Bots tab opens New bot and the bot picker. The sidebar body has no New bot row.
- [ ] `grep -rn "0xRowdy\|herdr-cliproxy"` finds only NOTICE's credit line. A reviewer's diff of `mods/am-quota` against the upstream repo shows no shared lines.
- [ ] Every mod folder has `LICENSE` (Apache-2.0). All three MIT-derived mods also have `LICENSE-upstream`.

## Execution Strategy

### Wave 1 (parallel)

| Group | Agent | Complexity | Model | Description |
|-------|-------|------------|-------|-------------|
| 1 | engineer (t187) | Medium: large mechanical import; provenance and licences matter more than logic | inherit | Vendored pack onto `wish/am-pack`, pruned and relicensed |
| 2 | engineer (t187) | High: handles live account credentials; mandatory security quality pass | inherit | am-quota, clean-room |

### Wave 2 (parallel, disjoint files)

| Group | Agent | Complexity | Model | Description |
|-------|-------|------------|-------|-------------|
| 3 | engineer | High: release machinery and the updater (trust boundary), full gate | inherit | One download, one installer, the bridge asset |
| 4 | engineer | Low: two tabs and one removed row | inherit | The footer owns New bot |
| 5a | engineer (t187) | Medium: merges two mods' renderers | inherit | am-markdown from md-menu + markdown-browser |

### Wave 3 (sequential)

| Group | Agent | Complexity | Model | Description |
|-------|-------|------------|-------|-------------|
| 5b | engineer | Medium: moves a dialog into the sidebar mod | inherit | space-icon inside the sidebar |
| 6 | engineer | High: live-state migration | inherit | Rename expand: the migration map in installer and updater |
| 7 | engineer | Medium: wide mechanical rename, per surface | inherit | Rename migrate: folders, ids, commands, keys |
| 8 | engineer + qa | High: end-to-end on scratch homes | inherit | Integrate, verify, merge to dev, v0.3.0 |

**Global constraints:**
- macOS; Herdr from `brew install --cask penso/tap/herdr-gpui`; Node ≥ 22.7.
- POSIX `sh` for install.sh; `shellcheck -s sh` clean.
- Install and update tests run only against a scratch `HERDR_APP_HOME` or `--app-home`, never `~/.config/herdr-app`.
- Never write, move or delete `mods/pocket-link`; never touch the `dev.herdr.pocket-link` LaunchAgent.
- Every mod keeps `place: "none"`.
- Conventional commits (bash commitlint in CI).
- No `git stash`/`checkout`/`reset` in a shared checkout; worktrees only.
- PRs target `wish/am-pack`; only Group 8 targets `dev`.
- Each group stays within 25 files and 2,000 insertions, excluding `git mv` renames, which are counted as moves.
- Payloads to CLIs go through files.

## Execution Groups

### Group 1: The vendored pack lands

**Goal:** `wish/am-pack` (branched from `dev` with v0.2.0 and herdr-bots G5) holds the vendored mods, catalog and pack docs under their current names, without Pocket Link, with every mod Apache-2.0 and the full gate green.

**Deliverables:**
1. Rebase `pack/vendor-on-dev` onto `wish/am-pack`, resolving against G8–G11 and G5:
   - README: keep v0.2.0's structure and append the pack sections.
   - `mods/spaces-agents/RECIPE.md`: G5's version wins.
   - Drop the root `layouts/bots.json`.
2. Prune `mods/sidebar-chrome` to the 8 icons `main.js` uses: puzzle, clock, layers, smartphone, settings, plus (rail), search, sidebar (brand row); `image("frame/welcome/herdr.png")` is Herdr's own frame and stays referenced. Exclude `mods/am-quota`, `test/am-quota-*.test.mjs`, the `am-quota-panel` block in `layouts/automagik.json` and the footer's Quota tab: they land with Group 2 (the installer refuses a layout that places a mod nobody installs). Keep `gpui-kit.d.ts` and `jsconfig.json` out of git in every mod (`.gitignore`).
3. Apache-2.0 `LICENSE` in every mod. The three MIT forks (automations, markdown-browser, mod-manager) each keep a separate `LICENSE-upstream` holding the MIT text verbatim; markdown-browser's and mod-manager's current `LICENSE` (the MIT text) moves to `LICENSE-upstream`. NOTICE credits each upstream.
4. `catalog/index.json` regenerated with `scripts/catalog.mjs`: pack name `automagik-herdr`, branch `dev`, no `headCommit` pinned to a local commit.
5. Pocket Link absent: no folder, no catalog entry other than an external link to automagik-pocket. The installer refuses foreign folders (pack commits c3606e0, e5b4dd9).
6. Land as two PRs into `wish/am-pack`, each within the band: (a) sidebar-chrome, auto-tabs, new-menu-tui, keys.json; (b) md-menu, markdown-browser, space-icon, automations, mod-manager, catalog, scripts/catalog.mjs, NOTICE, RECIPE.md, README.

**Interfaces:**
- Consumes: `dev` at v0.2.0 plus herdr-bots G5: `mods/spaces-agents/*`, `install.sh`, `update.mjs`, `release.yml`, `scripts/version.mjs`, `mods/spaces-agents/layouts/automagik.json`.
- Produces: `mods/{auto-tabs,sidebar-chrome,new-menu-tui,md-menu,markdown-browser,space-icon,automations,mod-manager}/` each with `main.js`, `mod.json` (`place: "none"`), `LICENSE`, `RECIPE.md`; `layouts/automagik.json` (full pack layout); `catalog/index.json`; `catalog/repos.json`; `keys.json`; `scripts/catalog.mjs`; `scripts/install.mjs` (kept until Group 3 folds it in).

**Acceptance Criteria:**
- [ ] `herdr-app check` passes on a scratch copy of every mod folder.
- [ ] No `pocket-link` folder; `git grep -n pocket-link -- mods scripts catalog` finds only the footer tab's `mod.open` and the catalog's external link.
- [ ] Every `mods/*/LICENSE` is Apache-2.0. All three MIT-derived mods have `LICENSE-upstream` with the original copyright line.
- [ ] `node scripts/catalog.mjs --check` passes.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/*/*.js mods/*/*.mjs mods/*/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check && sh -n install.sh && node scripts/catalog.mjs --check && for d in mods/*/; do grep -q "Apache License" "$d/LICENSE" || { echo "no Apache LICENSE in $d"; exit 1; }; done
```

**depends-on:** none (herdr-bots Group 5 merged into `dev` first)

---

### Group 2: am-quota, clean-room

**Goal:** A footer Quota icon opens a panel that shows each CLIProxyAPI account's usage windows and switches the local client to the account the policy picks, without ever exposing a token.

**Deliverables:**
1. `mods/am-quota/` (current folder name; Group 7 keeps it):
   - `policy.js`: the pure `choose(accounts, {provider, now, activeId, marginMinutes?, holdMinutes?})` → `{action: "keep"|"switch"|"none", to, reason, facts}`;
   - the panel;
   - the switch.
   It reads quotas and accounts from one configurable base URL plus a management key held in a file or the environment.
2. The footer Quota tab and the `am-quota-panel` block in `layouts/automagik.json` (both deferred here from Group 1).
3. Tests: the policy edges, the API translation, and the credential write.

**Interfaces:**
- Consumes: CLIProxyAPI management endpoints, used read-only except the credential download:
  - `GET /v0/management/plugins/cpa-quota-api-extension/v1/quotas`
  - `GET …/v1/accounts`
  - `GET /v8/management/credentials/download?name=`
- Produces: `mods/am-quota/{main.js,policy.js,mod.json,LICENSE,RECIPE.md}`; footer tab id `quota`.

**Acceptance Criteria:**
- [ ] A downloaded credential is written mode 0600 through a temp file and an atomic rename. It never appears in notify text, a shared key, a log line, an error message or argv. The management key never appears in argv.
- [ ] A reviewer's line diff of `mods/am-quota` against 0xRowdy/herdr-cliproxy finds no shared lines.
- [ ] The policy tests cover:
  - the 15-minute window measured against the candidate's `reset_at`;
  - a flat window at the 2% floor counting as dry;
  - ties broken by headroom, then id.
- [ ] A separate security quality pass returns PASS.

**Validation:**
```bash
node --test 'test/am-quota-*.test.mjs' && for f in mods/am-quota/*.js; do node --check "$f" || exit 1; done && herdr-app check "$(mktemp -d)/am-quota" 2>/dev/null; cp -R mods/am-quota "${TMPDIR:-/tmp}/amq-check" && herdr-app check "${TMPDIR:-/tmp}/amq-check"
```

**depends-on:** Group 1

---

### Group 3: One download, one installer, the bridge

**Goal:** A release publishes one pack tarball (plus the bridge), and `install.sh` with `update.mjs` installs, updates and rolls back every pack-owned mod as one unit, never touching anything else.

**Deliverables:**
1. `release.yml`:
   - `git archive … v<v>` of `mods/*` (except pocket-link) and `layouts/automagik.json` → `automagik-herdr-pack-<v>.tgz`;
   - the bridge `automagik-herdr-<v>.tgz` (`mods/spaces-agents` under prefix `spaces-agents/`, D11);
   - both listed in `SHA256SUMS`;
   - `catalog/index.json` regenerated before tagging.
2. `update.mjs install|update|rollback` over N folders:
   - the pack's folder list comes from the tarball's top level, checked against a `PACK_MODS` list shipped in the pack;
   - every folder is extracted, checked, swapped and its old copy moved into one `<app home>/automagik-herdr/.prev/` set;
   - `.state/`, dotfiles and `node_modules` are kept per D10;
   - a folder not in `PACK_MODS` is refused.
3. `install.sh` downloads the pack tarball and absorbs `scripts/install.mjs`:
   - free-key merge of `keys.json` (a key in use stays the person's);
   - `<app home>/data/mod-manager/catalog.json`;
   - `herdr-app check` per mod;
   - the layout replaced only when byte-identical to v0.2.0's (D8).
   `scripts/install.mjs` is then deleted.
4. Tests flipped and added. G11's "layouts holds only automagik.json naming only spaces-agents and stock mods" becomes "the shipped layout names only pack mods and stock mods". Add tests for:
   - a v0.2.0-shaped home updated by the bridge;
   - an `.prev` set rollback;
   - a pocket-link folder byte-identical after install, update and rollback;
   - a foreign folder refused.

**Interfaces:**
- Consumes: Group 1's `mods/*` and `layouts/automagik.json`; v0.2.0's `update.mjs install --from <tgz> --version <v> --mods <dir>`.
- Produces:
  - `update.mjs install --from <pack.tgz> --version <v> --mods <dir>`
  - `update.mjs update [--check] [--json]`
  - `update.mjs rollback`
  - `PACK_MODS` (in `mods/spaces-agents/release.js`)
  - asset names `automagik-herdr-pack-<v>.tgz` and `automagik-herdr-<v>.tgz`

**Acceptance Criteria:**
- [ ] On a scratch home, install → update → rollback leaves every pack folder at the expected VERSION, and a planted `mods/pocket-link` byte-identical (shasum of every file).
- [ ] A v0.2.0-shaped scratch home updated through the bridge ends with the full pack installed.
- [ ] One installer: `scripts/install.mjs` is gone and the README names only install.sh.
- [ ] `actionlint` and `shellcheck -s sh` are clean. The full gate passes.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/*/*.js mods/*/*.mjs mods/*/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check && sh -n install.sh && shellcheck -s sh install.sh && actionlint
```

**depends-on:** Group 1

---

### Group 4: The footer owns New bot

**Goal:** The footer rail carries a Bots tab that opens New bot and the bot picker, and the sidebar body no longer spends a row on New bot.

**Deliverables:**
1. `mods/sidebar-chrome/main.js`: a Bots tab (a bot glyph SVG). Click runs `run("spaces-agents.new-bot")`. Its right-click, or a second "Bots" entry, runs `run("spaces-agents.edit")`, which opens the existing pick popup. The tab shows only while `mods/spaces-agents/mod.json` exists.
2. `mods/spaces-agents/main.js`: the New bot row (`:1077`) removed. The `new-bot` command and the bot-row menus are unchanged.
3. README: New bot is in the footer.

**Interfaces:**
- Consumes: mod commands `spaces-agents.new-bot` and `spaces-agents.edit`, handled in `spaces-agents/main.js` `botCommand`.
- Produces: footer tab id `bots`.

**Acceptance Criteria:**
- [ ] A `herdr-app shot` cropped to the footer shows the Bots tab. Clicking it, by `herdr-app do` of the mod command, opens the Create form. The sidebar shows no New bot row.
- [ ] `herdr-app check` passes for both mods.

**Validation:**
```bash
node --test 'test/*.test.mjs' && node --check mods/sidebar-chrome/main.js && node --check mods/spaces-agents/main.js
```

**depends-on:** Group 1

---

### Group 5a: am-markdown

**Goal:** One mod does what md-menu and markdown-browser do today: right-click a terminal for the Markdown files it printed, and preview one in a pane.

**Deliverables:**
1. Code-only merge into `mods/md-menu/` (Group 7 renames it `am-markdown`): md-menu's terminal menu plus markdown-browser's renderer in one folder; current names and `markdown-browser.*` shared keys stay for Groups 6–7 to move. markdown-browser's MIT notice moves into md-menu's `LICENSE-upstream`, and `mods/markdown-browser` is deleted.
2. `layouts/automagik.json`'s `terminal_menu` entry points at the merged mod. Catalog and NOTICE are updated.

**Interfaces:**
- Consumes: Group 1's `mods/md-menu`, `mods/markdown-browser`.
- Produces: `mods/md-menu/{main.js,mod.json,LICENSE,LICENSE-upstream,RECIPE.md}` with the renderer inside.

**Acceptance Criteria:**
- [ ] On a scratch home, right-clicking a terminal that printed a `.md` path lists it, and clicking it opens the preview. The test and recipe say how this was checked.
- [ ] `herdr-app check` passes.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/md-menu/*.js; do node --check "$f" || exit 1; done
```

**depends-on:** Group 1

---

### Group 5b: space-icon inside the sidebar

**Goal:** The space icon dialog is part of the sidebar mod, so one folder owns the spaces list and its icons.

**Deliverables:**
1. space-icon's dialog moves to `mods/spaces-agents/spaceIcon.js` (with `emoji-data.js`), opened by `openOverlay({mod: "spaces-agents", kind: "dialog", props: {spaceIcon: <space id>}})`. `mods/space-icon` is deleted.
2. The `space.colors` shared key is read unchanged; Group 6 migrates it.

**Interfaces:**
- Consumes: `mods/space-icon/*`; `spaces-agents/main.js:1027`'s `openOverlay`.
- Produces: `spaces-agents` dialog props `{spaceIcon: string}`.

**Acceptance Criteria:**
- [ ] The space row's icon opens the dialog. Emoji, image and colour (including transparent) still apply.
- [ ] `mods/space-icon` is gone, and the catalog lists no space-icon mod.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/spaces-agents/*.js; do node --check "$f" || exit 1; done
```

**depends-on:** Group 4

---

### Group 6: Rename expand — the migration map

**Goal:** The installer and updater know every old→new name, and running either on an old-named install migrates folders, state and shared keys exactly once.

**Deliverables:**
1. `mods/spaces-agents/migrate.js`, pure: `RENAMES` (folder map per D4) and `KEY_RENAMES`:
   - `spaces-agents.icons` → `am.icons`
   - `spaces-agents.projects` → `am.projects`
   - `spaces-agents.update-shown` → `am.update-shown`
   - `space.colors` → `am.space-colors`
   - `sidebar.collapsed` → `am.sidebar-collapsed`
   - `sidebar.width` → `am.sidebar-width`
   - every `markdown-browser.*` key → `am.markdown.*`
   It exports `plan(installed)` → the list of moves. Both `update.mjs` and `install.sh` (through node) apply it: folders are moved aside per D10; `shared.json` keys are copied (never deleted, for one release); `.prev`/`.before-install` are renamed; layout references to old mod names are rewritten only in the pack's own unedited layout.
2. The mods read the new key first, then the old one.

**Interfaces:**
- Consumes: Group 3's `update.mjs`, `install.sh`, `PACK_MODS`.
- Produces: `RENAMES: Record<string,string>`, `KEY_RENAMES: Record<string,string>`, `plan(installed: {mods: string[], keys: string[]}) → {move: [from,to][], copyKeys: [from,to][]}`.

**Acceptance Criteria:**
- [ ] Applying the plan twice is a no-op the second time.
- [ ] An old-named scratch home keeps its bots, icons, colours and collapsed state after migration.
- [ ] `mods/pocket-link` is untouched.

**Validation:**
```bash
node --test 'test/*.test.mjs' && node --check mods/spaces-agents/migrate.js && sh -n install.sh
```

**depends-on:** Group 3, Group 5b

---

### Group 7: Rename migrate — per surface

**Goal:** Every folder, mod id, mod command, title and doc uses the `am-*` names of D4.

**Deliverables:**
1. Three commits, one per surface:
   - (a) `git mv mods/spaces-agents mods/am-sidebar`, with its mod commands (`am-sidebar.new-bot`, …), `bin/`, `release.js` and the tests;
   - (b) `am-footer`, `am-tabs`, `am-new-menu`, `am-automations`, `am-mods`, `am-markdown`, `am-quota` folders, their `mod.json` titles and the cross-mod `mod.open`/`run` names;
   - (c) `layouts/automagik.json`, `keys.json`, `catalog/*`, `release.yml` paths, `scripts/version.mjs`'s VERSION path, install.sh, README, RECIPE and NOTICE.
2. Mod commands keep the old names as aliases for one release.

**Interfaces:**
- Consumes: Group 6's `RENAMES`.
- Produces: the D4 folder names. `PACK_MODS` lists them.

**Acceptance Criteria:**
- [ ] `git grep -n "spaces-agents\|sidebar-chrome\|auto-tabs\|new-menu-tui\|mod-manager\|md-menu\|markdown-browser"` finds only migrate.js, NOTICE's provenance lines and alias handlers.
- [ ] `herdr-app check` passes for all eight mods on a scratch copy.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/*/*.js mods/*/*.mjs mods/*/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check && sh -n install.sh && actionlint
```

**depends-on:** Group 6, Group 2, Group 5a

---

### Group 8: Integrate, verify, release v0.3.0

**Goal:** `wish/am-pack` merges into `dev` once, cuts v0.3.0, and both a fresh install and a v0.2.0 upgrade are proven on scratch homes.

**Deliverables:**
1. Merge `dev` into `wish/am-pack` and run the full gate.
2. Run the QA criteria on scratch homes, plus `herdr-app shot` of the sidebar, footer and tab bar on a scratch-home Herdr window (or the owner's, read-only).
3. Open a PR `wish/am-pack` → `dev`, merge it, and verify the release has both tarballs and `SHA256SUMS`.
4. Give the owner a click-through checklist.

**Interfaces:**
- Consumes: every group.
- Produces: GitHub release v0.3.0.

**Acceptance Criteria:**
- [ ] Every Success Criterion above, with evidence in Review Results.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/*/*.js mods/*/*.mjs mods/*/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check && sh -n install.sh && shellcheck -s sh install.sh && actionlint && node scripts/catalog.mjs --check
```

**depends-on:** Group 7, Group 4

---

## QA Criteria

_What must be verified on dev after merge. The QA agent tests each criterion._

- [ ] A fresh scratch home installs v0.3.0 with the curl one-liner: eight mods, the layout, the CLI link, and no mod errors after the switch.
- [ ] A scratch home at v0.2.0 updates through `automagik-herdr update` to v0.3.0 and keeps its bots, icons and colours. `--rollback` returns it to v0.2.0.
- [ ] `mods/pocket-link` and any other non-pack folder in the scratch home are byte-identical before and after install, update and rollback.
- [ ] The footer Bots tab opens New bot. The Quota tab opens the panel. The Pocket Link tab shows only when Pocket Link is installed.

---

## Assumptions / Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| The installer touches a mod it doesn't own (the 18:40 incident) | High | D10; PACK_MODS allowlist; a planted pocket-link byte-identical test in Groups 3 and 6; scratch homes only |
| A credential leaks from am-quota | High | Group 2's 0600/atomic/no-argv criteria and a separate security pass |
| v0.2.0 installs stranded by the new tarball shape | Medium | The D11 bridge asset; a test with a v0.2.0-shaped home |
| Rebase conflicts: the pack branch was cut from 695eced, and dev has since gained G8–G11 and G5 | Medium | Group 1 resolves them with the README rule stated; G5's RECIPE wins |
| Group size over the band (the pack is ~97 files) | Medium | Two PRs in Group 1; pruned icons; typings out of git |
| am-automations name not confirmed by the owner | Low | Rename it before Group 7 if the owner prefers another |

---

## Review Results

_The read-only reviewer returns evidence; the invoking orchestrator appends a timestamped block here after plan, execution, and PR reviews._

---

## Files to Create/Modify

```
mods/{auto-tabs,sidebar-chrome,new-menu-tui,md-menu,markdown-browser,space-icon,automations,mod-manager}/   (Group 1, from pack/vendor-on-dev)
mods/am-quota/                                  (Group 2)
layouts/automagik.json, catalog/*, keys.json, NOTICE, RECIPE.md, README.md, scripts/catalog.mjs
.github/workflows/release.yml, mods/spaces-agents/update.mjs, mods/spaces-agents/release.js, install.sh, scripts/version.mjs   (Group 3)
scripts/install.mjs                              (deleted, Group 3)
mods/sidebar-chrome/main.js, mods/spaces-agents/main.js   (Group 4)
mods/markdown/                                   (Group 5a; md-menu and markdown-browser deleted)
mods/spaces-agents/spaceIcon.js, emoji-data.js   (Group 5b; mods/space-icon deleted)
mods/spaces-agents/migrate.js                    (Group 6)
mods/am-* (git mv)                               (Group 7)
test/*.test.mjs
```
