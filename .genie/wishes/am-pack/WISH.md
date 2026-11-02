# Wish: The am pack — every Automagik mod in one download, renamed am-*

| Field | Value |
|-------|-------|
| **Status** | APPROVED |
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
  - v0.2.0 installs move to v0.3.0 by rerunning the curl installer (D11).
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
| D5 | **New bot leaves the sidebar body; the footer gets one Bots tab.** The Bots tab (a robot glyph) is placed first in the rail: Bots, Mods, Automations, Quota, Pocket Link. Clicking it opens a small popup owned by sidebar-chrome, which closes on Esc, with "New bot" and "Bot settings". Each entry runs `openOverlay({ mod: "spaces-agents", kind: "dialog", modal: true, props: { form: "create" } })` or `props: { form: "pick" }` respectively. The tab works with no bot defined. The sidebar's wide "+ New bot" row (`spaces-agents/main.js:1073-1078`) is removed. The bot management suite is the sidebar's existing dialogs, and no bot code is copied. | Owner via t187, 2026-11-01: the action must not appear twice, and the menu offers both New bot and the bot settings pane. `run("<mod>.<cmd>")` reaches only a shown copy of that mod (Herdr AGENTS.md:738); `openOverlay` starts its own copy, so the tab works even when no layout shows the sidebar, and `spaces-agents` `init` reads `props()` first and returns a `BotForm` (`main.js:119-122`; `create.js:44-58` pick, `:100-116` create). Sizes match `openBotForm`: create `FORM_SIZE` 1000×840 (`create.js:25`), pick 560 × 0.85 window height (`main.js:30`). |
| D6 | **Every mod is Apache-2.0.** The three MIT forks, automations (DnzzL), markdown-browser (ohneda) and mod-manager (repository jacksonpires/herdr-app-mod-manager; copyright line "Copyright (c) 2026 speardragon", kept verbatim), ship under Apache-2.0 as derived works, with the upstream MIT copyright and permission notice verbatim in `LICENSE-upstream` and NOTICE. | Owner ruling 7. MIT permits this; the notice is its one condition. |
| D7 | **am-quota is clean-room.** No line comes from 0xRowdy/herdr-cliproxy, which has no licence. | Owner ruling on cliproxy, and copyright law. |
| D8 | **One layout, `automagik`.** The pack's root `layouts/automagik.json` replaces v0.2.0's bots-only `mods/spaces-agents/layouts/automagik.json`. The installer replaces an installed copy only when it is byte-identical to the v0.2.0 file; otherwise it keeps it and prints a note. Every mod keeps `place: "none"`. | Owner ruling 9 and herdr-bots A18. |
| D9 | **Integration branch.** Groups merge into `wish/am-pack`; `dev` receives one merge, which cuts one release, **v0.3.0**. | Every shipping merge into `dev` cuts a release (herdr-bots A14). Landing the groups one by one would publish half-built packs. |
| D10 | **Pocket Link is not in the pack.** The installer writes only folders the pack owns. It moves a replaced pack release into the one `<app home>/automagik-herdr/.prev/` set and anything the person owned into `backup/<mod>-<date>/` (never replaced), never deletes one, and carries `.state/`, dotfiles and `node_modules` into the replacement, including when an adopted old-named folder becomes its `am-*` folder. | Owner rulings 10 and 11, after the 18:40 run erased Pocket Link's pairing key. |
| D11 | **No bridge: v0.2.0 installs move by rerunning the curl installer.** It recognises a v0.2.0 home (its marker and `mods/spaces-agents`), installs the pack and runs the Group 6 migration. v0.2.0's own `automagik-herdr update` stays on v0.2.0: its `pickUpdate` finds no `automagik-herdr-<v>.tgz` in later releases and reports nothing. | Owner via t187, 2026-11-01. v0.2.0 is mostly on the owner's team's machines, but the repo and one-liner are public, so the README gets an upgrade note and the v0.3.0 release notes say "rerun the installer"; together they are cheaper than a bridge build. The reviewer showed a bridge can't finish the upgrade on its own (v0.2.0's CLI imports `update.mjs` statically and exits), and it would have to ship with every release. |
| D12 | **Folders and display names are both renamed, with a migration (owner, 2026-11-01).** Herdr routes `<mod>.<command>`, `mod.open:<mod>`, layout `content.mod`, `data/<mod>/` and per-mod storage by folder name, so there are no aliases. The migration rewrites everything that names an old folder (Group 6a) and makes the briefing hook's path rename-proof (Group 6b). Shared-key shims read the old key and write `am.*` for one release. | The owner chose clean folder names over titles only, with the full list of what breaks in front of him. Owner's layouts are migrated, each with a dated backup, because leaving them blanks the sidebar. |
| D13 | **Writers.** t187 owns the pack content: Groups 1, 2 and 5a. The herdr-bots team owns release machinery, the footer, the sidebar and the rename: Groups 3, 4, 5b, 6, 7 and 8. Each group claims its card before it starts. | Two writers already touched `pack/vendor-on-dev`; disjoint file sets prevent collisions. |

## Simplicity Case

- **Simplest complete design:**
  - one tarball, one installer, one updater, one layout;
  - the footer reuses the sidebar's own dialogs through mod commands;
  - the rename is a map the installer applies once.
- **Added machinery:**
  - the installer's v0.2.0 path (D11), because v0.2.0 installs exist;
  - the migration map (D12), because shared keys and state folders live on in installs;
  - the integration branch (D9), because every shipping merge to `dev` releases.
- **Deferred until measured:**
  - removing the old-name support: with v0.4.0, one release after this ships (the shims and the OURS old shapes go then);
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

Group 8 (release v0.3.0) also waits for sidebar-rules Groups 2–5, which land in `wish/am-pack` after Group 7 and ship with v0.3.0 (owner, 2026-11-02).

## Success Criteria

- [ ] On a scratch `HERDR_APP_HOME` with plain Herdr, the curl one-liner installs the eight `am-*` mods and `layouts/automagik.json`, `herdr-app check` passes for each, and after the layout switch Herdr shows the sidebar, footer rail, tab bar and `+` menu with no mod errors.
- [ ] A v0.2.0 install (spaces-agents, its before-install copy, `.prev`, shared keys, `automagik.json` layout, a `main-agents`-style edited layout, keys bound to `spaces-agents.paste`, a Claude bot's briefing hook) reruns the curl installer and ends on v0.3.0. It has the eight `am-*` folders, shared keys under `am.*`, every layout and key binding pointing at the new names (each layout backed up first), the `automagik-herdr` link working, and the briefing hook firing. Nothing outside the pack's folders has changed: Pocket Link's folder is byte-identical.
- [ ] `automagik-herdr update --rollback` returns that install to v0.2.0 working.
- [ ] The footer's Bots tab, first in the rail, opens a popup with New bot and Bot settings. The sidebar body has no New bot row.
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
| 3 | engineer | High: release machinery and the updater (trust boundary), full gate | inherit | One download, one installer, ownership record |
| 4 | engineer | Low: one tab, one popup, one removed row; after Group 2 | inherit | The footer owns New bot |
| 5a | engineer (t187) | Medium: merges two mods' renderers | inherit | am-markdown from md-menu + markdown-browser |

### Wave 3 (sequential)

| Group | Agent | Complexity | Model | Description |
|-------|-------|------------|-------|-------------|
| 5b | engineer | Medium: moves a dialog into the sidebar mod | inherit | space-icon inside the sidebar |
| 6a | engineer | High: rewrites the person's layouts, keys and shared state, with backups | inherit | Rename migration: layouts, keys, shared state, app-home paths |
| 6b | engineer | High: touches each project's Claude settings | inherit | The briefing hook survives renames |
| 6c | engineer | Medium: installs a third-party binary (checksum-pinned) and runs it on a timer | inherit | usagemeter: installed by install.sh, synced while Herdr is open |
| 7 | engineer | Medium: wide mechanical rename, three PRs | inherit | Rename: folders, ids, commands, docs |
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
6. Land as four PRs into `wish/am-pack`, each within the band (count files and insertions in each PR body): (a) sidebar-chrome, auto-tabs, new-menu-tui, keys.json, `layouts/automagik.json` (without the `am-quota-panel` block); (b) md-menu, markdown-browser, space-icon; (c) automations, mod-manager; (d) catalog/*, scripts/catalog.mjs, NOTICE, RECIPE.md, README sections.
7. `scripts/catalog.mjs`: an unknown flag prints usage and exits 2 without writing; `--check` compares only fields derived from content (mod names, blurbs, licences, recipe presence, one owner per name), never `headCommit`, `pushedAt` or the index's age.

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
1. Input: pack commit c727dab's `mods/am-quota` (written by t187 against the CLIProxyAPI), checked line by line against 0xRowdy/herdr-cliproxy; any shared line is rewritten. Docs may name "CLIProxyAPI" (the API) but carry no cliproxy-mod text. `mods/am-quota/` (current folder name; Group 7 keeps it):
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
node --test 'test/am-quota-*.test.mjs' && for f in mods/am-quota/*.js; do node --check "$f" || exit 1; done && d=$(mktemp -d) && cp -R mods/am-quota "$d/am-quota" && herdr-app check "$d/am-quota"
```

**depends-on:** Group 1

---

### Group 3: One download, one installer, ownership record

**Goal:** A release publishes one pack tarball, and `install.sh` with `update.mjs` installs, updates and rolls back every pack-owned mod as one unit, never touching anything else.

**Deliverables:**
1. `release.yml`:
   - `git archive … v<v>` of `mods/*` (except pocket-link) and `layouts/automagik.json` → `automagik-herdr-pack-<v>.tgz`;
   - listed in `SHA256SUMS`;
   - `catalog/index.json` regenerated before tagging.
2. `update.mjs install|update|rollback` over N folders:
   - the pack's folder list comes from the tarball's top level, checked against a `PACK_MODS` list shipped in the pack;
   - every folder is extracted, checked, swapped and its old copy moved into one `<app home>/automagik-herdr/.prev/` set;
   - `.state/`, dotfiles and `node_modules` are kept per D10;
   - a folder not in `PACK_MODS` is refused. `PACK_MODS` ships inside the tarball it checks, so it guards against packaging bugs, not tampering (the checksum covers integrity); `release.yml` asserts the archive's top level equals `PACK_MODS`.
   - One rollback story: install and update both keep the replaced copies in `<app home>/automagik-herdr/.prev/` (one set, the latest); `install.sh` uses the same place, no timestamped backups.
3. `install.sh` downloads the pack tarball and absorbs `scripts/install.mjs`:
   - free-key merge of `keys.json` (a key in use stays the person's);
   - `<app home>/data/mod-manager/catalog.json`;
   - `herdr-app check` per mod;
   - the layout replaced only when byte-identical to v0.2.0's (D8);
   - an ownership record: the marker lists every folder the installer put in `mods/`. Only listed folders are replaced, updated or rolled back. An old-named folder it didn't install (the owner's hand-installed sidebar-chrome, auto-tabs, …) is reported and left alone, or adopted only on an explicit yes (`--adopt`), which moves it to `<app home>/automagik-herdr/backup/<mod>-<date>/` first. That folder is never replaced, and `--uninstall` and a rollback across the rename restore from it. `.prev/` holds only pack releases. v0.2.0's `spaces-agents.before-install` also moves to `backup/`;
   - a v0.2.0 marker (`layout=added`, `before=…`) is read and carried over, and `--uninstall` handles both marker versions and the layout's new path.
   `scripts/install.mjs` is then deleted.
4. From Group 1's review (2026-11-02), owned here because this group replaces all three install paths (`scripts/install.mjs`, `update.mjs`, the mod manager's `core.js`):
   - build each new mod folder in a staging dir next to `mods/`, carry the private paths in, then rename into place; on any failure rename the old folder back. Today a failed copy leaves a half-written mod (review probes P2, C4);
   - a symlinked `.state` stays a link (today the carry-over turns it into a copy, probe C2);
   - the mod manager installs at the catalog's `headCommit`, not whatever HEAD is;
   - tests for `install.mjs`, `catalog.mjs` and `core.js`; CI runs `catalog.mjs --check` and `node --check` over every pack mod.
5. Tests flipped and added. G11's "layouts holds only automagik.json naming only spaces-agents and stock mods" becomes "the shipped layout names only pack mods and stock mods". Add tests for:
   - a v0.2.0-shaped home upgraded by rerunning install.sh (before Group 6, the pack lands beside spaces-agents);
   - old-named folders the installer didn't write are left alone without `--adopt`;
   - adopt, then update twice: the adopted original is still in `backup/`;
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
  - asset name `automagik-herdr-pack-<v>.tgz`
  - marker format v2: `version=`, `mods=<comma list>`, `layout=added|kept`, `before=kept|none`

**Acceptance Criteria:**
- [ ] On a scratch home, install → update → rollback leaves every pack folder at the expected VERSION, and a planted `mods/pocket-link` byte-identical (shasum of every file).
- [ ] A v0.2.0-shaped scratch home with hand-installed old-named mods: rerunning install.sh installs the pack, leaves the hand-installed folders untouched without `--adopt`, and with `--adopt` moves them to `backup/<mod>-<date>/` first (never `.prev/`, which holds only pack releases).
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
1. `mods/sidebar-chrome/main.js` and `mods/sidebar-chrome/bot.svg`: the Bots tab, first in the rail. It opens a popup (sidebar-chrome props `{ botsMenu: true }`) listing "New bot" (`openOverlay` of `spaces-agents` with `props.form "create"`) and "Bot settings" (`props.form "pick"`). The tab shows only while `mods/spaces-agents/mod.json` exists, and it works for a project with no bots.
2. `mods/spaces-agents/main.js`: the wide "+ New bot" row (`:1073-1078`) is removed. Bot-row menus and keys are unchanged. If `pick` with no bots defined shows an empty list, it shows one "New bot" line instead.
3. The mod's RECIPE: New bot and Bot settings live in the footer. README lines for this go to Group 3, which owns README in wave 2.

**Interfaces:**
- Consumes: `openOverlay({ mod: "spaces-agents", kind: "dialog", modal: true, props: { form: "create" | "pick" } })`, the forms `spaces-agents` `init` already returns.
- Produces: footer tab id `bots`.

**Acceptance Criteria:**
- [ ] A `herdr-app shot` cropped to the footer (the owner's window, read-only, after a scoped install of sidebar-chrome that moves the old copy aside) shows the Bots tab first. On a scratch home, its popup's two entries open the Create form and the bot picker, including with no bots defined. The sidebar shows no "+ New bot" row.
- [ ] `herdr-app check` passes for both mods.

**Validation:**
```bash
node --test 'test/*.test.mjs' && node --check mods/sidebar-chrome/main.js && node --check mods/spaces-agents/main.js
```

**depends-on:** Group 1, Group 2 (both edit `mods/sidebar-chrome/main.js`; Group 4 puts Bots ahead of Group 2's Quota tab)

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

### Group 6a: Rename migration — layouts, keys, shared state, app-home paths

**Goal:** One idempotent migration moves every reference to an old folder name onto the D4 names, with a backup of every file it rewrites, so nothing the person set up stops working.

**Deliverables:**
1. `mods/spaces-agents/migrate.js`, pure: `RENAMES` (spaces-agents→am-sidebar, sidebar-chrome→am-footer, auto-tabs→am-tabs, new-menu-tui→am-new-menu, md-menu→am-markdown, mod-manager→am-mods, automations→am-automations; am-quota unchanged) and `plan(home)` → the list of moves below. `install.sh` and `update.mjs` (through node) apply it.
2. What it migrates:
   - **Folders:** only the ones the ownership record lists (Group 3).
   - **References follow ownership:** a layout or key reference to an old name is rewritten only when that folder is pack-owned or adopted. A reference to a folder the person kept (no `--adopt`) is left and reported.
   - **Layouts** (`<app home>/layouts/*.json`, the owner's `main-agents` included): `content.mod` and the root `terminal_menu`, old id → new. Each file is backed up to `<app home>/automagik-herdr/backup/layouts-<date>/` first. A file whose structure isn't recognised is left alone and reported.
   - **keys.json:** `spaces-agents.paste`, `spaces-agents.paste_image`, `spaces-agents.close_pane`, `mod.open:mod-manager`, the `mod:markdown-browser` section, and any other `<old>.<command>` or `mod.open:<old>`, all rewritten with a backup. `mod.open:machine-add` and `mod.open:pocket-link` are not ours and are untouched.
   - **Shared state** (`spaces-agents.icons`, `.projects`, `.pets`, `.update-shown`, `.theme-selected`, `space.colors`, `sidebar.collapsed`, `sidebar.width`, `markdown-browser.slots/.show/.last` → `am.*`): never written by the installer or updater, because Herdr owns `shared.json` and saves it in the background (Herdr AGENTS.md:86-88). Each mod's in-mod shim reads `am.*` first, then the old key, and `setShared`s the `am.*` key on first load. The old keys are left in place for one release.
   - **App-home paths:** `spaces-agents-projects.json` → `am-sidebar-projects.json` (copied only when the target is absent, so a file sidebar-rules' tidy already wrote is kept); `space-icons/` stays where it is (shared state references it); `sidebar-agents.json` (the rename map) stays, read by am-sidebar; `data/mod-manager/` copied (not moved) to `data/am-mods/`, and am-mods reads the old directory as a fallback; `data/am-quota/` unchanged.
   - **Per-mod localStorage** (auto-tabs' panel memory) can't be reached from outside the mod. Its loss is stated in the release notes.
   - **The catalog** `modNames` and titles are regenerated after Group 7.
3. `revert(backupDir)`: applies the inverse rename to layouts and keys.json (am-* → old id, only for entries the forward run changed), so edits the person made in between are kept. The dated backups stay for manual recovery. The release notes say shared-state changes made under v0.3.0 are lost on rollback. `update.mjs rollback` calls it when the `.prev/` set holds old-named folders.
4. Tests on scratch homes: a v0.2.0 home plus an owner-shaped home (hand-installed old-named mods, `main-agents.json`, a keys.json with the paste bindings). Running the plan twice is a no-op the second time. An unadopted mod-manager keeps `mod.open:mod-manager`. Migrate → rollback restores v0.2.0 behaviour: the Cmd+V binding, main-agents, the CLI and the hook.

**Interfaces:**
- Consumes: Group 3's ownership record and `update.mjs`; Group 5b's sidebar (space-icon inside it).
- Produces: `RENAMES: Record<string,string>`, `KEY_RENAMES: Record<string,string>`, `plan(home: string) → { folders: [from,to][], layouts: {file, edits}[], keys: [from,to][], shared: [from,to][], paths: [from,to][] }`, `apply(plan, { backupDir }) → { done, skipped: {item, reason}[] }`, `revert(backupDir) → { restored: string[] }`. `apply` writes a change journal (`journal.json`: every edit it made, file and before/after) into `backupDir`, and `revert` reads only that journal, so references the person added after the upgrade are never touched.

**Acceptance Criteria:**
- [ ] On the owner-shaped scratch home, after the migration: Cmd+V's binding names `am-sidebar.paste`; `main-agents.json` names `am-sidebar` and `am-footer`, and its backup exists; the bots, icons, colours and collapsed state survive; `mods/pocket-link` and every non-pack folder are byte-identical.
- [ ] The second run changes nothing and reports nothing to do.

**Validation:**
```bash
node --test 'test/*.test.mjs' && node --check mods/spaces-agents/migrate.js && sh -n install.sh
```

**depends-on:** Group 3, Group 5b

---

### Group 6b: The briefing hook survives renames

**Goal:** A Claude bot's briefing hook points at a path that never moves, and every existing hook is moved onto it.

**Deliverables:**
1. A fixed entry point, `<app home>/automagik-herdr/briefing.mjs`: a small shim that resolves its target at run time (`mods/am-sidebar/briefing.mjs`, else `mods/spaces-agents/briefing.mjs`) and imports it, so it survives a rollback across the rename. The installer and updater keep it in place. `briefingText.mjs` writes hooks with that path. The OURS pattern in `mergeHook` recognises the new path and both old shapes (`mods/spaces-agents/briefing.mjs`, `mods/am-sidebar/briefing.mjs`), so it never adds a duplicate.
2. Existing hooks migrated. For every project the pack knows (open spaces, remembered projects, every project with a readable `.herdr/bots.json`), a `UserPromptSubmit` command in `.claude/settings.local.json` matching OURS is rewritten to the fixed path, after the file is backed up to `settings.local.json.am-backup`. Any other shape is left alone. A running Claude session needs `/hooks` once; the run lists those sessions (see #12).
3. The `~/.local/bin/automagik-herdr` link is repointed at the renamed CLI. A non-link file there is left alone with a message.
4. `revert` covers 6b too. It points the link back and, in each settings.local.json, edits only the hook command back to the v0.2.0 path (the inverse of the forward edit), so permissions Claude Code wrote there in between are kept. v0.2.0's OURS pattern then still recognises it, so no second hook gets added. The `.am-backup` stays only for manual recovery. `update.mjs rollback` calls it with 6a's.

**Interfaces:**
- Consumes: `briefingText.mjs` `hookCommand(appHome)` and `mergeHook(settings, command)`; Group 6a's `plan`/`apply`.
- Produces: `STABLE_BRIEFING = "<app home>/automagik-herdr/briefing.mjs"`; `migrateHooks(projects: string[], { backup: true }) → { rewritten: string[], skipped: {file, reason}[] }`.

**Acceptance Criteria:**
- [ ] On a scratch project with a v0.2.0-shaped hook, the migration rewrites it, a backup exists, and `briefing.mjs` run through the new command prints its block within 2 s.
- [ ] After a later folder rename (simulated), the hook still runs.
- [ ] `automagik-herdr --version` works through the repointed link.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/spaces-agents/*.js mods/spaces-agents/*.mjs mods/spaces-agents/bin/*.mjs; do node --check "$f" || exit 1; done && sh -n install.sh
```

**depends-on:** Group 6a

---

### Group 6c: usagemeter installed and synced by the pack

**Goal:** One install gives the desktop the usage meter: install.sh installs a pinned usagemeter release, and the sidebar runs `usagemeter sync` every 10 minutes while Herdr is open (owner, 2026-11-02).

**Deliverables:**
1. `mods/spaces-agents/release.js`: `USAGEMETER = { version, assets: {"darwin-arm64", "darwin-x86_64", "linux-x86_64", "linux-aarch64"} }`, pinned to a released usagemeter version (v0.1.0 or later).
2. install.sh: after the pack is installed, download the pinned `usagemeter-<os>-<arch>` and that release's `SHA256SUMS` from `github.com/automagik-dev/usagemeter/releases/download/v<version>/`, check the hash, and install to `~/.local/bin/usagemeter` atomically (temp file in the same folder, `chmod 755`, rename). Skip it when `usagemeter --version` already prints the pinned version. `--no-usagemeter` skips the step. Any failure is a warning; the pack install still succeeds. usagemeter's own `install.sh` is not piped into a shell.
3. The sidebar (spaces-agents) runs `usagemeter sync` through exec every 10 minutes while Herdr is open, plus once 30 seconds after load. Only one run at a time, never more often than the 10-minute freshness check. A missing binary is silent. It runs with no arguments beyond `sync`. No LaunchAgent and no daemon.
4. `--uninstall` removes `~/.local/bin/usagemeter` only when the marker says the pack installed it (`usagemeter=<version>` line). Its store is kept.
5. Tests: install with a local fake release (good hash, bad hash, already current, `--no-usagemeter`, offline); the timer's single-flight and interval with a fake exec; uninstall removes only a pack-installed binary.

**Interfaces:**
- Consumes: Group 3's install.sh, marker v2 and `release.js`; usagemeter's release contract (binary names, `SHA256SUMS`, `usagemeter --version`, `usagemeter sync`) as in its README.
- Produces: marker line `usagemeter=<version>`; `USAGEMETER` in `release.js`; `syncMeter({exec, now})` in the sidebar.

**Acceptance Criteria:**
- [ ] A scratch install puts a hash-checked usagemeter in a scratch `~/.local/bin`; a bad hash installs nothing and the pack install still exits 0 with a warning.
- [ ] A rerun with the pinned version installed makes no download.
- [ ] With Herdr open, `usagemeter sync` runs at most once per 10 minutes and never twice at once (fake exec).
- [ ] `--uninstall` removes a pack-installed binary and leaves one the person installed.
- [ ] No LaunchAgent is written.

**Validation:**
```bash
node --test 'test/*.test.mjs' && sh -n install.sh && shellcheck -s sh install.sh && node scripts/version.mjs check
```

**depends-on:** Group 3; a released usagemeter v0.1.0 (automagik-dev/usagemeter)

---

### Group 7: Rename migrate — per surface, three PRs

**Goal:** Every folder, mod id, mod command, title and doc uses the D4 names.

**Deliverables:**
1. Three PRs into `wish/am-pack`, each within the band (renames counted as moves):
   - (a) `git mv mods/spaces-agents mods/am-sidebar`, with its mod commands (`am-sidebar.paste`, …), `bin/`, `release.js`, `openOverlay({mod: "am-sidebar"})` in Group 4's footer popup, `theme.js` and `themes/` (added by herdr-bots Group 5, merged into `wish/am-pack` at c90c954), and its tests. The theme files already copied into `<app home>/themes/` keep their names: they are the person's files and theme.js never rewrites them;
   - (b) the `am-footer`, `am-tabs`, `am-new-menu`, `am-automations`, `am-mods` and `am-markdown` folders, their `mod.json` titles, the cross-mod `mod.open`/`openOverlay` names, and their tests;
   - (c) `layouts/automagik.json`, `keys.json`, `catalog/*` (regenerated), `release.yml` paths, `scripts/version.mjs`'s VERSION path, install.sh, README, RECIPE.md, NOTICE and DESIGN references.
2. No aliases (D12). Group 6a migrates whatever sends the old names.
3. Before (a)'s `git mv`, merge `dev` into `wish/am-pack`, so sidebar-rules Group 1 (v0.2.1, which edits `mods/spaces-agents/main.js` and `rows.js` and adds `test/fixtures/sidebar/`) is renamed along with everything else. Git's rename detection is unreliable on the 57 KB `main.js` once both sides have edited it.

**Interfaces:**
- Consumes: Group 6a's `RENAMES` and Group 6b's stable hook.
- Produces: the D4 folder names; `PACK_MODS` lists them.

**Acceptance Criteria:**
- [ ] `git grep -n "spaces-agents\|sidebar-chrome\|auto-tabs\|new-menu-tui\|mod-manager\|md-menu\|markdown-browser"` finds only migrate.js, the OURS pattern, NOTICE's provenance lines and tests of the migration.
- [ ] `herdr-app check` passes for all eight mods on a scratch copy.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/*/*.js mods/*/*.mjs mods/*/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check && sh -n install.sh && actionlint
```

**depends-on:** Group 6b, Group 2, Group 5a

---

### Group 8: Integrate, verify, release v0.3.0

**Goal:** `wish/am-pack` merges into `dev` once, cuts v0.3.0, and both a fresh install and a v0.2.0 upgrade are proven on scratch homes.

**Deliverables:**
1. Merge `dev` into `wish/am-pack` and run the full gate.
2. Run the QA criteria on scratch homes, plus `herdr-app shot` of the sidebar, footer and tab bar on a scratch-home Herdr window (or the owner's, read-only).
3. Open a PR `wish/am-pack` → `dev`, merge it, and verify the release has the pack tarball and `SHA256SUMS`.
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

**depends-on:** Group 7, Group 4, Group 6b, Group 6c, sidebar-rules Groups 2–5

---

## QA Criteria

_What must be verified on dev after merge. The QA agent tests each criterion._

- [ ] A fresh scratch home installs v0.3.0 with the curl one-liner: eight mods, the layout, the CLI link, and no mod errors after the switch.
- [ ] A scratch home at v0.2.0 reruns the curl installer to v0.3.0 and keeps its bots, icons, colours, key bindings, layouts (backed up) and briefing hooks. `automagik-herdr update --rollback` returns the pack folders to their v0.2.0 copies; the migration's backups restore the layouts and keys.
- [ ] `mods/pocket-link` and any other non-pack folder in the scratch home are byte-identical before and after install, update and rollback.
- [ ] The footer Bots tab opens New bot. The Quota tab opens the panel. The Pocket Link tab shows only when Pocket Link is installed.

---

## Assumptions / Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| The installer touches a mod it doesn't own (the 18:40 incident) | High | D10; PACK_MODS allowlist; a planted pocket-link byte-identical test in Groups 3 and 6; scratch homes only |
| A credential leaks from am-quota | High | Group 2's 0600/atomic/no-argv criteria and a separate security pass |
| v0.2.0 installs stay on v0.2.0 until someone reruns the installer | Low | v0.2.0 runs only on the owner's team's machines: one message with the curl command at release; README upgrade note |
| The migration rewrites the person's layouts, keys, shared state and Claude settings | High | Group 6a/6b: a backup before every rewrite, unrecognised shapes left alone, idempotent plan, owner-shaped scratch home in tests |
| Rebase conflicts: the pack branch was cut from 695eced, and dev has since gained G8–G11 and G5 | Medium | Group 1 resolves them with the README rule stated; G5's RECIPE wins |
| Group size over the band (the pack is ~97 files) | Medium | Four PRs in Group 1, three in Group 7; pruned icons; typings out of git |
| am-automations name not confirmed by the owner | Low | Rename it before Group 7 if the owner prefers another |

---

## Review Results

_The read-only reviewer returns evidence; the invoking orchestrator appends a timestamped block here after plan, execution, and PR reviews._

### Plan review — 2026-11-01 — APPROVED at f7bfd23

- **Reviewer:** g8-review (read-only).
- **Round 1, e003ac3: FIX-FIRST.**
  - H1: the bridge can't finish the upgrade.
  - H2: aliases are impossible in Herdr's command model.
  - H3: the migration map missed the CLI link, the briefing hooks, the projects file, pets, edited layouts and data/.
  - H4: ownership came from folder names.
  - M1–M6 and L1–L5.
- **Owner decisions folded in:**
  - D5: Bots tab with a popup, through openOverlay.
  - D12: folders and titles renamed, with migration; layouts migrated with backups.
  - D11: no bridge; rerun the installer.
  - am-automations name.
  - t187's corrections: three MIT forks, am-quota wiring moves to G2, 8 icons.
- **Rounds 2–4 (0b65782, 6610e49, 99bfbb3): FIX-FIRST**, narrowing to:
  - rollback across the rename (revert);
  - Herdr-owned files (shared keys only through in-mod shims);
  - references following ownership;
  - targeted inverse edits;
  - `.prev/` holding only pack releases, with adopted folders in `backup/`.
- **f7bfd23: APPROVED.** One builder note, folded in: `apply` writes a change journal that `revert` reads.

---

### Group 1 — the vendored pack — 2026-11-02 (merged into wish/am-pack, a78a34d)

- PRs #15, #16, #17, #21, #22 and #18, stacked, each within +2,000. Criteria review plus a separate quality review, 2 fix rounds (B 2/2).
- Round 1, FIX-FIRST:
  - NOTICE lacked the verbatim MIT notices;
  - `catalog --check` failed on 3 of 4 slices;
  - `install.mjs` accepted unknown flags (a probe installed into the live home);
  - the mod manager `rm -rf`'d `.state` on update and remove, and could remove Pocket Link;
  - #17 was over the size band; the catalog URL pointed at `main` (404).
- Round 2:
  - Pocket Link's on/off switch still moved its folder;
  - the preflight parsed the pack's keys.json instead of the person's;
  - the carry-over nested `.state/.state`.
- Coordinator verification at fe3df28: the reviewers' probes (C3 no nesting; C6 `setEnabled(pocket-link)` refused with the folder in place; single-dash and typo args exit 2; a bad HOME keys.json exits 1 with 0 mods written); gate 296/296; `catalog --check` 0. The merged tree equals the reviewed top.
- **Rulings:**
  - `catalog/index.json` lives in the top slice only. Why: each lower slice must pass its own checks. Cost if wrong: none.
  - The mod manager moves folders aside and refuses `pocket-link` (rulings 10–11 apply to the vendored manager too). Why: it would otherwise repeat the 18:40 incident. Cost if wrong: a small change to a vendored mod.
  - Staging plus rename, symlinked `.state`, headCommit pinning, the missing tests and CI checks are routed to Group 3 (deliverable 4).

### Group 5a — am-markdown — 2026-11-02 (merged, #19)

- Round 1, FIX-FIRST: the catalog still listed markdown-browser; NOTICE lacked ohneda's copyright; no committed check for criterion 1; docs named `markdown-browser.open`.
- Round 2: SHIP. `catalog --check` 0 (9 mods); NOTICE matches LICENSE-upstream (`diff` 0); `test/md-menu-faces.test.mjs` 3/3; 299/299. The coordinator verified the doc-only items at 634ecdb.
- **Ruling:** the stub-runtime test is criterion 1's evidence, and the in-app click-through on a scratch home moves to Group 8. The installed `markdown-browser.open` key binding is Group 6a's.

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
mods/spaces-agents/migrate.js, briefingText.mjs   (Groups 6a, 6b)
mods/am-* (git mv)                               (Group 7)
test/*.test.mjs
```
