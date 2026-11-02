# new-menu-tui

The `+` menu: start a terminal or an installed coding agent in the shown space (or a space row's
`+`), make a new space, or open a worktree. Derived from Herdr's shipped `new-menu`; it asks
herdr-core which agents are actually installed instead of offering a fixed list.

## What you see

A popup, `popover` background, 12.8 px text: **Terminal** with its key hint, a dim caption ("Start
an agent in <space>" when opened from a space row), one row per installed agent (up to two not-
installed ones dimmed with "not installed"), a divider, then **New space** and two worktree rows
(**New worktree…**, **Open worktree…**).

## How it behaves

- Agents come from `knownAgents({on: machine})` for the target space's machine, so a remote space
  lists what that machine has. Agent rows start `tab.new {name, space, argv}`; Hermes gets `--tui`
  appended when its run lacks it.
- Keys: the platform modifier (`⌘` on macOS, `Ctrl` elsewhere) + `1…9` starts the Nth installed
  agent, `T` a terminal, `N` a new space; each closes the menu first.
- Worktree rows open the shipped `worktree` dialog with `{space, folder, action: new|open}`; the
  folder is the focused pane's for the shown space, else the target space's active tab's pane.
- `props.space` targets a specific space (a sidebar row's `+`), otherwise the active one.

## Built from

`main.js` (rows, keys), `target.js` (which space, which folder), `mod.json` (`place: none`).
Herdr API: `knownAgents`, `spaces`, `panes`, `run`, `openOverlay`, `closeOverlay`, `props`,
`theme`, `window`.

## Watch out

- Clone of Herdr's `new-menu`: its later changes don't reach it.
- Agent argv is taken as herdr-core reports it; an alias or shell function is not expanded.
- The menu's height follows the agent list, up to 491 px.

## Done when

`herdr-app check mods/new-menu-tui` passes; the `+` lists installed agents; `⌘1` starts the first;
New worktree opens the worktree dialog.
