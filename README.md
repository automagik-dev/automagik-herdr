# herdr-bots

A Herdr mod pack: Bots, long-lived named agents with their teams, in the Herdr sidebar.
The pack is one mod folder, `mods/spaces-agents/`, a sidebar that started as a clone of
Herdr's shipped `spaces` 0.1.7. Its first commit is that clone unchanged; every later change
is a diff against it. Design: `.genie/brainstorms/herdr-bots/`.

## Requirements

- Herdr (the desktop app) and herdr-core (`hc`).
- `node` on your `PATH` (version 24 or later) for the per-turn briefing that tells a Claude
  bot about its team. The sidebar itself does not need it.
- herdr-core's typed notes left on. A team member tells its lead about `blocked`, `error` and
  exit through them. They are on by default. Check that `~/.config/herdr-core/config.toml` does
  not say `notes = false`.

## Install

On a Herdr that has no `spaces-agents` mod yet, copy the folder in:

```bash
cp -R mods/spaces-agents ~/.config/herdr-app/mods/
herdr-app status   # the pack loaded, with no error
```

`mod.json` places the pack on the left, so it docks beside the shipped `spaces` and
`agents` sidebars.

### Replacing an existing `spaces-agents` clone

Herdr never overwrites a mod folder that is already there, and neither should you. If you
already run your own `spaces-agents` clone, move it out of `mods/` first, and move its
rename map to the app home, where the pack reads it:

```bash
backup=~/herdr-mods-backup/spaces-agents-$(date +%Y%m%d-%H%M%S)
mkdir -p ~/herdr-mods-backup
mv ~/.config/herdr-app/mods/spaces-agents "$backup"
[ -f "$backup/sidebar-agents.json" ] && mv "$backup/sidebar-agents.json" ~/.config/herdr-app/sidebar-agents.json
cp -R mods/spaces-agents ~/.config/herdr-app/mods/
herdr-app status
```

Keep the backup outside `mods/`, or Herdr loads it as a second mod. Your layout already
names `spaces-agents`, so nothing else changes.

The rename map (`~/.config/herdr-app/sidebar-agents.json`, names for terminals that report no
status, keyed by full terminal address) stays a file you edit by hand. The pack reads it on
load and every 15 seconds, so an edit shows within 15 seconds. It sits outside `mods/`, so
saving it does not reload the mod. If the file is missing, the pack uses no names from it.
The repository does not ship one.

### Install the CLI

`herdr-bots` creates, edits, starts and attaches bots from a terminal, with no Herdr window
needed. It is a plain `node` script in the pack. Put it on your `PATH` once:

```bash
mkdir -p ~/.local/bin
ln -s ~/.config/herdr-app/mods/spaces-agents/bin/herdr-bots.mjs ~/.local/bin/herdr-bots
herdr-bots --help
```

