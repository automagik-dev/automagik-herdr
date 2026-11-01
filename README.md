# Automagik Herdr

Autonomous teams of coding agents across harnesses (Claude Code, Codex, Gemini, Kimi, Oh My Pi…)
with a main bot, captains and members, running in [Herdr](https://dev.herdr.app).

<!-- hero: docs/hero.png, a sidebar screenshot with a team running -->

## Install

On a Mac with Node 22.7 or later:

```bash
curl -fsSL https://raw.githubusercontent.com/automagik-dev/automagik-herdr/main/install.sh | bash
```

The installer checks Node and Herdr, and offers to install Herdr with Homebrew if it is
missing (it asks first). It installs the latest release's pack, checksum verified, into
`~/.config/herdr-app/mods/spaces-agents`, keeps a copy of any pack already there, and links
the `automagik-herdr` command into `~/.local/bin`. It adds the `automagik` layout (Herdr's main
layout with the Automagik sidebar) when you have none. The sidebar shows only in that layout,
so while Herdr shows another one the installer asks before switching (or prints the
`herdr-app do layout.switch` command when it can't ask). Running it again is safe, and
`--uninstall` puts back the pack that was there before the first install and removes the
layout if the installer added it and you haven't changed it. Add options after `bash -s --`: `--yes`
answers every question, `--version 0.2.0` installs that release (v0.2.0 or later),
`--uninstall` undoes the install.

### Paste this to your agent

Or let a coding agent do it. The prompt lives in [docs/agent-install.md](docs/agent-install.md):

```text
Install Automagik Herdr on this Mac and set up my first bot.

1. Run: curl -fsSL https://raw.githubusercontent.com/automagik-dev/automagik-herdr/main/install.sh | bash
   If it stops to ask something (install Node or Herdr), ask me; if I say yes, run it again
   with: ... | bash -s -- --yes
   If it stops for anything else (not a Mac), tell me what it printed and stop.
   If the output has a layout.switch command, ask me whether to switch, and run that exact
   command only if I say yes.
2. Check the install. Both must succeed:
   automagik-herdr --version
   herdr-app check ~/.config/herdr-app/mods/spaces-agents
   If automagik-herdr is not found, use ~/.local/bin/automagik-herdr and tell me to add
   ~/.local/bin to my PATH.
3. Ask me for: the project folder, and the main bot's name, character and coding agent
   (claude, codex, gemini…). Characters: whale, octopus, star, moon, wave, squircle, zed,
   hex, gumdrop, peanut, saucer, bunny, kitty, beacon, plus, magnet, acorn, pebbles, cushion,
   ring, gem. If I don't pick a character, use --omni (the octopus); never guess the folder,
   name or agent.
4. In that folder, create and start it:
   automagik-herdr create --kind=main --name=<name> --agent=<agent> --character=<character>
   automagik-herdr start <name>
5. Report back: the installed version, the output of automagik-herdr ls, and anything that failed.
Do not edit files under ~/.config/herdr-app by hand.
```

## Why a team

One agent in one terminal forgets what the others are doing. Automagik Herdr gives each agent
a place in a team, and keeps that team in front of every agent and of you.

- **A role and a lead.** Every bot has a name, a role, instructions and a lead. The project has
  one main bot; captains lead squads; members report to their captain or to the main bot.
  The team lives in `.herdr/bots.json`, committed with the project.
- **A briefing every turn.** Before each prompt, a Claude bot gets its own instructions and
  its team's state: a lead sees each member's status and latest report, and a member sees
  its lead and the terminal to report to.
- **Typed notes when blocked.** A member started under its lead's pane makes herdr-core type
  its `blocked`, `error` and exit notes into the lead's pane, so the lead wakes up.
- **Any harness.** Bots run Claude Code, Codex, Gemini, Kimi, Oh My Pi or any agent Herdr
  knows, side by side in the same team.
- **A detected model.** The sidebar shows the model a bot's pane really runs, read from its
  command line, else the agent's own default. A model can be pinned from the agent's known
  list; it is never typed.

## The team in the sidebar

The pack replaces Herdr's `spaces` sidebar with one that draws each project's team under its
space: the main bot as a card, categories as headers, captains with their members folded
under them, planned bots dimmed with their wave. Each bot shows its character, its role and
model, its agent's icon and its status. Right-click a bot to edit, start or attach it.

On its first load the pack switches Herdr to the Automagik theme, light or dark following the
system. Both halves are listed in Herdr's Settings, and a theme you pick later stays: the pack
switches it once and never again. The theme files it copies into Herdr's `themes/` folder are
never overwritten, so a later release does not update a theme file already there; a theme file
you delete is copied back on the next load (pick another theme in Settings to stop using it).

## The command line

`automagik-herdr` does everything the sidebar does, without a Herdr window. Agents use it to
build and run their own teams.

```text
automagik-herdr ls [--all]                 bots: kind, lead, category, rank, planned, agent, model, pane, status
automagik-herdr show <bot>                 one bot in full
automagik-herdr create --name N --agent A [--kind main|member] [--role R]
       [--instructions TEXT | --instructions-file F|-] [--lead BOT] [--category ID]
       [--character C --colour K | --omni] [--model M] [--rank R]
       [--planned-wave N [--planned-note T]]
automagik-herdr edit <bot> [the create options] [--unplanned] [--no-model] [--no-category] [--rank=]
automagik-herdr rm <bot>
automagik-herdr category ls | add --title T [--sub S] [--id ID] | edit <id> | rm <id> | order <id>...
automagik-herdr start <bot> [--space ID] [--tab ID]
automagik-herdr attach <bot> <terminal>
automagik-herdr detach <bot>
automagik-herdr brief <bot>
automagik-herdr update [--check | --rollback]
```

- Every command takes `--json` and `--project <folder>`. Without `--project`, the project is
  the one the current folder belongs to (its git main checkout).
- A bot is named by its id or by its name. A refusal exits 1, a usage mistake exits 2, and
  nothing is written.
- `start` runs the bot's agent in a new pane with `hc run`, labelled `bot=<id>`. A member
  whose lead is running gets the lead's pane as its parent. A running bot is not started twice.
- `attach` ties a running pane to a bot. A Claude pane whose session runs outside the bot's
  project is refused.

## The Create form

**New bot** at the foot of the sidebar opens the form: a live preview of the bot's character,
its name, look, role and instructions (at most 4,000 characters), the agent it runs on, the
model it uses, whom it reports to, its category, and whether it is planned for a later wave.
The footer shows the matching `automagik-herdr create …` line, ready to copy. The form writes
`.herdr/bots.json` in the project's main checkout.

## Updates

```bash
automagik-herdr update --check      # the installed and the latest version
automagik-herdr update              # download, verify against SHA256SUMS, install
automagik-herdr update --rollback   # put the replaced pack back
```

Updates come from this repository's GitHub releases. The sidebar looks 20 seconds after it
loads and then every 4 hours, and shows one notice per new version with the command to run.
When it can't look (no network, no `node`), it says nothing and tries again in 30 minutes.
Set `AUTOMAGIK_HERDR_NO_UPDATE=1` to turn both off. A pack installed as a link to a checkout
is never replaced: update it with git.

The checksum proves integrity, not authenticity, like Automagik's desktop Linux/Windows
updates: it shows the tarball is the one the release lists, not who published the release.

## Pane labels

A bot's pane carries hc labels that say which bot it is, so tools such as herdr-meter can
stamp events with them (`actor.bot`, `actor.role`, `actor.squad`):

| Label | Value |
|---|---|
| `bot` | the bot's id |
| `role` | `main` for the main bot; `captain` for a bot that leads other bots; otherwise its `rank`. No rank, no label. |
| `category` | the category it shows under (a deeper member: its chain's category), when there is one |
| `squad` | the team, set by the team-assembly helper (`squad=memory`). Never overwritten. A pane with none gets its lead's pane's squad, and `automagik-herdr.squad=<that squad>` records the copy. |

Start sets them. Attach leaves the pane matching its bot: a `role=` or `category=` the bot
doesn't have (left by the pane's last bot) comes off. An edit that changes a bot's rank, lead or category, or a lead's
captain status, rewrites the labels on the live panes of the bots it changes; a squad this
pack copied (the pane's `squad` still equals its `automagik-herdr.squad`) follows a lead
change, or comes off when the new lead's pane has none. Detach takes off `bot`, any `role`
and any `category` (nothing else sets those two today), the `automagik-herdr.squad` mark,
and `squad` only while it still equals the mark: a squad set after the copy stays. Only panes
on this computer are labelled. The lead's pane is its live one with an agent in front, the
newest when there are several.

## Reference

### `.herdr/bots.json`

```json
{
  "version": 1,
  "categories": [{ "id": "eng", "title": "Engineering", "sub": "build and ship" }],
  "bots": [
    { "id": "b-k3m7q2zt5x", "name": "Genie", "kind": "main", "look": { "character": "octopus", "colour": "deepseek" },
      "role": "Runs the project", "instructions": "…", "agent": "claude", "model": "claude-opus-5-5" },
    { "id": "b-a2b3c4d5e6", "name": "Captain", "kind": "member", "category": "eng", "look": { "character": "star", "colour": "blue" },
      "role": "Squad lead", "instructions": "…", "agent": "codex" },
    { "id": "b-f7g2h3j4k5", "name": "Dev", "kind": "member", "lead": "b-a2b3c4d5e6", "look": { "character": "moon", "colour": "green" },
      "role": "Builds", "instructions": "…", "agent": "claude" },
    { "id": "b-m5n6p7q2r3", "name": "Studio", "kind": "member", "category": "eng", "look": { "character": "bunny", "colour": "violet" },
      "role": "Access and studio", "instructions": "", "planned": { "wave": 3, "note": "waits for the auth v2 decision" } }
  ]
}
```

- Exactly one bot has `kind: "main"`. Every other bot is a `member`.
- `lead` is the id of the bot a member reports to. Without one, the member reports to the
  main bot. A lead that is missing, planned or part of a cycle counts as the main bot, and
  the row shows a warning.
- `category` places a bot that reports to the main bot under a category header. Bots
  deeper down show under their lead and ignore it. A category id is a lowercase slug
  (`a-z`, `0-9`, single dashes, like `quality-gate`), since it goes into a pane label. A new
  id must be one (`category add --id`, the form's new category). An id already in the file
  that isn't one (`Knowledge`, written by hand) keeps working, with a warning, and gives its
  bots no `category=` label.
- `planned` marks a bot that is not started yet. It needs no `agent`.
- `instructions` holds at most 4,000 characters.
- `model` is an optional pin, picked from the agent's known models (never typed freely).
  Start passes it with the agent's own model flag; a pin the agent doesn't list (an old
  free-text model) is skipped by the sidebar with a note and refused by the CLI. A running
  bot shows the model its pane runs: the one its command line names, else the agent's own
  configured default. A bot that isn't running shows no model in its sidebar row
  ("not running · role"), while `automagik-herdr ls` and `show` print its pin, else that default.
- `rank` is optional: one of `captain`, `dev`, `tester`, `reviewer`, `integrator`, `pm`,
  `owner`. It sets the pane's `role=` label (see [Pane labels](#pane-labels)). `main` is not a
  rank: `role=main` belongs to the main bot alone. The free-text `role` is separate and goes
  to the briefing. An unknown rank is ignored with a warning. The form offers ranks as chips
  for team members; `automagik-herdr create|edit --rank R` sets one (`--rank=` clears it).
- Ids are `b-` plus 10 lowercase base32 characters. A bot's terminal carries the hc label
  `bot=<id>`.

### The briefing hook (Claude bots)

Start and Attach add one `UserPromptSubmit` hook to `.claude/settings.local.json` in the
bot's session folder, never to the shared `settings.json`, and keep that file out of git
through the clone's own exclude file. The hook runs `node <app home>/mods/spaces-agents/briefing.mjs`.
It prints nothing outside a bot's pane, finishes within about 2 seconds, and never fails a
prompt. Members' reports are fenced as untrusted data. A session attached while it was
already running may need `/hooks` once to load the hook.

### Requirements

- macOS, Herdr and herdr-core (`hc`).
- Node 22.7 or later, for the CLI, the briefing and updates. The sidebar works without it, but
  its update check needs it.
- herdr-core's typed notes left on (`~/.config/herdr-core/config.toml` must not say
  `notes = false`).

### Manual install

Without the installer, from a release tarball or a checkout:

```bash
cp -R mods/spaces-agents ~/.config/herdr-app/mods/
mkdir -p ~/.config/herdr-app/layouts ~/.local/bin
cp mods/spaces-agents/layouts/automagik.json ~/.config/herdr-app/layouts/
herdr-app do layout.switch '{"name":"automagik"}'
ln -s ~/.config/herdr-app/mods/spaces-agents/bin/automagik-herdr.mjs ~/.local/bin/automagik-herdr
```

Herdr never overwrites a mod folder that is already there. If you run your own
`spaces-agents` clone, move it out of `mods/` first, and keep the backup outside `mods/`,
or Herdr loads it as a second mod. A rename map in `<app home>/sidebar-agents.json` is read
as before. The sidebar docks nowhere by itself (its `mod.json` place is `none`): it shows only
in a layout that names it. `automagik.json` is Herdr's `main` layout with the pack in place of
the `spaces` and `agents` sidebars, so copying it and switching to it are required steps. If
your own layout already names `spaces-agents`, keep it and skip those two lines.

### Upgrading from herdr-bots

If you ran `herdr-bots` from a clone, use `automagik-herdr` in its place.

## Develop

No build step and no dependencies. The checks CI runs:

```bash
node --test 'test/*.test.mjs' && for f in mods/spaces-agents/*.js mods/spaces-agents/*.mjs mods/spaces-agents/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check
```

The rules shared by the sidebar and the CLI import nothing from Herdr (`model.js`,
`launchArgs.js`, `models.js`, `formModel.js`, `release.js`, `updateCheck.js`), so the tests
run them under plain node. The tests run the CLI and the briefing against scratch git
projects with a fake `hc`, and the sidebar's modules against stand-ins for Herdr's own. A
pass does not prove the pack works inside Herdr; check that in Herdr itself. Releases are
cut by CI on every push to `dev` with something new (see `AGENTS.md`).

The two theme files are built from Automagik's colours by `node scripts/themes.mjs`; edit that
script, not the JSON (`test/theme.test.mjs` fails when they differ).

### Publishing

The public repository carries the `herdr-mod` topic, which is set on GitHub (repository
settings), not in a file. `mods/spaces-agents/RECIPE.md` (how the pack is built) and
`mods/spaces-agents/preview.png` (the bot view) are Herdr's share files: they describe the pack
to readers of the repository and are inert in an installed copy.

## License and credits

Apache-2.0 (`LICENSE`; the pack folder carries a copy). The sidebar is derived from Herdr's
shipped `spaces` mod 0.1.7 (`LICENSE-herdr`); `main.js` says so at its top, and `mod.json`'s
`title` changed to "Automagik Sidebar". The characters come from Automagik by Namastex Labs
(`LICENSE-automagik`), whose drawing comes from DS Bot. See `mods/spaces-agents/NOTICE`.

## What else is in the pack

Besides the bot mod above, this pack builds and ships the pieces that make the sidebar usable, each
with its own `RECIPE.md`:

| Mod | Derived from | What it does |
|---|---|---|
| `sidebar-chrome` | Herdr's `workspace-chrome` | The sidebar's brand bar and a footer rail of icon tabs — Mods, Automations, Settings, Add machine — so tabs never stack up. |
| `auto-tabs` | Herdr's `tabs` | The tab bar: pills named from the agent's own title, close ✕ on hover, middle-click to close, drag to reorder, per-space side-panel memory. Scrolling never switches tabs. |
| `automations` | `DnzzL/herdr-automations` (MIT) | Scheduled agent prompts as a side panel: inbox of finished runs, run now, pause all, and a form that previews the next runs. The panel draws and asks; the `herdr-automations` scheduler launches the work. |
| `md-menu` | Herdr's `menu` + `ohneda/herdr-markdown-browser` (MIT) | Right-click a terminal: under Herdr's own items, the Markdown files that terminal printed. Pick one and it renders in a preview pane — live reload on save, `Default app` — that the next pick replaces in place. |
| `new-menu-tui` | Herdr's `new-menu` | The `+` menu: terminal, the agents actually installed (per machine), new space, worktree dialogs; `⌘1…9`/`⌘T`/`⌘N`. |
| `space-icon` | — | The icon dialog: a searchable grid of 1,741 emoji (Unicode's tables), PNG/SVG/ICO, and the space's colour including transparent. |
| `mod-manager` | `jacksonpires/herdr-app-mod-manager` (MIT) | The table over every installed mod — on/off, check result, version, source, drift — install, update, remove; `⌘⇧M`. |

**Not in this pack, on purpose:** Pocket Link belongs to
[automagik-pocket](https://github.com/automagik-dev/automagik-pocket) (`desktop/pocket-link/`), which
owns its mod, its LaunchAgent and its pairing state. Install it from there; this pack never vendors,
installs, updates, removes or restarts it.

## Wiring (your layout)

The bot mod's own install steps are above. For the rest, in the layout you use:

1. root: `"terminal_menu": "md-menu"`;
2. the tab bar block: `"mod": "auto-tabs"`, `"size": { "px": 42 }`;
3. the `spaces` block: `"mod": "spaces-agents"`;
4. the footer block: `"mod": "sidebar-chrome"` with `"props": { "footer": true }` and
   `"size": { "px": 42 }`;
5. a block `{ "id": "automations-panel", "content": { "mod": "automations" }, "size":
   { "weight": 1 }, "min": 140, "hidden": true }` in the sidebar's column — the rail's clock toggles
   it, and `automations` comes from the marketplace, not from this pack.

## One-command install of the rest

```sh
node scripts/install.mjs --app-home /tmp/scratch   # ALWAYS test here first
node scripts/install.mjs                          # install into the app home
node scripts/install.mjs --dry-run                # say what would change
node scripts/install.mjs --force                  # overwrite files a person edited (backed up first)
```

**A live app home is not a build directory.** The installer never deletes a folder and never
replaces what it did not write:

- files are copied one by one over the mod's folder; nothing is `rm -rf`ed;
- private state (`node_modules/`, `.state/`, any dot path, logs) is kept untouched;
- a *hand-edited* file of the pack's own, or a file the pack does not ship at all, **refuses the
  run** (`--force` proceeds); whatever it is about to overwrite goes to
  `<app home>/automagik-herdr/backup/<mod>-<timestamp>/` first;
- only files this installer wrote before and the pack no longer ships are removed, tracked in
  `<app home>/automagik-herdr/manifest.json`;

It merges `keys.json` (a key you already use stays yours), writes
`data/mod-manager/catalog.json`, and runs `herdr-app check` on each mod, failing the run if one
fails. It never touches layouts or settings.

## Our marketplace

`catalog/index.json` is the index the mod manager reads, in the same shape `herdr.dev/mods`
publishes. `scripts/catalog.mjs` builds it from this checkout (`--refresh` re-reads
stars/licence/head from GitHub, `--check` verifies and exits 1 when stale). Strict gate: a mod of
ours must carry `RECIPE.md` and `LICENSE`, a curated repo needs a licence and an upstream
`RECIPE.md`, and a mod name has one owner — this pack first. Every refusal is printed.

## Pack layout

```
mods/        each mod this pack installs (bots first, then the sidebar and its tools)
catalog/     index.json (generated) · repos.json (the other repos we carry)
scripts/     catalog.mjs (build the index) · install.mjs (install the pack)
keys.json    the keys the pack asks for
test/        the bot work's pure-module tests (node --test)
```

## Develop

```bash
node --test 'test/*.test.mjs' && for f in mods/spaces-agents/*.js mods/spaces-agents/*.mjs mods/spaces-agents/bin/*.mjs; do node --check "$f" || exit 1; done
```

The pure rules (project key, schema, leads, ids, looks) live in `mods/spaces-agents/model.js`
and import nothing from Herdr; so does the briefing's text (`briefingText.mjs`).
Model detection lives in `models.js` (`test/models.test.mjs`). `test/briefing.test.mjs`
runs `briefing.mjs` under node with a fake `hc` on `PATH`, and `test/cli.test.mjs` runs every
`automagik-herdr` command against scratch git projects with a recording fake `hc`
(`test/fake-hc.mjs`). `test/bots.test.mjs` runs `bots.js` against stand-ins for
Herdr's `herdr` and `fs/promises` modules (`test/herdr-stub.mjs`, `test/fs-stub.mjs`; the
second has only the seven functions Herdr gives a mod). A pass there does not prove the pack
works inside Herdr. Check that in Herdr itself.

## License

Apache-2.0 (`LICENSE`; the pack folder carries a copy). Two files are changed from Herdr's
`spaces` 0.1.7: `mods/spaces-agents/main.js`, which says so at its top, and
`mods/spaces-agents/mod.json`, whose `place` changed from `none` to `left`. JSON can't
carry a comment, so the change to `mod.json` is noted here and in the repository history.
