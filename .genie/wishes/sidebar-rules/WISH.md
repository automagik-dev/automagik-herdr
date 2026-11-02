# Wish: Sidebar rules — every space and row ordered by its nature, with no drift

| Field | Value |
|-------|-------|
| **Status** | DRAFT |
| **Slug** | `sidebar-rules` |
| **Date** | 2026-11-02 |
| **Author** | Automagik Herdr Orchestrator |
| **Appetite** | large |
| **Branch** | `wish/sidebar-rules` (Group 1 opens its PR against `dev`; Groups 2–5 land in `wish/am-pack`, see D1) |
| **Repos touched** | automagik-dev/automagik-herdr |
| **Design** | _No brainstorm — direct wish_ |

## Summary

Request: `~/workspace/repos/SIDEBAR-RULES-REQUEST.md` (7 drifts, rules R1–R6, the owner's additions and the row design the owner picked). The owner's ruling: "we cannot have drift; we need rules; things ordered automatically as per their nature."

Today the sidebar drifts. Three placement systems disagree. Space names are typed by hand. Squad spaces duplicate the bot tree. The project registry keeps deleted folders. A project with bots can have no space. A plain agent is drawn above the main bot. Helpers spawned from the wrong pane show flat.

This wish turns the rules into code:
- a fixed row order inside each space (R3), shipped first as a patch release;
- a fixed space order with three modes (alphabetical, manual, pinned) and a temporary float for spaces that need the owner;
- one placement truth, the project key, with one space per project named from bots.json;
- `automagik-herdr tidy`: a pure, idempotent planner that reports drift, fixes the non-visual part on its own, and changes the window only on `--apply`;
- the new space row the owner picked ("A with C's bar"): a pulse line with live counts and an activity bar.

Every rule is a pure function, tested over fixtures recorded from today's messy state.

## Scope

### IN

- R3 row order inside a space, as a pure function in `rows.js`, drawn by `main.js` (Group 1, a `fix` to `dev`).
- Fixtures of today's state under `test/fixtures/sidebar/`, redacted, with golden orders (Group 1).
- `automagik-herdr tidy [--json]`: a dry-run planner; automatic non-visual fixes on start, attach and create (Group 2).
- Space order: alphabetical, manual (drag) and pinned modes, stored in an `am.*` shared key; the needs-me float; `needsOwner(space, state)` defined once (Group 3a).
- An optional project display name in `.herdr/bots.json` (Group 3a).
- Placement from the project key; Start creates the project's space when none is open; one briefing line for helpers (R6) and one for owner decisions (Group 3b).
- `automagik-herdr tidy --apply`: strays moved with the park/keep sequence, empty and duplicate spaces closed, spaces renamed, Herdr's order aligned with `space.move`, a report of every change (Group 4).
- The space row redesign "A with C's bar": the pulse row, the activity bar, the needs-you badge and its clicks (Group 5).

### OUT

- A workspace-level bot above the projects, and workspace-first space order (issue #14; a later wish).
- Re-parenting a running terminal (issue #9, hc upstream).
- Briefings for non-Claude agents (issue #7).
- Phone app changes (automagik-pocket).
- Squad spaces of any kind. The bot tree is the squad view.
- Any change to Herdr itself or herdr-core.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Release split.** Before am-pack's v0.3.0 lands, `dev` takes only `fix` commits. R3 (row order) ships first as ONE `fix` PR to `dev` (Group 1). Everything else is `feat` and lands in `wish/am-pack` AFTER am-pack Group 7 (the am-* rename). Those groups are written against the final names: `am-sidebar`, `am-sidebar-projects.json`, `am.*` keys. Their depends-on includes "am-pack Group 7". | A `feat` on `dev` cuts v0.3.0 (`scripts/version.mjs:108`), which am-pack reserves. Writing tidy against the final names means am-pack Group 6a never has to migrate tidy's data. The owner may override this to "ship as v0.4.0 after am-pack" (see Risks). |
| D2 | **R3 adopted in full.** Row order inside a space: the main bot; categories in bots.json order, each with captains, then members by rank; each bot's helpers dashed beneath it; then plain agents not tied to a bot; then shells. A bot is never drawn below a plain agent. It is a pure ordering function in `rows.js`, tested over a recorded fixture. | Drift 6 comes from `main.js` `grouped()`: `draw` puts `agentRows` before `treeAfter`. One pure function makes the order testable and stops it drifting again. |
| D3 | **R6 is mostly hc's default already.** `hc run --help` says `--parent` defaults to the terminal it is started from. The deliverable shrinks to one briefing line telling a bot to spawn helpers from its own pane, plus tidy reporting orphan helpers. | Drift 7 comes from spawns made outside the bot's pane, `--no-parent`, or attach not re-parenting. Re-parenting a running terminal is issue #9 (hc upstream), out of scope. |
| D4 | **R4 adapted.** `where` is Herdr's own label; the pack cannot make it display-only. The pack ignores `where` for placement. The project key (git main checkout) decides the project. Start and Attach write `herdr.space` to the project's space. | One placement truth the pack controls. `where` is free text and goes stale when a space is renamed (t1m: "brain-v3" vs "review-243"). |
| D5 | **R5 split by visibility.** `automagik-herdr tidy` with no flag is a dry run that prints the plan; `--json` gives the same plan as data. Automatic runs (on start, attach, create) do only non-visual fixes: prune stale project-registry entries (issue #11) and fix labels. Anything that changes the owner's window (park/keep strays, rename, close empty or duplicate spaces, `space.move`) runs only on an explicit `tidy --apply`, which counts as the owner asking. | The owner's window belongs to the owner. Lessons it must implement: park works only when the terminal's tab is the selected tab of the selected space, else it returns `{pending:true}` and does nothing; a space whose last pane is parked disappears by itself; park before kill. |
| D6 | **R2 replaced (owner addition).** Space order supports three modes together: alphabetical sort (by display name), manual order (drag), and pin (pinned spaces stay at the top, in their own order). The sidebar draws this order with a pure function. The person's choice lives in the shared key `am.sidebar.order` = `{ mode: "alpha" \| "manual", manual: slotKey[], pins: slotKey[] }`. A slot key is the project id for a project's space, else `space:<id>`. Remote machines stay grouped under their machine headers; the order applies inside each group. Worktree spaces stay under their main checkout. `tidy --apply` aligns Herdr's own order with `space.move`, so ⌘1-9 and `space.next` agree. Workspace-first (#14) stays out. | The owner wants all three modes at once. A pure function means drawing never moves the window. The `am.*` key follows am-pack's rename. A project key is stable; a space id changes when a space is recreated. |
| D7 | **R1 adapted.** A project's display name comes from a new OPTIONAL top-level field in `.herdr/bots.json` (for example `"name": "Brain"`), falling back to the main checkout's folder name. The schema stays version 1. One space per project: when Start finds no live space for the project, the CLI creates one with `herdr-app do space.new` (folder = main checkout, name = display name). Worktree spaces are kept only while a seat needs them (tidy reports the others). No squad spaces. | `parseBots` throws only on `version !== 1`, so an optional field is safe. Creating a space on Start is the owner's own action, so it is allowed. The bot tree already is the squad view. |
| D8 | **Anti-drift tests.** Group 1 records today's messy state as fixtures under `test/fixtures/sidebar/`: `hc ls --json` rows, the `.labels` of every bot pane (`hc get <t> --json`), `herdr-app ls` spaces and tabs, and the bots.json files. They are redacted: paths under `~` only, no instructions text, no tokens. Golden expected row order and space order per rule. Every later group's acceptance includes "the recorded fixtures still give the golden order". tidy's planner is a pure function `plan(state) -> actions[]`, tested on the same fixtures; running it twice is a no-op. | Drift came back because nothing pinned the order. A recorded fixture is the real mess, not an invented one. |
| D9 | **Needs-me float (owner addition).** A space that needs the owner moves to the top of its machine group, above pins, temporarily. It returns to its slot once that is resolved. This is the sidebar's drawing only, never `space.move`. The signal is defined once, as a pure `needsOwner(space, state)` in Group 3a. Sources: a blocked seat (a dialog, the usage-limit prompt included: hc status `blocked`), a failed run (hc status `error`), and a main bot's pending owner decision (the pane label `automagik-herdr.needs-owner`, see D11). | Herdr's ⌘1-9 must not reorder every time something blocks. One signal feeds both the float and the row's badge, so they never disagree. |
| D10 | **The space row "A with C's bar" is in scope (owner's pick, 2026-11-02),** as its own group (Group 5). The ordering functions return slot keys and row descriptors only. Rendering stays in `main.js` `row()`, so the redesign and the ordering never edit the same function. | The owner picked the design. Keeping order and rendering apart lets Groups 3a and 5 change without conflict. |
| D11 | **A pending owner decision is a pane label.** A main bot that waits on the owner sets `automagik-herdr.needs-owner=<short text>` on its own pane with `hc label`, and removes it once answered. One briefing line tells main bots this (Group 3b). | There is no other primitive for "a decision waiting". A label is visible to the sidebar's single hc read, needs no new process, and the main bot controls it. |
| D12 | **Drag in the sidebar.** A drag writes the manual order to `am.sidebar.order` and switches the mode to manual. It then moves only the dragged space with `space.move`, to the index the base order (pins + manual, no float) gives it, looked up by space id, never by row index. | A drag is the owner's own gesture, so one `space.move` is allowed and keeps ⌘1-9 in step. Today's handler (`main.js:973`) indexes `spaces()` by row index, which is wrong once the sidebar sorts. |

## Simplicity Case

- **Simplest complete design:**
  - pure functions for every rule: `spaceRowOrder`, `spaceOrder`, `needsOwner`, `plan`, and the row's counts and buckets;
  - one recorded state shape, shared by the fixtures, the CLI and the sidebar;
  - one CLI command, `tidy`, with dry run as the default.
- **Added machinery:**
  - `am.sidebar.order`, because the owner asked for manual order and pins, which must survive restarts;
  - the label `automagik-herdr.needs-owner`, because no other signal says "a decision waits";
  - an in-memory ring buffer of turn counts, because the activity bar needs 30 minutes of history and hc keeps none;
  - a per-project forge cache, because "ready" and CI cost a network call each.
- **Deferred until measured:**
  - hysteresis on the needs-me float (a minimum time at the top): add it only if the owner reports flicker;
  - a persistent turn history across sidebar restarts: only if the empty bar after a restart bothers the owner;
  - running `tidy --apply` automatically: never without a new owner ruling.
- **Complexity removed:**
  - squad spaces;
  - `where` as a placement source;
  - a second order kept in Herdr by the sidebar on every redraw;
  - transcript scanning for activity.

## Dependencies

**depends-on:** am-pack
**blocks:** none

## Success Criteria

- [ ] In every recorded fixture space, the main bot and every bot are drawn above every plain agent, and shells come last.
- [ ] The owner's "Automagik Herdr" space draws the main bot above the plain omp agent t187, after the v0.2.1 release.
- [ ] `node scripts/version.mjs next` printed `0.2.1` on Group 1's PR branch before it merged.
- [ ] Spaces draw in alphabetical, manual or pinned order as `am.sidebar.order` says, with remote machines grouped per machine.
- [ ] A space with a blocked seat floats to the top and returns to its slot when the seat unblocks; Herdr's own space order does not change.
- [ ] `automagik-herdr tidy` on the recorded fixtures lists every drift in the request (1–7) that the pack can fix or report, and changes nothing.
- [ ] `automagik-herdr tidy --apply` on a scratch window ends with one space per project, named by display name, in the sidebar's order; a second `--apply` plans nothing.
- [ ] Starting a bot of a project with no open space creates that space.
- [ ] Each space row shows the pulse line and the activity bar; the badge appears only when `needsOwner` is true.

## Execution Strategy

**Order of shipping:** Group 1 (R3 fix, v0.2.1) first, to `dev`. Right after am-pack Group 7, `dev` (holding Group 1) is merged into `wish/am-pack`, with git following the rename into `mods/am-sidebar/`. Then, in `wish/am-pack`: the tidy dry-run (Group 2), ordering (Group 3a), placement/R1 (Group 3b), `tidy --apply` (Group 4) and the row (Group 5).

### Wave 1 (sequential, now, to dev)

| Group | Agent | Complexity | Model | Description |
|-------|-------|------------|-------|-------------|
| 1 | engineer | Low: one pure function and a draw-order change; must stay a `fix` so it ships as 0.2.1. ~3 focused agent-hours | inherit | R3 row order, fixtures and golden tests |

### Wave 2 (parallel, disjoint files, after am-pack Group 7)

| Group | Agent | Complexity | Model | Description |
|-------|-------|------------|-------|-------------|
| 2 | engineer | Medium: new module and CLI command; read-only except registry and labels. ~6 focused agent-hours | inherit | tidy planner, dry run, automatic non-visual fixes |
| 3a | engineer | Medium: ordering function, shared key, drag and pin menu in the sidebar. ~6 focused agent-hours | inherit | Space order modes, needs-me float, display name |

### Wave 3 (sequential)

| Group | Agent | Complexity | Model | Description |
|-------|-------|------------|-------|-------------|
| 3b | engineer | Medium: touches Start/Attach and creates a space on the owner's action. ~5 focused agent-hours | inherit | Placement from the project key, one space per project, briefing lines |

### Wave 4 (parallel, disjoint files)

| Group | Agent | Complexity | Model | Description |
|-------|-------|------------|-------|-------------|
| 4 | engineer + qa | High: changes the owner's window; the park/keep sequence is fragile. ~8 focused agent-hours | inherit | `tidy --apply` |
| 5 | engineer | High: live data, forge calls and a per-tick budget on the sidebar. ~10 focused agent-hours | inherit | The space row: pulse line and activity bar |

**Global constraints:**
- Never push to main; PRs --base dev (Group 1) or into wish/am-pack (Groups 2-4).
- Install and window tests only against a scratch HERDR_APP_HOME; never space.select/space.move on the owner's window except an explicit `tidy --apply` the owner runs or approves.
- Never write, move or delete mods/pocket-link or the dev.herdr.pocket-link LaunchAgent.
- bots.json stays version 1; new fields are optional.
- No sleep polling.
- Group 5 also lands in `wish/am-pack`, like Groups 2–4.
- Conventional commits; Group 1's commits are `fix`, `test` or `docs` only.
- Each group stays within 25 files and 2,000 insertions.

## Execution Groups

### Group 1: R3 row order, fixtures and golden tests (fix, to dev)

**Goal:** Inside every space, bots are drawn above plain agents in R3 order, pinned by tests over today's recorded state, shipped as v0.2.1.

**Deliverables:**
1. Record the fixtures (read-only, one owner-approved run on the owner's machine): `hc ls --json`; `hc get <t> --json` for every bot pane (its `.labels` and `parent`); `herdr-app ls` (spaces, tabs, terminals); every project's `.herdr/bots.json`. Save them under `test/fixtures/sidebar/<name>.json` in one `State` shape (see Interfaces).
2. Redact them: paths rewritten under `~`; `instructions` emptied; no tokens, no message text, no screen text. A test fails if any fixture holds `/Users/` or a non-empty `instructions`.
3. `rows.js`: `spaceRowOrder({ tree, agents, shells })`, pure. It returns row descriptors in R3 order: main bot; categories in bots.json order, each with captains then members by rank; each bot's helpers beneath it; then plain agents not tied to a bot; then shells. A terminal listed as a bot's helper is not listed again as a plain agent.
4. `main.js` `grouped()`: `draw` maps `spaceRowOrder`'s descriptors to elements, so the tree comes before `agentRows`. `this.order` (agent cycling, `setAgentOrder`) is pushed in the same drawn order. `row()` itself is not touched (D10).
5. `test/rows.test.mjs` (or `test/order.test.mjs`): golden row order per fixture space, including the owner's "Automagik Herdr" space with t187. It also records the golden space order per fixture for the default mode (alphabetical, D6) as data; Group 3a tests it and adds the manual, pinned and float cases.

**Interfaces:**
- Consumes: `buildTree`, `visibleRows`, `helpersOf` (rows.js, unchanged).
- Produces: `State = { terminals: {address, agent, cwd, state, status, status_ms, turn, where, parent, created_ms, program, labels}[], spaces: {id, name, machine, folder, selected, tabs: {id, name, selected, panes: {pane, terminal}[]}[]}[], projects: {key, machine, file}[], registry: string[] }`; `spaceRowOrder({tree, agents, shells}) → {kind: "main"|"category"|"bot"|"helper"|"agent"|"shell", id: string, depth: number}[]`; fixtures in `test/fixtures/sidebar/`.

**Acceptance Criteria:**
- [ ] In the recorded "Automagik Herdr" space, the main bot is drawn above the plain omp agent t187.
- [ ] In every fixture space, no bot descriptor comes after an agent or shell descriptor, and every live terminal appears exactly once.
- [ ] No fixture holds `/Users/`, an instructions text or a token.
- [ ] The PR holds only `fix`, `test` or `docs` commits, and `node scripts/version.mjs next` prints `0.2.1` on its branch before merge.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/spaces-agents/*.js mods/spaces-agents/*.mjs mods/spaces-agents/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check && sh -n install.sh && { [ ! -f scripts/themes.mjs ] || node scripts/themes.mjs check; } && test "$(node scripts/version.mjs next)" = 0.2.1
```

**depends-on:** none

---

### Group 2: tidy planner, dry run, automatic non-visual fixes

**Goal:** `automagik-herdr tidy` reports every drift as a plan and changes nothing; start, attach and create fix only what the owner can't see.

**Deliverables:**
1. `mods/am-sidebar/tidy.js`, pure, imports nothing: `plan(state) → Action[]`. Rules in this group: stale registry entries (a key whose folder is gone, issue #11); bot pane labels (`role=`, `category=`, `herdr.space`) that disagree with bots.json and the project's space; strays (a pane whose project key differs from its space's project); empty spaces; duplicate spaces for one project; worktree spaces no seat needs; orphan helpers (a helper whose hc parent is not its bot's pane, D3); a project with live bots and no space.
2. `mods/am-sidebar/bin/state.mjs`: `readState()` builds `State` with one `hc ls --json`, one `hc get` per bot-labelled pane, one `herdr-app ls`, the bots.json files and `am-sidebar-projects.json`.
3. `automagik-herdr tidy` prints the plan in plain lines, grouped visual / non-visual; `--json` prints `Action[]`. It writes nothing.
4. Start, attach and create run `plan(readState())` and apply only `visual: false` actions: registry prune (rewrite `am-sidebar-projects.json`) and relabel (`hc label`). Failures become warnings, never a failed command.
5. Tests over the Group 1 fixtures: the expected plan per fixture; `plan` on a state with the plan's non-visual actions applied returns no non-visual action.

**Interfaces:**
- Consumes: Group 1's `State` and fixtures; `projectKeyOf` (model.js); `PROJECTS_FILE` as `am-sidebar-projects.json` after am-pack Group 7.
- Produces: `Action = { kind, visual: boolean, why: string, ... }` with kinds `prune-registry {key}`, `relabel {terminal, set: Record<string,string>}` (non-visual); `move-stray {terminal, from: {space, tab}, to: {space, tab}}`, `close-space {space, reason: "empty"|"duplicate"|"worktree"}`, `rename-space {space, from, to}`, `create-space {key, folder, name}`, `order-spaces {ids: string[]}` (visual); `report {kind: "orphan-helper"|"foreign", terminal, note}` (never acted on). `plan(state: State, opts?) → Action[]`; `readState() → Promise<State>`.

**Acceptance Criteria:**
- [ ] On the fixtures, the plan names drifts 2–7 of the request (each that applies to the recorded state) and the stale `~/workspace/repos/orchestrator` registry entry.
- [ ] `tidy` and `tidy --json` change no file, label or window (checked against fake hc and a fake `herdr-app`).
- [ ] Running the non-visual fixes twice: the second run does nothing.
- [ ] The recorded fixtures still give the golden order.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/*/*.js mods/*/*.mjs mods/*/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check && sh -n install.sh && node scripts/themes.mjs check
```

**depends-on:** Group 1, am-pack Group 7 (and `dev` with Group 1 merged into `wish/am-pack` after it)

---

### Group 3a: Space order modes, needs-me float, display name

**Goal:** The sidebar draws spaces by the owner's chosen mode, with pins on top and spaces that need the owner floating above them until resolved.

**Deliverables:**
1. `model.js`: `parseBots` keeps an optional top-level `name` (a non-empty string; anything else is left out with a warning). `displayNameOf(file, key)` returns it, else the main checkout's folder name.
2. `rows.js` (or a new pure `order.js`): `needsOwner(space, state)` per D9, and `spaceOrder(rows, prefs, state)` per D6 and D9: floats first (oldest need first), then pins in their order, then the rest by mode (alpha: projects with bots by display name, then spaces without bots by name; manual: `prefs.manual`, unknown slots last by name). Remote machines group per machine; worktree spaces stay under their main checkout.
3. `main.js`: `ordered()` uses `spaceOrder`; `row()` is not changed (D10). The space menu gets "Pin to top" / "Unpin" and "Sort spaces: Alphabetical / Manual". Drag follows D12. Prefs read and write `am.sidebar.order`.
4. Golden space order per fixture and per mode; a blocked fixture floats, and the same fixture with the status cleared returns to its slot.

**Interfaces:**
- Consumes: Group 1's `State`, fixtures and `spaceRowOrder`.
- Produces: `displayNameOf(file, key: string) → string`; `slotKey(row) → string`; `needsOwner(space, state: State) → { since: number, terminal: string, why: "blocked"|"error"|"decision" }[]` (empty: no need); `spaceOrder(rows, prefs: {mode, manual, pins}, state: State) → row[]`; `ORDER_KEY = "am.sidebar.order"`.

**Acceptance Criteria:**
- [ ] Each mode gives its golden order on the fixtures; pins stay on top in their own order.
- [ ] The blocked fixture floats to the top, then returns; no `space.move` is called (checked against the herdr stub).
- [ ] A bots.json with `"name": "Brain"` still parses with version 1 and sorts as "Brain"; one without it sorts by folder name.
- [ ] The recorded fixtures still give the golden order.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/*/*.js mods/*/*.mjs mods/*/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check && sh -n install.sh && node scripts/themes.mjs check
```

**depends-on:** Group 1, am-pack Group 7 (and `dev` with Group 1 merged into `wish/am-pack` after it)

---

### Group 3b: Placement from the project key, one space per project, briefing lines

**Goal:** Start and Attach place every bot in its project's space, create that space when none is open, and the briefing tells bots how to keep the tree clean.

**Deliverables:**
1. `placementOf` (bin) picks the project's space from `readState()` by project key, never from `where`. Start and Attach write `herdr.space` (and `herdr.tab` when known) to it (D4).
2. No live space for the project: Start runs `herdr-app do space.new` with folder = main checkout and name = `displayNameOf` (D7), then places the bot there.
3. `tidy.js` gains the rename rule (a project space whose name is not its display name → `rename-space`) and the order rule (Herdr's order differs from `spaceOrder` without floats → `order-spaces`).
4. `briefingText.mjs`: one line telling a bot to start helpers from its own pane (hc's default `--parent`, D3); one line telling a main bot to set and clear `automagik-herdr.needs-owner` (D11). Both inside the 9,900-character cap.
5. Tests with fake hc and fake `herdr-app`: placement by key; space creation; the two briefing lines; the new plan rules on the fixtures.

**Interfaces:**
- Consumes: Group 2's `readState`, `plan`, `Action`; Group 3a's `displayNameOf`, `spaceOrder`.
- Produces: `placementOf(key, state) → {space, tab} | null`; `ensureSpace(key, name) → space id`; briefing lines `HELPER_LINE`, `NEEDS_OWNER_LINE`.

**Acceptance Criteria:**
- [ ] Start for a project with no open space creates one named by display name and places the bot in it.
- [ ] A pane whose `where` names another space is still placed by its project key.
- [ ] The briefing shows both lines and stays under the cap.
- [ ] The recorded fixtures still give the golden order.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/*/*.js mods/*/*.mjs mods/*/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check && sh -n install.sh && node scripts/themes.mjs check
```

**depends-on:** Group 2, Group 3a, am-pack Group 7

---

### Group 4: tidy --apply

**Goal:** `automagik-herdr tidy --apply` makes the window match the rules, safely, and reports every change.

**Deliverables:**
1. `--apply` prints the plan first, then runs its visual actions in this order: create spaces, move strays, rename, close spaces, order spaces.
2. Moving a stray: select the stray's space and tab (`space.select`, `tab.select`), `terminal.park`, check it took effect (a `{pending:true}` result means it did not: report and skip), then select the target space and tab and `terminal.keep` there. The owner's selection is restored at the end.
3. Closing: an empty or duplicate space is emptied by parking (a space whose last pane is parked disappears by itself); `space.close` only on a space with no panes. Any kill parks first, then kills (`hc kill` on a kept terminal respawns a shell). Slash commands, if ever needed, go through `hc keys`, never `hc send`.
4. Refusals: it never acts on a Pocket Link pane, nor on a pane of another project than the space's project; those become `report` lines.
5. A report of every change, printed and saved to `<app home>/automagik-herdr/tidy/<date>.json`.
6. A scratch-window end-to-end check (a Herdr window on a scratch `HERDR_APP_HOME`, no live owner window), set up from a fixture; then one owner-approved run on the real window.

**Interfaces:**
- Consumes: Group 2's `plan`, `Action`, `readState`; Group 3b's rename and order rules and `ensureSpace`.
- Produces: `apply(actions: Action[], io) → { done: Action[], skipped: {action, reason}[] }`; the report file.

**Acceptance Criteria:**
- [ ] On the scratch window, `--apply` ends with one space per project, named by display name, in the sidebar's order; a second `--apply` plans nothing.
- [ ] A park that returns `{pending:true}` is reported and skipped, never retried in a loop.
- [ ] Pocket Link's folder, LaunchAgent and panes are untouched.
- [ ] One `--apply` on the owner's window ran with the owner's approval, and its report is in Review Results.
- [ ] The recorded fixtures still give the golden order.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/*/*.js mods/*/*.mjs mods/*/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check && sh -n install.sh && node scripts/themes.mjs check
```

**depends-on:** Group 2, Group 3b, am-pack Group 7

---

### Group 5: The space row, "A with C's bar"

**Goal:** Each space row shows the owner's pick: a pulse line of live counts with a needs-you badge, and an activity bar of turns per minute by provider.

**Deliverables:**
1. The pulse line: ● working / ○ idle / ⚠ blocked seat counts from hc status; "N ready" (PRs/MRs open, not draft, approved, mergeable) and ✓/✗ for the default branch's CI from the forge (`gh` or `glab`, picked by the remote's host); ↓/↑ from git (the sidebar's existing cached git info); the "N need you" badge from `needsOwner`.
2. The activity bar: turns per minute over the last 30 minutes, coloured by provider (Claude orange, Codex green, DeepSeek blue, others grey), with each provider's share. Source: hc's `turn` counter ("goes up each time the status leaves `working`"), sampled each tick into a 30-bucket ring buffer in memory. A counter that goes down (a new terminal) counts from zero. No transcript scanning.
3. Clicks: the badge opens the oldest waiting item (`pane.focus` on its terminal); ⚠ focuses the stuck seat.
4. Performance: one hc read per tick for all spaces; git and forge calls cached per project, the forge at most once a minute; no process per space per tick; nothing polls while the sidebar is hidden.
5. Pure functions with tests over the fixtures plus a synthetic turn series: counts, bar buckets, provider shares.

**Interfaces:**
- Consumes: Group 3a's `needsOwner`, `slotKey`; Group 1's `State`; `row()` in main.js.
- Produces: `pulseOf(space, state) → {working, idle, blocked, needYou}`; `bucketsOf(samples, now) → {minute, byProvider: Record<string, number>}[]` (30 entries); `sharesOf(buckets) → Record<string, number>`; `providerOf(terminal) → "claude"|"codex"|"deepseek"|"other"`; `forgeOf(remoteUrl) → "gh"|"glab"|null`.

**Acceptance Criteria:**
- [ ] The synthetic turn series gives the expected buckets and shares; a counter reset adds no negative turns.
- [ ] The counts on the fixtures match a hand count.
- [ ] With 10 spaces open, one tick starts at most one hc process; forge calls per project are at most one a minute (counted with fakes).
- [ ] The badge shows only when `needsOwner` is non-empty; clicking it focuses the oldest item.
- [ ] The recorded fixtures still give the golden order.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/*/*.js mods/*/*.mjs mods/*/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check && sh -n install.sh && node scripts/themes.mjs check
```

**depends-on:** Group 3a, am-pack Group 7

---

## QA Criteria

_What must be verified on dev after merge. The QA agent tests each criterion._

- [ ] After v0.2.1: in the owner's sidebar, every space draws its bots above plain agents (owner click-through, read-only).
- [ ] On a scratch home with the pack: Start of a bot whose project has no space creates the space, named by display name, and the bot shows in it.
- [ ] On a scratch window: `tidy` changes nothing; `tidy --apply` reconciles; a second `tidy --apply` plans nothing.
- [ ] Pinning, manual drag and alphabetical mode each survive a Herdr restart; a blocked seat floats its space and the float ends when it unblocks.
- [ ] The pulse line and activity bar update live without visible load (Activity Monitor: the sidebar adds no steady process).
- [ ] Regression: Start, Attach, Detach, the briefing and the bot form work as in v0.2.0.

---

## Assumptions / Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| The owner overrides D1 to "ship as v0.4.0 after am-pack" | Medium | Groups 2–5 are written against the am-* names either way; only their PR base changes, to `dev` after v0.3.0 |
| A `feat` lands on `dev` before Group 1 merges and v0.2.1 becomes 0.3.0 | High | Group 1's validation checks `version.mjs next` = 0.2.1 on its branch; merge it first |
| Group 1 edits `mods/spaces-agents/main.js` and `rows.js`, which am-pack Group 7 renames | Medium | Merge `dev` (with Group 1) into `wish/am-pack` right after am-pack Group 7 and before Group 2 starts; git follows the rename into `mods/am-sidebar/` |
| `scripts/themes.mjs` exists only on `wish/am-pack`, not on `dev` | Low | Group 1's gate guards that check; Groups 2–5 run it as is |
| Recording fixtures reads the owner's live install | Medium | One read-only run with the owner's approval (AGENTS.md); redaction test in Group 1 |
| `terminal.park` returns `{pending:true}` and nothing happens | High | Group 4 selects the tab first, checks the result, reports and skips; never loops |
| `tidy --apply` acts on a pane it should not | High | Refusal rules (Pocket Link, other projects), dry run by default, scratch window first, one approved owner run |
| The usage-limit prompt may not set hc status `blocked` | Medium | Group 3a checks it on a fixture; if not, the badge misses it, and a follow-up adds a detector |
| A main bot forgets to clear `automagik-herdr.needs-owner` | Low | Tidy reports a needs-owner label older than a day; the briefing line says to clear it |
| Per-minute turns: hc keeps no history, so the bar is empty for 30 minutes after a sidebar restart | Low | Accept it (deferred); fallback if `turn` is missing on a row: count `working`→not-working status changes between ticks |
| The needs-me float flickers when a seat blocks and unblocks quickly | Low | Deferred hysteresis, added only if the owner reports it |
| The mod API may not say when the sidebar is hidden | Medium | Fetch only from render-driven ticks; if Herdr renders hidden views, Group 5 stops ticks when the sidebar is collapsed |
| A forge CLI is missing or not logged in | Low | "ready" and CI are left out of the row; no error shown |
| Drag indexes rows, not spaces, once the sidebar sorts | Medium | D12: map by space id; a test drags in each mode |

---

## Review Results

_The read-only reviewer returns evidence; the invoking orchestrator appends a timestamped block here after plan, execution, and PR reviews._

---

## Files to Create/Modify

```
# Group 1 (dev, before the rename)
mods/spaces-agents/rows.js, mods/spaces-agents/main.js
test/rows.test.mjs (or test/order.test.mjs), test/fixtures/sidebar/*.json

# Groups 2-5 (wish/am-pack, after am-pack Group 7)
mods/am-sidebar/tidy.js                      (new, Group 2)
mods/am-sidebar/bin/state.mjs                (new, Group 2)
mods/am-sidebar/bin/automagik-herdr.mjs      (Groups 2, 3b, 4)
mods/am-sidebar/model.js                     (Group 3a)
mods/am-sidebar/rows.js or order.js          (Group 3a)
mods/am-sidebar/main.js                      (Groups 3a, 5)
mods/am-sidebar/briefingText.mjs             (Group 3b)
mods/am-sidebar/launchArgs.js                (Group 3b)
mods/am-sidebar/pulse.js                     (new, Group 5)
test/tidy.test.mjs, test/order.test.mjs, test/pulse.test.mjs, test/cli.test.mjs
README.md (tidy, the display-name field, needs-owner label), mods/am-sidebar/RECIPE.md
```
