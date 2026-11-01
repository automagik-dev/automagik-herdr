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
answers every question, `--version 0.1.0` installs that release (v0.1.0 or later),
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

## The command line

`automagik-herdr` does everything the sidebar does, without a Herdr window. Agents use it to
build and run their own teams.

```text
automagik-herdr ls [--all]                 bots: kind, lead, category, planned, agent, model, pane, status
automagik-herdr show <bot>                 one bot in full
automagik-herdr create --name N --agent A [--kind main|member] [--role R]
       [--instructions TEXT | --instructions-file F|-] [--lead BOT] [--category ID]
       [--character C --colour K | --omni] [--model M] [--planned-wave N [--planned-note T]]
automagik-herdr edit <bot> [the create options] [--unplanned] [--no-model] [--no-category]
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

A bot's pane carries the hc label `bot=<id>`.

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

- Exactly one bot is `main`; every other bot is a `member`. A member without `lead` reports
  to the main bot. A lead that is missing, planned or part of a cycle counts as the main bot,
  and the row shows a warning.
- `category` applies to bots that report to the main bot. Category order, titles and
  subtitles are edited by hand.
- `planned` marks a bot that waits for a later wave. It needs no `agent` and can't start.
- `model` is an optional pin from the agent's known models.
- In git, the file lives in the main checkout only, never in a worktree. Outside git, a
  folder belongs to the nearest folder above it with a `.herdr/bots.json`.

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
mkdir -p ~/.local/bin
ln -s ~/.config/herdr-app/mods/spaces-agents/bin/automagik-herdr.mjs ~/.local/bin/automagik-herdr
```

Herdr never overwrites a mod folder that is already there. If you run your own
`spaces-agents` clone, move it out of `mods/` first, and keep the backup outside `mods/`,
or Herdr loads it as a second mod. A rename map in `<app home>/sidebar-agents.json` is read
as before. `mods/spaces-agents/layouts/automagik.json` is Herdr's `main` layout with the pack in
place of the `spaces` and `agents` sidebars; copy it to `~/.config/herdr-app/layouts/` and run
`herdr-app do layout.switch '{"name":"automagik"}'` to use it (the installer does both, asking first).

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

## License and credits

Apache-2.0 (`LICENSE`; the pack folder carries a copy). The sidebar is derived from Herdr's
shipped `spaces` mod 0.1.7 (`LICENSE-herdr`); `main.js` says so at its top, and `mod.json`'s
`place` changed from `none` to `left`. The characters come from Automagik by Namastex Labs
(`LICENSE-automagik`), whose drawing comes from DS Bot. See `mods/spaces-agents/NOTICE`.
