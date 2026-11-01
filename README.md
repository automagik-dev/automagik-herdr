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

### Optional: the bots layout

`layouts/bots.json` is Herdr's shipped `main` layout with the pack in place of the `spaces`
and `agents` sidebars. It names only shipped mods plus the pack.

```bash
cp layouts/bots.json ~/.config/herdr-app/layouts/
herdr-app do layout.switch --name bots
```

## Bot definitions: `.herdr/bots.json`

Each project's bots live in `.herdr/bots.json` at the project's root. Commit it with the
project, so a teammate who opens the project sees the same bots after a pull.

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
      "role": "Runs the project", "instructions": "…", "agent": "claude", "model": "Opus 5.5" },
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
- `instructions` holds at most 4,000 characters. `model` is display text only.
- Ids are `b-` plus 10 lowercase base32 characters. A bot's terminal carries the hc label
  `bot=<id>`.

The create form writes bots. Category order, titles and subtitles are edited by hand: the
main bot's view lists categories in the order of the `categories` array, each with its
`title` and its muted `sub`.

## Develop

```bash
node --test 'test/*.test.mjs' && for f in mods/spaces-agents/*.js; do node --check "$f" || exit 1; done
```

The pure rules (project key, schema, leads, ids, looks) live in `mods/spaces-agents/model.js`
and import nothing from Herdr. `test/bots.test.mjs` runs `bots.js` against stand-ins for
Herdr's `herdr` and `fs/promises` modules (`test/herdr-stub.mjs`, `test/fs-stub.mjs`; the
second has only the seven functions Herdr gives a mod). A pass there does not prove the pack
works inside Herdr. Check that in Herdr itself.

## License

Apache-2.0 (`LICENSE`; the pack folder carries a copy). Two files are changed from Herdr's
`spaces` 0.1.7: `mods/spaces-agents/main.js`, which says so at its top, and
`mods/spaces-agents/mod.json`, whose `place` changed from `none` to `left`. JSON can't
carry a comment, so the change to `mod.json` is noted here and in the repository history.
