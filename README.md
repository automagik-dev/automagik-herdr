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

## The command line

`automagik-herdr` does everything the sidebar does, without a Herdr window. Agents use it to
build and run their own teams.

```text
automagik-herdr ls [--all]                 bots: kind, lead, category, rank, planned, agent, model, pane, status
automagik-herdr show <bot>                 one bot in full
automagik-herdr create --name N --agent A [--kind main|member] [--role R]
       [--instructions TEXT | --instructions-file F|-] [--lead BOT] [--category ID]
       [--character C --colour K | --omni] [--model M] [--rank R]
       [--planned-wave N [--planned-note T]] [--worker-agent A] [--worker-model M] [--worker-effort E]
       [--worker-template T]
automagik-herdr edit <bot> [the create options] [--unplanned] [--no-model] [--no-category] [--rank=]
automagik-herdr rm <bot>
automagik-herdr category ls | add --title T [--sub S] [--id ID] | edit <id> | rm <id> | order <id>...
automagik-herdr start <bot> [--space ID] [--tab ID]
automagik-herdr attach <bot> <terminal>
automagik-herdr detach <bot>
automagik-herdr brief <bot>
automagik-herdr worker "<task>" (--branch B [--base REF] | --worktree DIR)
       [--agent A] [--model M] [--effort E | --template T] [--name N]
automagik-herdr update [--check | --rollback]
```

- Every command takes `--json` and `--project <folder>`. Without `--project`, the project is
  the one the current folder belongs to: its git main checkout, or outside git the nearest
  folder at or above it holding `.herdr/bots.json`. A folder named with `--project` is the
  project itself outside git, never a parent folder's project; in git it is still the main
  checkout. A `--project` folder that isn't there is a usage mistake.
- A bot is named by its id or by its name. A refusal exits 1, a usage mistake (such as a
  missing `--project` folder) exits 2, and nothing is written.
- `start` runs the bot's agent in a new pane with `hc run`, labelled `bot=<id>`. A member
  whose lead is running gets the lead's pane as its parent. A running bot is not started twice.
- `attach` ties a running pane to a bot. A Claude pane whose session runs outside the bot's
  project is refused.

## Workers

A bot manages its lane and writes no code. For each task it starts one worker, from its own
pane:

```bash
automagik-herdr worker "Fix the login redirect loop" --branch fix/login-loop --effort high
```

- **Who:** the calling bot is read from `HC_TERMINAL_ID` and that terminal's `bot` label.
  Anywhere else the command is refused.
- **Where:** `--worktree DIR` uses an existing worktree of the bot's project. `--branch B`
  reuses the worktree already on `B`, or makes `<main checkout>/.claude/worktrees/<slug>`
  with `git worktree add -b B`. After a fetch, a new branch starts from `--base`, else
  `origin/B`, else origin/HEAD's branch, else `dev`, else `main`, else `master`. The main
  checkout is never a worker's folder, and its HEAD is never moved. `/.claude/worktrees/` goes
  into the clone's own git exclude, so `git add -A` in the main checkout never picks a
  worktree up.
- **One per task:** a bot gets one live worker per task. A second `worker` for the same bot
  and branch is refused and names the live one; other bots' workers may share the task.
- **What runs:** `--agent`, `--model` and `--effort` for this task, else the bot's `worker`
  defaults in `.herdr/bots.json`, else the bot's own agent with that agent's defaults. A
  default model belongs to the default worker agent, so a task that picks another agent
  runs that agent's own default model. Effort goes to `claude --effort`, codex
  `-c model_reasoning_effort`, and pi or omp `--thinking`; other agents get none, with a
  warning.
- **Templates:** `--template T` runs the hc template `T` (`hc templates` lists them)
  instead of an agent, for seats whose command sets more than a model: a custom model
  provider, keys, flags. A template owns its command, so `--template` with `--agent`,
  `--model` or `--effort` is refused. A bot's `worker.template` default wins over its
  `worker` agent, model and effort defaults, with a warning; any per-task `--agent`,
  `--model` or `--effort` sets the default template aside, so a captain whose workers run
  `dev-sol` can still start a Claude reviewer. A template hc doesn't list is refused before
  any worktree is made. A template whose command runs `claude` gets the session hook; when
  the command names no agent Herdr knows, the hook is skipped with a warning.