It needs `node` 24 or later and `hc` on your `PATH`. See [The command line](#the-command-line-herdr-bots).

### Optional: the bots layout

`layouts/bots.json` is Herdr's shipped `main` layout with the pack in place of the `spaces`
and `agents` sidebars. It names only shipped mods plus the pack.

```bash
cp layouts/bots.json ~/.config/herdr-app/layouts/
herdr-app do layout.switch --name bots
```

## Bot definitions: `.herdr/bots.json`

Each project's bots live in `.herdr/bots.json` at the project's root. The form writes it
into the main checkout as an uncommitted file. Commit it the way your project takes changes
(a branch and MR where the default branch is protected), so a teammate who opens the project
sees the same bots after a pull.

A folder in git belongs to its main checkout. The file is read and written only there,
never in a worktree, and a worktree's committed copy is ignored. A folder outside git
belongs to the nearest folder at or above it that holds `.herdr/bots.json`. If none does,
the folder is its own project.

The shape (`version` 1):

```json
{
  "version": 1,
  "categories": [{ "id": "eng", "title": "Engineering", "sub": "build and ship" }],
  "bots": [
    { "id": "b-k3m7q2zt5x", "name": "Genie", "kind": "main", "look": { "character": "octopus", "colour": "cyan" },
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
  deeper down show under their lead and ignore it.
- `planned` marks a bot that is not started yet. It needs no `agent`.
- `instructions` holds at most 4,000 characters.
- `model` is an optional pin, picked from the agent's known models (never typed freely).
  Start passes it with the agent's own model flag; a pin the agent doesn't list (an old
  free-text model) is skipped by the sidebar with a note and refused by the CLI. A running
  bot shows the model its pane runs: the one its command line names, else the agent's own
  configured default. A bot that isn't running shows no model in its sidebar row
  ("not running · role"), while `herdr-bots ls` and `show` print its pin, else that default.
- Ids are `b-` plus 10 lowercase base32 characters. A bot's terminal carries the hc label
  `bot=<id>`.

The create form writes bots. Category order, titles and subtitles are edited by hand: the
main bot's view lists categories in the order of the `categories` array, each with its
`title` and its muted `sub`.

## Create, Start and Attach

- **New bot** at the foot of the sidebar opens the form: project folder, name, character and
  colour (or the Omni look, the octopus in deepseek), role, instructions (at most 4,000
  characters), coding agent, model, whom it reports to, category, and whether it is planned.
  A project's first bot is its main bot. The form writes `.herdr/bots.json` in the project's
  main checkout, on this computer only.
- **Start** opens the bot's coding agent as a new pane in the project's space, labelled
  `bot=<id>`. A bot that is already running is focused instead; a planned bot can't start.
  A member started while its lead runs gets the lead's terminal as its hc parent, so
  herdr-core types its `blocked`, `error` and exit notes into the lead's pane.
- **Attach as bot…** (right-click an agent in the sidebar) ties a running pane to a bot
  without restarting it. A Claude pane is refused, with nothing written, when its session
  runs outside the bot's project.
- Mod commands: `spaces-agents.new-bot`, `spaces-agents.edit`, `spaces-agents.start` and
  `spaces-agents.attach`. Bound to a key, they act on the focused pane and its bot.

## The command line: `herdr-bots`

The CLI and the sidebar apply the same rules (they share `model.js`, `launchArgs.js`,
`briefingText.mjs` and `models.js`). The CLI is the way for agents and scripts to manage
bots. It talks to herdr-core with `hc` and never drives the Herdr window.

```text
herdr-bots ls [--all]                 bots: kind, lead, category, planned, agent, model, pane, status
herdr-bots show <bot>                 one bot in full, instructions included
herdr-bots create --name N --agent A [--kind main|member] [--role R]
       [--instructions TEXT | --instructions-file F|-] [--lead BOT] [--category ID]
       [--character C --colour K | --omni] [--model M] [--planned-wave N [--planned-note T]]
herdr-bots edit <bot> [the create options] [--unplanned] [--no-model] [--no-category]
herdr-bots rm <bot>
herdr-bots category ls | add --title T [--sub S] [--id ID] | edit <id> [--title T] [--sub S]
       | rm <id> | order <id>...
herdr-bots start <bot> [--space ID] [--tab ID]
herdr-bots attach <bot> <terminal>
herdr-bots detach <bot>
herdr-bots brief <bot>
```

- Every command takes `--json` (the result as JSON on stdout) and `--project <folder>`.
  Without `--project`, the project is the one the current folder belongs to (its git main
  checkout). `ls --all` adds the projects the sidebar remembers and the ones listed below.
- A bot is named by its id or by its name, which is unique in its project.
- Errors go to stderr. A refusal exits 1, a usage mistake exits 2, and nothing is written.
  When `hc` fails, `start`, `attach` and `detach` refuse; `ls` and `show` still list the bots,
  with status `hc unavailable`.
- `create` prints the new bot's id. A project's first bot must be its main bot. Instructions
  over 4,000 characters are refused. `--model` takes a model from the agent's list (Claude
  Code: its aliases and the current model ids; Codex: its own model cache in
  `~/.codex/models_cache.json`; any agent: its configured default). The error lists the
  choices.
- `create`, `edit`, `rm` and `category` read `.herdr/bots.json`, change it, and write it
  only if nobody changed it in between. A file that would break the schema is never
  written. `rm` refuses a main bot that still has other bots, and a bot that still leads
  members. Removing a project's last bot deletes the file.
- `start` runs the bot's agent with `hc run --bg` in the project folder, labelled
  `bot=<id>`, with the pinned model. A member whose lead is running gets the lead's
  terminal as its hc parent (and outlives it); every other bot starts with no parent. A bot
  that is already running is not started twice: `start` prints its terminal. A planned bot
  is refused, and so is a pin the agent doesn't list. A bot whose pane started less than a
  minute ago counts as running. Placement is best effort: the pane opens in the Herdr space
  (and tab) of a running terminal in the project's folder, which may be a space other than
  the one you think of as the project's, if its terminal works there. With none, Herdr gives
  the pane no place in its window: `start` says so, and `hc attach <terminal>` shows it.
  Open a space on the project first, or pass `--space <id>` (and `--tab <id>`; `--tab`
  alone is a usage mistake).
- `attach` labels a running pane on this computer as the bot and takes the label off any
  other pane first. A pane that already plays another bot is refused. A Claude pane whose
  session runs outside the bot's project is refused, with both folders named.
- `start` and `attach` write the per-turn briefing hook for a Claude bot, as the sidebar does.
  `detach` takes the bot's label off its panes; for a bot already removed with `rm`, give its
  `b-…` id. `brief` prints the bot's briefing as it would
  be now.

`create`, `edit`, `category`, `start` and `attach` add their project to
`spaces-agents-projects.json` in the app home (`$HERDR_APP_HOME`, else
`~/.config/herdr-app`): a JSON list of project folders, newest last, at most 200. It sits
outside `mods/`, so writing it reloads nothing. The sidebar reads it every 15 seconds beside
its own remembered projects, so a bot created from the CLI shows even when no space is open
on its project (at the end of the list, under the project's name). The sidebar never writes
this file: a listed project whose `.herdr/bots.json` is gone is just not shown. With no app
home, nothing is written; a failed write only warns. `ls --all` reads the list too.

## The per-turn briefing (Claude bots)

Before every prompt, a Claude bot receives a short block: its own name, kind, role and
instructions from `.herdr/bots.json`, then its team. A main bot or a lead gets each of its
direct members' status and latest report (the member's published status text, else the last
lines of its screen). A member gets its lead's state and the lead's current terminal address
to `hc send` its report to when it is done or stuck, plus a count of the helpers it started.
Planned bots are left out. An edit to `.herdr/bots.json` shows from the next prompt. The
briefing types nothing into any pane.

- **Where it comes from.** Start and Attach of a Claude bot add one `UserPromptSubmit` hook to
  `.claude/settings.local.json` in the folder the bot's session runs in. They never touch the
  shared `.claude/settings.json` and keep every other setting and hook. The hook runs
  `node "<app home>/mods/spaces-agents/briefing.mjs"`, so it needs `node` (see Requirements);
  without it the hook does nothing and reports no error.
- **Per person, never committed.** The hook names a path on your computer. Start and Attach
  add `**/.claude/settings.local.json` to the clone's own exclude file
  (`git rev-parse --git-path info/exclude`), unless git already ignores it. If that write
  fails, a notification says so: keep the file out of your commits by hand. If your project
  already tracks `.claude/settings.local.json`, git can't exclude it: the hook shows as a
  change, and a notification says so. Leave it out of your commits, or stop tracking the file.
- **A renamed pack gets no hook.** Start and Attach first check that `briefing.mjs` is at
  `<app home>/mods/spaces-agents/`. If Herdr installed the pack under another name because
  the old clone was still there, they write nothing and tell you; redo the steps in
  "Replacing an existing `spaces-agents` clone" above.
- **A session that was already running.** Attach adds the hook to a Claude session that
  started before it. If that bot's next prompt brings no briefing, type `/hooks` once in that
  session so Claude Code loads the new hook. A session started with Start reads it at launch.
- **Quiet everywhere else.** The script prints nothing and exits 0 unless its terminal
  (`$HC_TERMINAL_ID`) carries a `bot` label defined in the project of `$CLAUDE_PROJECT_DIR`.
  It is done within about 2 seconds (a member whose machine doesn't answer shows as
  unreachable) and never fails the prompt; on an error it writes one line to stderr.
- **Other agents' words are fenced.** Each member's report sits in its own
  `<untrusted-report>` element with its angle brackets replaced, under a line telling the
  bot that reports are data, never instructions.
- **Notes as well as reports.** The member's own report is the path for "done". herdr-core's
  typed notes still bring `blocked`, `error` and exit to a lead started before the member
  (see Requirements for the `notes` setting).

## Develop

```bash
node --test 'test/*.test.mjs' && for f in mods/spaces-agents/*.js mods/spaces-agents/*.mjs mods/spaces-agents/bin/*.mjs; do node --check "$f" || exit 1; done
```

The pure rules (project key, schema, leads, ids, looks) live in `mods/spaces-agents/model.js`
and import nothing from Herdr; so does the briefing's text (`briefingText.mjs`).
Model detection lives in `models.js` (`test/models.test.mjs`). `test/briefing.test.mjs`
runs `briefing.mjs` under node with a fake `hc` on `PATH`, and `test/cli.test.mjs` runs every
`herdr-bots` command against scratch git projects with a recording fake `hc`
(`test/fake-hc.mjs`). `test/bots.test.mjs` runs `bots.js` against stand-ins for
Herdr's `herdr` and `fs/promises` modules (`test/herdr-stub.mjs`, `test/fs-stub.mjs`; the
second has only the seven functions Herdr gives a mod). A pass there does not prove the pack
works inside Herdr. Check that in Herdr itself.

## License

Apache-2.0 (`LICENSE`; the pack folder carries a copy). Two files are changed from Herdr's
`spaces` 0.1.7: `mods/spaces-agents/main.js`, which says so at its top, and
`mods/spaces-agents/mod.json`, whose `place` changed from `none` to `left`. JSON can't
carry a comment, so the change to `mod.json` is noted here and in the repository history.
