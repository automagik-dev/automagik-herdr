# am-automations

Scheduled agent prompts, as a side panel: a prompt, a cron line and a repo — every weekday at 09:00
an agent starts in a fresh worktree and works. The panel is where you find what ran while you were
away, start one now, pause them all, or write a new one with its next runs previewed.

Our fork of `DnzzL/herdr-automations` (MIT, kept verbatim in `LICENSE-upstream`, credited in
`NOTICE`): the pack owns this copy, upstream's two files are otherwise unchanged apart from this
mod's title and a fork header. The panel draws and asks; the Go scheduler `herdr-automations`
launches the runs and keeps the files — that binary is installed separately and is not part of the
pack.

## What you see

A card filling its block (`rounded(10)`, 1 px `border`, `background`), three parts top to bottom:
a 42 px header — "Automations", "Active" / "All paused", a switch, and `+`; a `blocked`-tinted
banner with a solid **Start** button while no scheduler holds the lock; and a scrolling body in one
of three views:

- **List**: `INBOX` (finished runs not yet seen, with "Mark all read" and "Nothing new."), then
  `AUTOMATIONS` — per entry a dot, the name, `▶`, its schedule and next run, and "agent · model ·
  workspace"; entries that did not load follow on an `ansi1` tint with the message.
- **Detail**: name, `Run now` / `Pause` / `Edit` / `Delete` (delete asks once), schedule, next, repo,
  where it runs, agent, the prompt, and `HISTORY` per run with status, duration or error, and when.
- **Form**: name, schedule pills over a cron field, repo with `Choose…`, "runs in" (new worktree,
  repo root, existing space), agent pills (installed agents plus hc templates), model, prompt, timeout,
  MCP config, and `Next: …` previewed live; `Cancel` / `Save`.

## How it behaves

- Every read and write goes through the CLI (`ls --json`, `history --json`, `put [--dry-run]`,
  `rm`, `seen`, `run --bg`, `pause|resume`, `service install`); the panel never edits
  `automations.yaml` or `history.jsonl` itself. Config and state folders are watched to know when to
  ask again, plus a 30 s timer for next-run times and the scheduler's state.
- **Dot colours**: `working` while a run of it is live, `blocked` while it waits on you, `ansi1` when
  the last run failed or was missed, `dim` when paused, else `idle`; a run's terminal is found by the
  label `automation=<name>`.
- **Inbox**: clicking a finished run marks it seen and focuses its terminal if still live, else opens
  the automation.
- **Form** re-runs `put --dry-run` on every keystroke or pill (last answer wins), so the previewed
  next runs are the server's; `Save` runs `put` (with `--original` when editing).
- **Toasts**: a run that turns `failed` or `missed` after the panel started posts a notification;
  clicking it focuses the run's terminal when live.
- `bash: put` gets its JSON through `sh -c 'printf %s "$json" | "$bin" put …'` because `exec` has no
  stdin; `run` is always `--bg` so the 30 s exec limit never truncates a run.

## Built from

`mods/am-automations/main.js`, `agents.js` (which agents the form offers, never a retired one),
`automations.svg` (a clock, 24×24 stroke), `mod.json`
(`place: "none"`, title "Automations"), `LICENSE` (this pack's Apache-2.0) and `LICENSE-upstream`
(DnzzL's MIT, verbatim). Herdr API: `exec`, `hc`, `home`, `theme`, `terminals`, `spaces`, `run`,
`notify`, `pickFolder`, `watchFolder`, `knownAgents`; `InputState`, `TextareaState`.

Programs: `herdr-automations` (the scheduler; installed separately as a login service), `hc`
templates, `sh`, and the agents a run starts (`claude`, `codex`, `pi`).

## Watch out

- **It runs programs**: `herdr-automations` on every action, `hc templates` for the form, and it
  starts agents. It reaches no network and writes no file itself.
- Without the scheduler binary the panel shows an error banner and disables nothing else; a run
  started by `▶` still needs it.
- `exec` has no stdin and a 30 s limit: both are worked around (shell printf, `--bg`), and a very
  slow `ls`/`history` would show as an error rather than a hang.
- The fork means upstream changes arrive by hand; `LICENSE-upstream` and the NOTICE entry must stay.

## Done when

`herdr-app check mods/am-automations` passes; with the scheduler installed the panel lists the automations
the CLI lists; `+` saves a new one with its next three runs previewed; `▶` opens a run in a new space;
the switch writes `paused: true` and the header reads "All paused".
