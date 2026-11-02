# Wish: Sidebar rules — every space and row ordered by its nature, with no drift

| Field | Value |
|-------|-------|
| **Status** | APPROVED |
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
- the new space row the owner picked ("A with C's bar"): a pulse line with live counts, and a second line with the project's output over 24 hours.

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
- The space row redesign "A with C's bar": the pulse row, the 24-hour output line, the verdict log it reads, the needs-you badge and its clicks (Group 5).

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
| D6 | **R2 replaced (owner addition).** Space order supports three modes together: alphabetical sort (by display name), manual order (drag), and pin (pinned spaces stay at the top, in their own order). The sidebar draws this order with a pure function. The person's choice lives in the shared key `am.sidebar.order` = `{ mode: "alpha" \| "manual", manual: slotKey[], pins: slotKey[] }`. A slot key is the project id for a project's space, else `space:<id>`. Remote machines stay grouped under their machine headers; the order applies inside each group. Worktree spaces stay under their main checkout. `tidy --apply` aligns Herdr's own order with `space.move`, so ⌘1-9 and `space.next` agree. When `am.sidebar.order` is absent, the sidebar seeds it in manual mode from Herdr's current order, so the owner's order is kept; alphabetical is a mode the owner picks. Workspace-first (#14) stays out. | The owner wants all three modes at once. A pure function means drawing never moves the window. The `am.*` key follows am-pack's rename. A project key is stable; a space id changes when a space is recreated. |
| D7 | **R1 adapted.** A project's display name comes from a new OPTIONAL top-level field in `.herdr/bots.json` (for example `"name": "Brain"`), falling back to the main checkout's folder name. The schema stays version 1. One space per project: when Start finds no live space for the project, the CLI creates one with `herdr-app do space.new` (folder = main checkout, name = display name). Worktree spaces are kept only while a seat needs them (tidy reports the others). No squad spaces. | `parseBots` throws only on `version !== 1`, so an optional field is safe. Creating a space on Start is the owner's own action, so it is allowed. The bot tree already is the squad view. |
| D8 | **Anti-drift tests.** Group 1 records today's messy state as fixtures under `test/fixtures/sidebar/`: `hc ls --json` rows, the `.labels` of every bot pane (`hc get <t> --json`), `herdr-app ls` spaces and tabs, and the bots.json files. They are redacted: paths under `~` only, no instructions text, no tokens. Golden expected row order and space order per rule. Every later group's acceptance includes "the recorded fixtures still give the golden order". tidy's planner is a pure function `plan(state) -> actions[]`, tested on the same fixtures; running it twice is a no-op. | Drift came back because nothing pinned the order. A recorded fixture is the real mess, not an invented one. |
| D9 | **Needs-me float (owner addition).** A space that needs the owner moves to the top of its machine group, above pins, temporarily. It returns to its slot once that is resolved. This is the sidebar's drawing only, never `space.move`. The signal is defined once, as a pure `needsOwner(space, state)` in Group 3a. Sources: a blocked seat (a dialog, the usage-limit prompt included: hc status `blocked`); the sidebar's existing screen scan (`main.js` `scanHermes`, `this.screen`), so the badge matches today's "Needs you" chip; a failed run (hc status `error`; an automation's run terminal carries `automation=<name>` and shows `error` when it fails, so this source covers automations too); and a main bot's pending owner decision (the pane label `automagik-herdr.needs-owner`, see D11). A red CI ✗ shows on line 1 but is NOT a needs-owner source. | Herdr's ⌘1-9 must not reorder every time something blocks. One signal feeds both the float and the row's badge, so they never disagree. |
| D10 | **The space row "A with C's bar" is in scope (owner's pick, 2026-11-02),** as its own group (Group 5). The ordering functions return slot keys and row descriptors only. Rendering stays in `main.js` `row()`, so the redesign and the ordering never edit the same function. | The owner picked the design. Keeping order and rendering apart lets Groups 3a and 5 change without conflict. |
| D11 | **A pending owner decision is a pane label.** A main bot that waits on the owner sets `automagik-herdr.needs-owner=<short text>` on its own pane with `hc label`, and removes it once answered. One briefing line tells main bots this (Group 3b). | There is no other primitive for "a decision waiting". A label is visible to the sidebar's single hc read, needs no new process, and the main bot controls it. |
| D12 | **Owner gestures move Herdr's order too.** A drag writes the manual order to `am.sidebar.order` and switches the mode to manual. It then moves only the dragged space with `space.move`. The index comes from the dropped-on neighbour's position in `spaces()` (just after the space now above it in the base order), never from a row index. Pin, unpin and a mode switch are owner gestures as well: each runs the `space.move` calls that bring Herdr's order to the new base order (pins + mode, no float). ⌘N is not row N for spaces the float or Start reorder, until the next `tidy --apply`. | The owner's own gesture in the sidebar is the owner acting, so these `space.move` calls are allowed and keep ⌘1-9 in step. Today's handler (`main.js:973`) indexes `spaces()` by row index, which is wrong once the sidebar sorts. |
| D13 | **Line 2 is 24-hour output, and first-pass needs a verdict log** (owner, 2026-11-02; this replaces the provider bar). It shows merges per hour with failure ticks, the merged count without chores, the median time from first commit to merge, and the first-pass SHIP rate. Main bots record each independent review verdict with `automagik-herdr verdict`, as append-only JSON lines under `<app home>/automagik-herdr/verdicts/`. | The owner judges a project by what it ships, not by which provider ran. PR-open → merge is ~15 minutes everywhere, because agents open PRs late, so the first commit is the honest start. No forge stores "first review said SHIP", so it has to be recorded where reviews happen. The log lives in the app home, not in the repo, so it never blocks a `git pull` (issue #6). |
| D14 | **A space is always its project's top level** (owner, 2026-11-02). A space's folder is the main checkout of the project its bots belong to (a git main checkout, or the folder that holds `.herdr/bots.json`), or that project's worktree for a worktree space. A missing folder, a subfolder, or another project's folder is drift. Herdr can't change a space's folder, so the fix is to recreate the space on the right folder and move its panes over. The folder-icon row for a remembered project with no space becomes an "Open space for <name>" action. Squads are display-only: categories in bots.json are the one way to group a team, and `where` is never read. | On 2026-11-02 three spaces pointed at the wrong folder (Automagik Pocket and cadu at brain-v3; General Orchestrator at a deleted folder) and were recreated by hand. A space on the wrong folder starts new terminals in the wrong repo. |
| D14 | **Estimates.** Group 1 ~3 h; Group 2 ~6 h; Group 3a ~6 h; Group 3b ~5 h; Group 4 ~8 h; Group 5 ~13 h (it was ~10 h before line 2 changed). The total is ~41 focused agent-hours. | The estimates are in focused agent-hours, not calendar time. Groups 2 and 3a run in parallel, and so do Groups 4 and 5. |

## Simplicity Case

- **Simplest complete design:**
  - pure functions for every rule: `spaceRowOrder`, `spaceOrder`, `needsOwner`, `plan`, and the row's counts and buckets;
  - one recorded state shape, shared by the fixtures, the CLI and the sidebar;
  - one CLI command, `tidy`, with dry run as the default.
- **Added machinery:**
  - `am.sidebar.order`, because the owner asked for manual order and pins, which must survive restarts;
  - the label `automagik-herdr.needs-owner`, because no other signal says "a decision waits";
  - an append-only verdict log, because the first-pass rate needs each PR's first review verdict and no forge records it;
  - a per-project forge cache, because "ready" and CI cost a network call each; merged items' first-commit times persist in a file, because they never change.
- **Deferred until measured:**
  - hysteresis on the needs-me float (a minimum time at the top): add it only if the owner reports flicker;
  - running `tidy --apply` automatically: never without a new owner ruling.
- **Complexity removed:**
  - squad spaces;
  - `where` as a placement source;
  - a second order kept in Herdr by the sidebar on every redraw.

## Dependencies

**depends-on:** none
**blocks:** am-pack

Groups 2–5 land in `wish/am-pack` and ship with v0.3.0, so this wish blocks am-pack Group 8 (the release). They also need am-pack Group 7 (the rename); that is a group-level dependency, stated on each group, and not listed above because the wish graph allows no cycle. Group 1 ships now, alone, as v0.2.1 (owner, 2026-11-02).

## Success Criteria

- [ ] In every recorded fixture space, the main bot and every bot are drawn above every plain agent, and shells come last.
- [ ] The owner's "Automagik Herdr" space draws the main bot above the plain omp agent t187, after the v0.2.1 release.
- [ ] `node scripts/version.mjs next` printed `0.2.1` on Group 1's PR branch before it merged.
- [ ] Spaces draw in alphabetical, manual or pinned order as `am.sidebar.order` says, with remote machines grouped per machine.
- [ ] A space with a blocked seat floats to the top and returns to its slot when the seat unblocks; Herdr's own space order does not change.
- [ ] `automagik-herdr tidy` on the recorded fixtures lists every drift in the request (1–7) that the pack can fix or report, and changes nothing.
- [ ] `automagik-herdr tidy --apply` on a scratch window ends with one space per project, named by display name, in the sidebar's order; a second `--apply` plans nothing.
- [ ] Starting a bot of a project with no open space creates that space.
- [ ] Each space row shows the pulse line and the 24-hour output line; the badge appears only when `needsOwner` is true.

## Execution Strategy

**Order of shipping:** Group 1 (R3 fix, v0.2.1) first, to `dev`. `dev` (holding Group 1) is merged into `wish/am-pack` BEFORE am-pack Group 7(a)'s `git mv`, so Group 1's edits move with the folder rather than relying on git's rename detection on the 57 KB `main.js`. Then, after am-pack Group 7, in `wish/am-pack`: the tidy dry-run (Group 2), ordering (Group 3a), placement/R1 (Group 3b), `tidy --apply` (Group 4) and the row (Group 5).

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

### Wave 4 (parallel; disjoint files except one dispatch line each in the CLI)

| Group | Agent | Complexity | Model | Description |
|-------|-------|------------|-------|-------------|
| 4 | engineer + qa | High: changes the owner's window; the park/keep sequence is fragile. ~8 focused agent-hours | inherit | `tidy --apply` |
| 5 | engineer | High: live data, two forge adapters with history queries, the verdict log, and a per-tick budget on the sidebar. ~13 focused agent-hours | inherit | The space row: pulse line and 24-hour output |

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
5. `test/row-order.test.mjs`: golden row order per fixture space, including the owner's "Automagik Herdr" space with t187. It also records the golden space order per fixture for alpha mode as data (the golden space order recorded here is the alpha-mode order); Group 3a tests it and adds the manual, pinned and float cases.

**Interfaces:**
- Consumes: `buildTree`, `visibleRows`, `helpersOf` (rows.js, unchanged).
- Produces: `State = { terminals: {address, agent, cwd, state, status, status_ms, turn, where, parent, created_ms, program, labels}[], spaces: {id, name, machine, folder, selected, tabs: {id, name, selected, panes: {pane, terminal}[]}[]}[], projects: {key, machine, file}[], registry: string[], screen: Record<string, "blocked"|null> }`; `spaceRowOrder({tree, agents, shells}) → {kind: "main"|"category"|"bot"|"helper"|"agent"|"shell", id: string, depth: number, ref: object}[]`, where `shells` are the space's terminals with no agent and no bot (may be empty today, since the sidebar draws no shell rows yet) and `ref` is the tree node, helper or agent object the row draws; fixtures in `test/fixtures/sidebar/`.

**Acceptance Criteria:**
- [ ] In the recorded "Automagik Herdr" space, the main bot is drawn above the plain omp agent t187.
- [ ] In every fixture space, no bot descriptor comes after an agent or shell descriptor, and every live terminal appears exactly once.
- [ ] No fixture holds `/Users/`, an instructions text or a token.
- [ ] The PR holds only `fix`, `test` or `docs` commits, and `node scripts/version.mjs next` prints `0.2.1` on its branch before merge.

**Validation:**
```bash
# Note: on dev, `version.mjs next` prints 0.3.0 until the first `fix` commit lands; it must print 0.2.1 at merge time.
node --test test/row-order.test.mjs && node --test 'test/*.test.mjs' && for f in mods/spaces-agents/*.js mods/spaces-agents/*.mjs mods/spaces-agents/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check && sh -n install.sh && { [ ! -f scripts/themes.mjs ] || node scripts/themes.mjs check; } && test "$(node scripts/version.mjs next)" = 0.2.1
```

**depends-on:** none

---

### Group 2: tidy planner, dry run, automatic non-visual fixes

**Goal:** `automagik-herdr tidy` reports every drift as a plan and changes nothing; start, attach and create fix only what the owner can't see.

**Deliverables:**
1. `mods/am-sidebar/tidy.js`, pure: `plan(state) → Action[]`. It imports only other pure modules (it may import `order.js`, which is pure too). Rules in this group: stale registry entries (a key whose folder is gone, issue #11); bot pane labels (`role=`, `category=`, `herdr.space`) that disagree with bots.json and the project's space; strays (a pane whose project key differs from its space's project); duplicate spaces for one project (their panes move into the canonical space, the project's oldest); spaces that are already empty; worktree spaces no seat needs (reported); orphan helpers (a helper whose hc parent is not its bot's pane, D3, reported); a `automagik-herdr.needs-owner` label older than a day (reported); a project with live bots and no space; a space whose folder is missing, is not a project top level, or belongs to another project than its bots (D14).
2. `mods/am-sidebar/bin/state.mjs`: `readState()` builds `State` with one `hc ls --json`, one `hc get` per bot-labelled pane, one `herdr-app ls`, the bots.json files and `am-sidebar-projects.json`.
3. `automagik-herdr tidy` prints the plan in plain lines, grouped visual / non-visual; `--json` prints `Action[]`. It writes nothing.
4. Start, attach and create run `plan(readState())` and apply only `visual: false` actions: registry prune (rewrite `am-sidebar-projects.json`) and relabel (`hc label`). Failures become warnings, never a failed command.
5. `test/tidy.test.mjs`, over the Group 1 fixtures: the expected plan per fixture; `plan` on a state with the plan's non-visual actions applied returns no non-visual action.

**Interfaces:**
- Consumes: Group 1's `State` and fixtures; `projectKeyOf` (model.js); `PROJECTS_FILE` as `am-sidebar-projects.json` after am-pack Group 7.
- Produces: `Action = { kind, visual: boolean, why: string, ... }` with kinds `prune-registry {key}`, `relabel {terminal, set: Record<string,string>}` (non-visual); `move-pane {terminal, from: {machine, space, tab}, to: {machine, space, tab}, reason: "stray"|"duplicate"}`, `close-space {space}` (only a space already empty), `rename-space {space, from, to}`, `create-space {key, machine, folder, name}`, `recreate-space {space, from: string, to: string, name}` (D14: a new space on the right folder, the old one's panes moved into it), `order-spaces {ids: string[]}` (visual); `report {kind: "orphan-helper"|"foreign"|"stale-worktree-space"|"stale-needs-owner"|"cross-machine", terminal?, space?, note}` (never acted on). `plan(state: State, opts: {now: number, home: string, appHome: string}) → Action[]`; `readState() → Promise<State>`.

**Acceptance Criteria:**
- [ ] On the fixtures, the plan names drifts 2–7 of the request (each that applies to the recorded state) and the stale `~/workspace/repos/orchestrator` registry entry.
- [ ] A fixture with today's three wrong spaces (a folder that is gone; a project's space on another repo's folder; a plain folder's space on a git repo) plans one `recreate-space` each, with the right folder.
- [ ] `tidy` and `tidy --json` change no file, label or window (checked against fake hc and a fake `herdr-app`).
- [ ] Running the non-visual fixes twice: the second run does nothing.
- [ ] The recorded fixtures still give the golden order.

**Validation:**
```bash
node --test test/tidy.test.mjs && node --test 'test/*.test.mjs' && for f in mods/*/*.js mods/*/*.mjs mods/*/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check && sh -n install.sh && node scripts/themes.mjs check
```

**depends-on:** Group 1 (via `dev`, merged into `wish/am-pack` before am-pack Group 7(a)), am-pack Group 7

---

### Group 3a: Space order modes, needs-me float, display name

**Goal:** The sidebar draws spaces by the owner's chosen mode, with pins on top and spaces that need the owner floating above them until resolved.

**Deliverables:**
1. `model.js`: `parseBots` keeps an optional top-level `name` (a non-empty string; anything else is left out with a warning). `displayNameOf(file, key)` returns it, else the main checkout's folder name.
2. A new pure `order.js`: `needsOwner(space, state)` per D9 (hc status `blocked` or `error`, which covers failed automation runs, `state.screen`, the needs-owner label), and `spaceOrder(rows, prefs, state)` per D6 and D9: floats first (oldest need first), then pins in their order, then the rest by mode (alpha: projects with bots by display name, then spaces without bots by name; manual: `prefs.manual`, unknown slots last by name). Remote machines group per machine; worktree spaces stay under their main checkout.
3. `main.js`: `ordered()` uses `spaceOrder`; `row()` is not changed (D10). With no `am.sidebar.order`, the prefs are seeded in manual mode from Herdr's current order (D6). The space menu gets "Pin to top" / "Unpin" and "Sort spaces: Alphabetical / Manual". A remembered project with no space draws as "Open space for <display name>", which runs `space.new` on its top-level folder (D14). Drag, pin, unpin and mode switches follow D12.
4. `test/order.test.mjs`: golden space order per fixture and per mode; a blocked fixture floats, and the same fixture with the status cleared returns to its slot.

**Interfaces:**
- Consumes: Group 1's `State`, fixtures and `spaceRowOrder`.
- Produces: `displayNameOf(file, key: string) → string`; rows in `ordered()`'s shape `{w, i, g, tree}` (`w` the Herdr space, `i` its index in `spaces()`, `g` its git info, `tree` the worktree connector or null); `slotKey(space, projectKey: string|null) → string` (projectKey is `projectKeyOf`'s result); `needsOwner(space, state: State) → { since: number, terminal: string, why: "blocked"|"screen"|"error"|"decision" }[]` (empty: no need); `spaceOrder(rows, prefs: {mode, manual, pins}, state: State) → rows`; `seedPrefs(spaces) → prefs`; `ORDER_KEY = "am.sidebar.order"`.

**Acceptance Criteria:**
- [ ] Each mode gives its golden order on the fixtures; pins stay on top in their own order; absent prefs seed manual mode from Herdr's order.
- [ ] The blocked fixture floats to the top, then returns; no `space.move` is called for a float (checked against the herdr stub).
- [ ] Pin, unpin and a mode switch each call `space.move` to bring Herdr's order to the new base order (D12), checked against the herdr stub.
- [ ] A usage-limit prompt case (a seat blocked on the usage-limit dialog) makes `needsOwner` non-empty; a red CI alone does not.
- [ ] A bots.json with `"name": "Brain"` still parses with version 1 and sorts as "Brain"; one without it sorts by folder name.
- [ ] The recorded fixtures still give the golden order.

**Validation:**
```bash
node --test test/order.test.mjs && node --test 'test/*.test.mjs' && for f in mods/*/*.js mods/*/*.mjs mods/*/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check && sh -n install.sh && node scripts/themes.mjs check
```

**depends-on:** Group 1 (via `dev`, merged into `wish/am-pack` before am-pack Group 7(a)), am-pack Group 7

---

### Group 3b: Placement from the project key, one space per project, briefing lines

**Goal:** Start and Attach place every bot in its project's space, create that space when none is open, and the briefing tells bots how to keep the tree clean.

**Deliverables:**
1. `placementOf` (bin) picks the project's space from `readState()` by project key, never from `where`. Start and Attach write `herdr.space` (and `herdr.tab` when known) to it (D4).
2. No live space for the project: Start and Attach run `herdr-app do space.new` with folder = main checkout and name = `displayNameOf` (D7), then place the bot there.
3. `tidy.js` (which may import the pure `order.js`, both being pure) gains the rename rule (a project space whose name is not its display name → `rename-space`) and the order rule (Herdr's order differs from `spaceOrder` without floats → `order-spaces`).
4. `briefingText.mjs`, three lines, all inside the 9,900-character cap:
   - a bot starts helpers from its own pane (hc's default `--parent`, D3);
   - a main bot sets and clears `automagik-herdr.needs-owner` (D11);
   - a main bot records each independent review verdict with `automagik-herdr verdict` (D13; the command itself is Group 5's, and both ship in v0.3.0).
5. `test/placement.test.mjs`, with fake hc and fake `herdr-app`: placement by key; space creation on Start and on Attach; the three briefing lines; the new plan rules on the fixtures.

**Interfaces:**
- Consumes: Group 2's `readState`, `plan`, `Action`; Group 3a's `displayNameOf`, `spaceOrder`.
- Produces: `placementOf(key, state) → {space, tab} | null`; `ensureSpace({key, machine, folder, name}) → Promise<string>` (the space id); briefing lines `HELPER_LINE`, `NEEDS_OWNER_LINE`, `VERDICT_LINE`.

**Acceptance Criteria:**
- [ ] Start, and Attach, for a project with no open space create one named by display name and place the bot in it.
- [ ] A pane whose `where` names another space is still placed by its project key.
- [ ] The briefing shows all three lines (HELPER_LINE, NEEDS_OWNER_LINE, VERDICT_LINE) and stays under the cap.
- [ ] The recorded fixtures still give the golden order.

**Validation:**
```bash
node --test test/placement.test.mjs && node --test 'test/*.test.mjs' && for f in mods/*/*.js mods/*/*.mjs mods/*/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check && sh -n install.sh && node scripts/themes.mjs check
```

**depends-on:** Group 2, Group 3a, Group 1 (via `dev`, merged into `wish/am-pack` before am-pack Group 7(a)), am-pack Group 7

---

### Group 4: tidy --apply

**Goal:** `automagik-herdr tidy --apply` makes the window match the rules, safely, and reports every change.

**Deliverables:**
1. `mods/am-sidebar/tidy-apply.js` holds `apply`; the CLI gets a one-line dispatch for `--apply`. It prints the plan first, then runs the visual actions in this order: create spaces, recreate spaces (D14: new space on the right folder, then each pane park → keep into it, the same steps as a move; the old space disappears once its last pane is parked), move panes, rename, close spaces, order spaces.
2. Moving a pane (`move-pane`, a stray or a duplicate space's pane):
   - refuse a move across machines (a `report` line);
   - select the pane's space and tab (`space.select`, `tab.select`), then confirm with one `herdr-app ls` read that the selection took effect; if not, report and skip;
   - `terminal.park`; a `{pending:true}` result means it did not take effect: report and skip;
   - select the target space and tab, then `terminal.keep` there;
   - if keep fails after the park, report the terminal id and a recovery command (`herdr-app do terminal.keep '{"terminal":"<id>"}'` from the target tab). A parked terminal keeps running, so nothing is lost.
   - The owner's selection is restored at the end.
3. Duplicate spaces: their panes belong to the same project, so they are not strays. Each pane moves park → keep into the canonical space (the project's oldest space). A space whose last pane is parked disappears by itself. `space.close` runs only on a space that is already empty. Slash commands, if ever needed, go through `hc keys`, never `hc send`.
4. Refusals: it never acts on a Pocket Link pane, nor on a pane of another project than the space's project; those become `report` lines.
5. A report of every change, printed at the end (and as data with `--json`).
6. `test/tidy-apply.test.mjs` with a fake `io`; then a scratch-window end-to-end check (a Herdr window on a scratch `HERDR_APP_HOME`, no live owner window), set up from a fixture; then one owner-approved run on the real window.

**Interfaces:**
- Consumes: Group 2's `plan`, `Action`, `readState`; Group 3b's rename and order rules and `ensureSpace`.
- Produces: `apply(actions: Action[], io: { exec(cmd: "herdr-app"|"hc", args: string[]) → Promise<{code, stdout}>, read() → Promise<State> }) → { done: Action[], skipped: {action, reason, recovery?}[] }` in `tidy-apply.js`.

**Acceptance Criteria:**
- [ ] On the scratch window, `--apply` ends with one space per project, named by display name, in the sidebar's order; a second `--apply` plans nothing.
- [ ] A space on the wrong folder ends recreated on its project's top level with all its panes; a second `--apply` plans nothing.
- [ ] A park that returns `{pending:true}` is reported and skipped, never retried in a loop.
- [ ] A keep that fails after a park is reported with the terminal id and the recovery command (tested with a fake `herdr-app`).
- [ ] A duplicate space's panes end in the canonical space; no `space.close` runs on a space that still has panes; a cross-machine move is refused.
- [ ] Pocket Link's folder, LaunchAgent and panes are untouched.
- [ ] One `--apply` on the owner's window ran with the owner's approval, and its report is in Review Results.
- [ ] The recorded fixtures still give the golden order.

**Validation:**
```bash
node --test test/tidy-apply.test.mjs && node --test 'test/*.test.mjs' && for f in mods/*/*.js mods/*/*.mjs mods/*/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check && sh -n install.sh && node scripts/themes.mjs check
```

**depends-on:** Group 2, Group 3b, Group 1 (via `dev`, merged into `wish/am-pack` before am-pack Group 7(a)), am-pack Group 7

---

### Group 5: The space row: pulse line and 24-hour output

**Goal:** Each space row shows the owner's pick. Line 1 is a pulse line of live counts with a needs-you badge. Line 2 is the project's output over the last 24 hours (owner, 2026-11-02; this replaces the provider bar).

**Deliverables:**
1. **Line 1, the pulse line:**
   - ● working / ○ idle / ⚠ blocked seat counts from hc status;
   - "N ready": PRs/MRs that are open, not draft, approved and mergeable;
   - ✓/✗ for the default branch's CI, from the forge (`gh` or `glab`, picked by the remote's host);
   - ↓/↑ from the sidebar's existing cached git info;
   - the "N need you" badge from `needsOwner`.
2. **Line 2, output over 24 hours:** `▂▅▇▆▃▁▂▅▇█▆▃  77 merged · ⏱ 18m · 1st 68%`.
   - **Bar:** merges per hour, 24 buckets, oldest on the left. A red tick marks an hour in which a run failed (forge CI runs on any branch).
   - **merged:** PRs/MRs merged in the last 24 hours. `isChore(title)` excludes `docs(memory)`, `chore(release)` and version bumps, with the patterns listed in one place and tested.
   - **⏱:** the median time from the branch's **first commit** to the merge. PR-open → merge is not used, because agents open PRs late and it reads ~15 minutes everywhere. A merged item's first-commit time never changes, so it is fetched once and cached for good.
   - **1st:** the first-pass rate, the share of merged items whose first recorded review verdict was SHIP. Items with no recorded verdict are left out, and the count shown is the number covered (`1st 68% of 50`). With no verdicts at all, it shows `1st –`.
3. **The verdict log (D13), in `mods/am-sidebar/bin/verdict.mjs`** with a one-line dispatch from the CLI:
   - `automagik-herdr verdict <pr> <SHIP|FIX-FIRST|BLOCKED> --head <sha> [--reviewer <name>]` appends one JSON line `{pr, head, verdict, reviewer, terminal, at}` to `<app home>/automagik-herdr/verdicts/<project>.jsonl`, where `<project>` is the project-key slug and `terminal` is `HC_TERMINAL_ID`.
   - It accepts calls only from a pane carrying a main bot's `bot=` label for that project; anything else exits 2.
   - It is append-only, one line per call, and never rewritten.
   - Main bots on remote machines can't reach the owner's app home: OUT for now.
   - The briefing line that asks for it is Group 3b's (`VERDICT_LINE`).
   - `firstPass(merged, verdicts)` is pure, and counts a verdict only if its `head` is one of the merged PR's commits.
4. **Forge reads, through one forge adapter per project:**
   - `gh`: `pr list --state merged --search "merged:>=<24h ago>" --json number,title,mergedAt,commits` (the first commit is the earliest `authoredDate`), and `run list --status failure --created ">=<24h ago>"`;
   - `glab`: the merged-MRs API with `updated_after`, and per new MR one commits call that is then cached.
   - Line 1's ready/CI refreshes at most once a minute. Line 2 refreshes at most every 10 minutes. Only spaces shown in the sidebar are refreshed. On a 403 or 429 the adapter backs off (doubling, up to an hour) for that project.
   - Merged items' first-commit times persist in `<app home>/automagik-herdr/forge-cache/<project>.json`, so a restart doesn't fetch them again.
   - A forge that fails or is missing shows `–` and an error tooltip, never stale numbers presented as current.
5. **Clicks:** the badge opens the oldest waiting item (`pane.focus` on its terminal); ⚠ focuses the stuck seat.
6. **Performance:**
   - one hc read per tick for all spaces;
   - git and forge calls cached per project, with no process per space per tick;
   - nothing polls while the sidebar is hidden or collapsed; the collapsed flag is read through am-pack 6a's `am.*` shim (old key `sidebar.collapsed`);
   - forge commands run with argument lists (no shell) and a 20 s timeout.
7. **Tests:** `test/pulse.test.mjs` runs the pure functions over the fixtures, plus a recorded forge sample (redacted titles, synthetic numbers): counts, hourly buckets and failure ticks, `isChore`, the first-commit median, `firstPass` with and without coverage. `test/verdict.test.mjs` covers the command.

**Interfaces:**
- Consumes: Group 3a's `needsOwner`, `slotKey`; Group 1's `State`; `row()` in main.js.
- Produces:
  - `pulseOf(space, state) → {working, idle, blocked, needYou}`;
  - `forgeOf(remoteUrl) → "gh"|"glab"|null`;
  - `forge.js`: `mergedSince(project, sinceMs)`, `readyCount(project)`, `ciState(project)`, `failedRunsSince(project, sinceMs)`, and the cache `firstCommitCache(project)` (file `<app home>/automagik-herdr/forge-cache/<project>.json`);
  - `outputOf(merged, failedRuns, verdicts, now) → {hours: {merges, failed}[24], merged, medianMs|null, firstPass: {rate|null, covered}}`;
  - `isChore(title) → boolean`;
  - `firstPass(merged, verdicts) → {rate|null, covered}`;
  - CLI `automagik-herdr verdict`, and the verdict line format `{pr, head, verdict, reviewer, at}`.

**Acceptance Criteria:**
- [ ] The recorded forge sample gives the expected 24 buckets, the failure ticks, the merged count (chores excluded), the first-commit median and the first-pass rate with its coverage.
- [ ] `verdict` appends exactly one line per call, stamped with the terminal; refuses an unknown verdict or a pane without a main bot's `bot=` label (exit 2); and never rewrites the file.
- [ ] A verdict whose `head` is not one of the merged PR's commits is not counted by `firstPass`.
- [ ] A 403/429 from the forge backs off; hidden spaces are not refreshed.
- [ ] The counts on the fixtures match a hand count.
- [ ] With 10 spaces open, one tick starts at most one hc process. Counted with fakes, forge calls per project stay within one a minute for line 1 and one every 10 minutes for line 2. Merged items' commits are fetched once.
- [ ] The badge shows only when `needsOwner` is non-empty, and clicking it focuses the oldest item.
- [ ] The recorded fixtures still give the golden order.

**Validation:**
```bash
node --test test/pulse.test.mjs test/verdict.test.mjs && node --test 'test/*.test.mjs' && for f in mods/*/*.js mods/*/*.mjs mods/*/bin/*.mjs scripts/*.mjs; do node --check "$f" || exit 1; done && node scripts/version.mjs check && sh -n install.sh && node scripts/themes.mjs check
```

**depends-on:** Group 3a, Group 3b (VERDICT_LINE), Group 1 (via `dev`, merged into `wish/am-pack` before am-pack Group 7(a)), am-pack Group 7

---

## QA Criteria

_What must be verified on dev after merge. The QA agent tests each criterion._

- [ ] After v0.2.1: in the owner's sidebar, every space draws its bots above plain agents (owner click-through, read-only).
- [ ] On a scratch home with the pack: Start of a bot whose project has no space creates the space, named by display name, and the bot shows in it.
- [ ] On a scratch window: `tidy` changes nothing; `tidy --apply` reconciles; a second `tidy --apply` plans nothing.
- [ ] Pinning, manual drag and alphabetical mode each survive a Herdr restart; a blocked seat floats its space and the float ends when it unblocks.
- [ ] The pulse line and the output line update live without visible load (Activity Monitor: the sidebar adds no steady process).
- [ ] Regression: Start, Attach, Detach, the briefing and the bot form work as in v0.2.0.

---

## Assumptions / Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| The owner overrides D1 to "ship as v0.4.0 after am-pack" | Medium | Groups 2–5 are written against the am-* names either way; only their PR base changes, to `dev` after v0.3.0 |
| A `feat` lands on `dev` before Group 1 merges and v0.2.1 becomes 0.3.0 | High | Group 1's validation checks `version.mjs next` = 0.2.1 on its branch; merge it first |
| Group 1 edits `mods/spaces-agents/main.js` and `rows.js`, which am-pack Group 7 renames | Medium | Merge `dev` (with Group 1) into `wish/am-pack` BEFORE am-pack Group 7(a)'s `git mv`, so the edits move with the folder; git's rename detection on the 57 KB `main.js` is not relied on |
| `scripts/themes.mjs` exists only on `wish/am-pack`, not on `dev` | Low | Group 1's gate guards that check; Groups 2–5 run it as is |
| Recording fixtures reads the owner's live install | Medium | One read-only run with the owner's approval (AGENTS.md); redaction test in Group 1 |
| `terminal.park` returns `{pending:true}` and nothing happens | High | Group 4 selects the tab first, checks the result, reports and skips; never loops |
| `tidy --apply` acts on a pane it should not | High | Refusal rules (Pocket Link, other projects), dry run by default, scratch window first, one approved owner run |
| The usage-limit prompt may not set hc status `blocked` | Medium | `needsOwner` also catches it through the screen scan; Group 3a's acceptance checks it on a fixture |
| A main bot forgets to clear `automagik-herdr.needs-owner` | Low | Tidy reports a needs-owner label older than a day; the briefing line says to clear it |
| The needs-me float flickers when a seat blocks and unblocks quickly | Low | Deferred hysteresis, added only if the owner reports it |
| The mod API may not say when the sidebar is hidden | Medium | Fetch only from render-driven ticks; if Herdr renders hidden views, Group 5 stops ticks when the sidebar is collapsed |
| A forge CLI is missing, not logged in, or fails | Low | The row shows `–` with an error tooltip, never stale numbers (Group 5 d4) |
| Forge rate limits (many projects, history queries) | Medium | Back off on 403/429; refresh only shown spaces; persist first-commit times in `<app home>/automagik-herdr/forge-cache/` |
| ⌘N differs from row N for spaces the float or Start reorder | Low | Stated in D12; `tidy --apply` realigns; owner gestures (drag, pin, mode) move Herdr's order at once |
| `verdict` trusts `HC_TERMINAL_ID`, which any process can set | Low | Accepted: the first-pass metric is display-only |
| A verdict line is forged or recorded against the wrong commit | Medium | Only a main bot's pane may call `verdict` (exit 2 otherwise), each line carries its terminal, and `firstPass` counts only a `head` among the merged PR's commits |
| Drag indexes rows, not spaces, once the sidebar sorts | Medium | D12: the index comes from the neighbour's position in `spaces()`; a test drags in each mode |

---

## Review Results

_The read-only reviewer returns evidence; the invoking orchestrator appends a timestamped block here after plan, execution, and PR reviews._

---

### Plan review — 2026-11-02

- Owner approved (in this pane): Group 1 ships now as v0.2.1 on dev; Groups 2–5 ship with am-pack v0.3.0.
- Independent plan review, round 1: FIX-FIRST, 18 findings (4 high: duplicate spaces and park/keep recovery in tidy --apply, files shared between Groups 4 and 5, am-pack Group 8 not waiting for this wish). All applied at b15ce30.
- Round 2: FIX-FIRST, 8 text findings. Applied, and verified by the coordinator against the text (budget 2/2).
- **Ruling:** a failed automation run is not a separate needs-owner source. Its run terminal carries `automation=<name>` and shows hc `error`, which the error source already covers. Cost if wrong: one field and a reader in Group 3a.
- Verdict: APPROVED. `genie wish lint` OK.

### Group 1 — R3 row order, released as v0.2.1 — 2026-11-02

- **PR #27** was merged by the owner at df19e0e (merge 5a59e1b). It shipped three fixes:
  - own-project folders (the owner-reported non-git child folder bug);
  - R3 row order, with recorded and anonymised fixtures;
  - a peek when clicking a bot that has no pane (owner-reported).
- **Reviews:**
  - Criteria review: FIX-FIRST. Privacy: a folder name in the tests and a reversible hash list. Also, a test file name didn't match the plan.
  - Quality review: FIX. The hash list, plus 3 LOWs.
  - The owner merged before the follow-up landed, so the fixes go to dev as a separate `fix` PR (v0.2.2).
- **Release v0.2.1:** the run is green, and the assets are `automagik-herdr-0.2.1.tgz` and `SHA256SUMS`.
  - Installed live with `automagik-herdr update` (0.2.0 → 0.2.1; `--rollback` available). `herdr-app check` passed.
  - A screenshot after the install shows the main bot above `omp` in "Automagik Herdr".
- **Open:**
  - The hash list stays in dev history: the owner ruled "leave the hash history" (2026-11-02). v0.2.2 (PR #28) removed it from the tree.
  - The CLI run from inside a non-git child without `--project` still walks up to the parent. This goes to the creation-UX pass.

## Files to Create/Modify

```
# Group 1 (dev, before the rename)
mods/spaces-agents/rows.js, mods/spaces-agents/main.js
test/row-order.test.mjs (new), test/fixtures/sidebar/*.json

# Groups 2-5 (wish/am-pack, after am-pack Group 7; dev merged in before its Group 7(a))
mods/am-sidebar/tidy.js                      (new, Group 2)
mods/am-sidebar/bin/state.mjs                (new, Group 2)
mods/am-sidebar/bin/automagik-herdr.mjs      (Groups 2, 3b; one-line dispatches for 4 and 5)
mods/am-sidebar/model.js                     (Group 3a)
mods/am-sidebar/order.js                     (new, Group 3a)
mods/am-sidebar/tidy-apply.js                (new, Group 4)
mods/am-sidebar/main.js                      (Groups 3a, 5)
mods/am-sidebar/briefingText.mjs             (Group 3b)
mods/am-sidebar/launchArgs.js                (Group 3b)
mods/am-sidebar/pulse.js                     (new, Group 5)
mods/am-sidebar/forge.js                     (new, Group 5: gh/glab adapter and cache)
mods/am-sidebar/bin/verdict.mjs              (new, Group 5)
test/tidy.test.mjs (2), test/order.test.mjs (3a), test/placement.test.mjs (3b), test/tidy-apply.test.mjs (4)
test/pulse.test.mjs, test/verdict.test.mjs (5)
README.md (tidy, the display-name field, needs-owner label), mods/am-sidebar/RECIPE.md
```