- **Spawn:** `hc run --bg --parent <bot pane> --cwd <worktree>`, labelled
  `worker.of=<bot id>`, `task=<branch>`, `worker.model` and `worker.effort`, then
  `-- env PATH=<the calling pane's PATH> <agent argv> <task text>`. The agent gets the bot's
  pane's PATH, not herdr-core's, so programs in `~/.bun/bin` (omp, and the `bun` it runs on)
  start. A template runs in hc's template form, `<template> <task text>` after the options, labelled
  `worker.template=<name>` and without the PATH: the template sets its own command. The task
  text is always one argument, never part of a shell string. The worker has no `bot` label,
  so the sidebar folds it under its bot as a helper row showing its model and effort.
- **Output:** the worker's terminal, then its worktree, branch, and agent, model and effort,
  or its template (`--json`: the same as data, with `template`).
- **Lifecycle:** the bot checks the worker's result, and ends it with `hc kill <terminal>`
  once the task merges. The bot's briefing says so every turn. As an hc child, a worker
  also ends when its bot's program ends; its worktree and branch stay.
- **Ledger:** `worker`, `start` and `attach` append one row per terminal to
  `<app home>/automagik-herdr/workers.jsonl`: `{ event: "start", kind: "worker" | "seat",
  terminal, pid, botId, task, worktree, agent, model, effort, template, at }` (`at` is ISO
  8601; a seat's `task` is null). `template` is new in this release: the hc template a
  worker runs, else null (seats and agent workers; rows written before it have no such key).
  When a template runs, `agent`, `model` and `effort` are null: the template sets them. The
  briefing hook appends `{ event: "session", terminal, session, transcript, at }` and sets the terminal's `agent.session` label when a Claude session
  changes. A session row can repeat when the label write fails, so consumers dedupe session
  rows on (terminal, session). There is no end row: a worker's end comes from hc or from its
  session. The rows outlive the terminals, so usage can be tied to bots and tasks afterwards.

## The Create form

**New bot** at the foot of the sidebar opens the form: a live preview of the bot's character,
its name, look, role and instructions (at most 4,000 characters), the agent it runs on, the
model it uses, whom it reports to, its category, and whether it is planned for a later wave.
The footer shows the matching `automagik-herdr create …` line, ready to copy. The form writes
`.herdr/bots.json` in the project's main checkout.

The form starts on the focused space's project. A folder picked from the project chip is the
project itself outside git, and with no `.herdr/bots.json` yet it is a new project whose
first bot is its main bot. When the focused folder is outside git and sits under another
project's folder, the form asks: that parent project, or the folder as its own project. A
focused folder that no longer exists is not used; the form asks for the folder. The sidebar
still places panes by the walk-up, so a folder joins its own project once it has its file.

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
- `worker` is optional: `{ "agent": "codex", "model": "gpt-5.5", "effort": "high" }` or
  `{ "template": "dev-sol" }`, each key optional, the defaults of the bot's
  [workers](#workers). Without `agent`, workers run the bot's own agent; a `template` (an hc
  template name) wins over `agent`, `model` and `effort`.
  `create|edit --worker-agent/--worker-model/--worker-effort/--worker-template` set them
  (an empty value clears one); the form keeps the field as it is. An invalid one is ignored
  with a warning.
- Ids are `b-` plus 10 lowercase base32 characters. A bot's terminal carries the hc label
  `bot=<id>`.

### The briefing hook (Claude bots)

Start and Attach add one `UserPromptSubmit` hook to `.claude/settings.local.json` in the
bot's session folder, never to the shared `settings.json`, and keep that file out of git
through the clone's own exclude file. The hook runs `node <app home>/mods/spaces-agents/briefing.mjs`.
It prints nothing outside a bot's pane, finishes within about 2 seconds, and never fails a
prompt. `automagik-herdr worker` adds the same hook to a Claude worker's worktree. In any hc
terminal it runs in, the hook also records a new Claude session (see [Workers](#workers)). Members' reports are fenced as untrusted data. A session attached while it was
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
`launchArgs.js`, `models.js`, `workers.js`, `formModel.js`, `release.js`, `updateCheck.js`), so the tests
run them under plain node. The tests run the CLI and the briefing against scratch git
projects with a fake `hc`, and the sidebar's modules against stand-ins for Herdr's own. A
pass does not prove the pack works inside Herdr; check that in Herdr itself. Releases are
cut by CI on every push to `dev` with something new (see `AGENTS.md`).

## License and credits

Apache-2.0 (`LICENSE`; the pack folder carries a copy). The sidebar is derived from Herdr's
shipped `spaces` mod 0.1.7 (`LICENSE-herdr`); `main.js` says so at its top, and `mod.json`'s
`place` changed from `none` to `left`. The characters come from Automagik by Namastex Labs
(`LICENSE-automagik`), whose drawing comes from DS Bot. See `mods/spaces-agents/NOTICE`.
