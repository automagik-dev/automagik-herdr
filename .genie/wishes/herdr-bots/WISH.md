# Wish: Herdr bots — permanent, briefed bots in Herdr's sidebar

| Field | Value |
|-------|-------|
| **Status** | IN_PROGRESS |
| **Slug** | `herdr-bots` |
| **Date** | 2026-11-01 |
| **Author** | Claude Code wish writer, at the orchestrator t1m's request, for the owner |
| **Appetite** | large |
| **Branch** | `wish/herdr-bots` |
| **Repos touched** | `herdr-bots` (this repository); at run time the pack also writes `.herdr/bots.json` and `.claude/settings.local.json` in each bot's project, and files under Herdr's app home |
| **Design** | [DESIGN.md](../../brainstorms/herdr-bots/DESIGN.md) |

## Summary

Every project gets a permanent main bot and a team of bots the owner creates, each saved in the project's `.herdr/bots.json`, playable by any coding agent through Start or Attach, briefed before every Claude turn, and drawn in Herdr's sidebar with an Automagik character, so a person follows the whole team without opening panes. The pack is one Herdr mod folder in this repository, built from the owner's own `spaces-agents` sidebar clone; nothing in Herdr, herdr-core or Automagik changes.

This wish carries DESIGN.md (SHIP, digest verified 2026-11-01) unchanged, plus the owner's additions approved after that review: [owner-additions.md](../../brainstorms/herdr-bots/owner-additions.md) and the sidebar mockup approved as the visual spec, https://claude.ai/artifact/GNt9hy4rSCwrQN5yxF5eDP **version 9**, generated from live `hc ls` by `mockup/gen-sidebar.mjs`. Where an addition changes the design, the Decisions table says so and names the design item it replaces (A1–A15).

## Scope

### IN

DESIGN.md Scope IN items 1–9, each in the group named below, with the additions folded in:

- **Group 1:** the pack skeleton (DESIGN item 1) and bot definitions (item 2, file, project key and discovery), widened by A1–A3: a bot may report to another bot (`lead`), the main bot's direct reports sit in owner-named categories, and a bot may be planned for a later wave.
- **Group 2:** the Create and Edit form (item 2) with its entry points (A10), Start and Attach (item 3), and attaching today's orchestrator conversation as its project's first main bot (item 4), with the parent rule widened to a bot's `lead` (A1).
- **Group 3:** the bot view (items 5–7: rows, folded helpers, Automagik characters, licences and NOTICE), drawn to the mockup: main bot at the root, categories, nested leads, planned rows, the agent's Herdr icon and status mark, fold arrows on hover or focus only, minimal default (A2–A8).
- **Group 4:** the per-turn Claude briefing (item 8), widened so a lead briefs on its own members (A1).
- **Group 5:** the Automagik theme switched on at first load and the share files `RECIPE.md` and `preview.png` (item 9).

### OUT

- Everything in DESIGN.md Scope OUT stays out. In particular: the orchestrator's current team (captains, devs, testers, PM, dogfood, integrator, reviewers) is **not** turned into bots by this wish; the mockup's roster is sample data from live `hc ls`, and the owner creates bots himself (R2-4).
- The mockup's `ASKED_BY` table (reviewers re-hung under the squad that asked) and its review-label notes (`labels.e9`): a patch for today's live data, not product. `hc ls --json` rows carry no labels (re-checked 2026-11-01: keys are `address, agent, cwd, state, status, turn, where`).
- `mockup/gen-sidebar.mjs` as pack code: it is a Bun script with the owner's absolute paths that writes HTML for the artifact. It is the visual reference only; the pack draws with gpui-kit.
- A count or any other mark on a folded row (owner: "nothing else marks a fold"), and persisting fold state across Herdr restarts.
- Briefing lines about planned bots, and Start of a planned bot (it is started after the owner clears `planned` in the edit form).
- Editing category order or category text in a form: categories are created from the create form; order and subtitle are edited by hand in `.herdr/bots.json` (README says so).
- Creating `dev` or any branch on the remote: the operator does that (see Assumptions / Risks).

## Decisions

DESIGN.md Decisions 1–15 hold as written except where an addition below names one it widens or replaces.

| # | Decision | Rationale |
|---|----------|-----------|
| A1 | **Bots nest more than one level.** A team-member entry has an optional `lead`: the id of another bot in the same project; absent means the project's main bot. The view nests a bot under its `lead`, a `lead`'s members are its team, and DESIGN Decision 5 applies one level down: membership comes only from `.herdr/bots.json` by id, never from the hc parent; Start gives a member `--parent <lead's live terminal> --outlive-parent` when its lead is live, else `--no-parent`; a member's briefing names its lead's current terminal as the address to report to. A `lead` that is missing, planned, or forms a cycle falls back to the main bot, and the view shows a warning on that row. Widens DESIGN item 2 ("every team member reports to that project's main bot"), Decision 4 ("the main bot or team member kind is the only reporting edge it holds": `lead` is a second edge), Decision 5 and C5/C6. A2, A3 and A5 likewise widen Decision 4's field list with `category`, `planned` and `model`. | owner-additions item 2 ("every bot with members or helpers can fold") and mockup v9 (captain → dev, tester). team-design's squad shape is captain + dev + tester, so squads need a captain level. Keeping membership in the definitions file preserves DESIGN's reason for not using the hc parent (it is fixed at launch). The mockup nests by hc parent; that is its live-data shortcut, not the rule. |
| A2 | **Categories.** `.herdr/bots.json` holds an ordered `categories` list (`id`, `title`, optional `sub`). A bot whose `lead` is the main bot carries a `category`; deeper members show under their lead and ignore it. The main bot's view lists categories in file order, each a header (uppercase title, muted `sub`) over its bots, then any uncategorised direct reports, then the main bot's own helpers. Create offers the project's categories plus "new category" (title and sub); order and text are edited by hand. | owner-additions item 1 and mockup v9 (Shared, Knowledge, Platform, Engineering, Quality, Access). team-design names the same shape ("categories a person reads first"). The names are the owner's per project, so the pack ships none. |
| A3 | **Planned bots.** A bot entry may carry `planned: { wave, note }` (wave a positive integer, note optional text). It is drawn dimmed (about 45% opacity) in a dashed outline, in the asleep pose, with its note as the second line and a `Wave <n>` pill; Start is not offered; the edit form clears `planned`. A planned bot needs no `agent`. The briefing skips planned bots. | owner-additions item 1 and mockup v9 ("Access & Studio · waits for the auth v2 decision · Wave 3"). One flag on a bot entry is the smallest shape; a separate squad object would add a second kind of row. Matches team-design's "waves". |
| A4 | **Row layout**, left to right: a fold-arrow slot (10 px, empty when the row has no children) · the character (26 px; 30 px for the main bot) · two lines: the bot's name in its colour's ink (Automagik `INKS[colour][0]`), then `role · model` (the main bot: `Main bot · model · project name`; a stopped bot: `not running · role`) · the coding agent's Herdr icon, drawn through the clone's `icon(program, size, color)` (`main.js:31-33`, which honours `Program.icon`'s `tint` rule in `herdr.d.ts:136-152`) from the live terminal's `program`, or for a bot that is not running from its `knownAgents()` entry · the clone's `status()` mark (`main.js:213-218`: spinner, "Needs you" pill, ring, dot). The main bot's row is a raised card with a border in its ink. Members sit inside a solid left guide line, helpers inside a dashed one. Helper rows are smaller: agent icon, name, status mark, no character. A planned row has no fold slot, agent icon or status mark. Replaces DESIGN item 5's "replaces the terminal name and app icon". | Mockup v9 (`gen-sidebar.mjs:107-141`). Icons come through Herdr's own program data, never copied into the pack and never from the owner's `my-icons/` (a teammate lacks it); an agent with no program icon falls back to `${appHome()}/icons/shell.svg`. Kind is shown by place and look: the main bot's card and "Main bot" line, a member's character and nesting, a helper's plain small row. |
| A5 | **`model` field.** A bot entry has an optional free-text `model` (for example `GPT-6.1 Sol`), shown in the row. Start does not pass it to the coding agent. | Mockup v9 shows `role · model`. Passing a model needs per-agent flags, which no current requirement asks for; the field is display only until the owner asks. |
| A6 | **Poses.** DESIGN Decision 7's six-pose mapping stands (working → focused, idle → open, needs you → closed eyes with alert motion, done → happy, failed → sad, asleep → asleep at 10 minutes idle). Additions only: a stopped (not running) bot and a planned bot use the asleep pose. | owner-additions names three poses because the mockup's live data had only working and done bots; it does not narrow the design's six. |
| A7 | **Folding.** The main bot, every category, and every bot with members or helpers can fold. The fold arrow is invisible until the row is hovered or has keyboard focus, then appears, pointing down when open and right when folded; nothing else marks a fold (no count). Default: the main bot open, every category open, every bot folded. Fold state lives in the view for the session, keyed by bot id or category id, and is not persisted. Replaces DESIGN item 6 and C4's "folded with a count". | owner-additions item 2 and mockup v9. Not persisting keeps the minimal default on every launch and adds no store. |
| A8 | **Placement in the sidebar.** A project's bot tree is drawn under the first open space whose folder keys to that project (DESIGN Decision 15), directly after that space's row; other spaces of the same project (worktrees) keep their plain rows and draw no second tree. A remembered project with no open space draws its tree at the end of the list under a plain project header. | Mockup v9 (space row, then the main bot tree, then worktree spaces). DESIGN requires each bot to show once per project. |
| A9 | **Label and file spellings** (left to the wish by DESIGN Decision 1): the bot label key is `bot`, its value the bot id; ids are `b-` plus 10 random lowercase base32 characters, generated at create; `.herdr/bots.json` carries `"version": 1`. | Decision 1 asked the wish to settle the spelling; `bot` sits outside `herdr.*`. |
| A10 | **Entry points.** A "New bot" button in the sidebar footer (mockup v9, `gen-sidebar.mjs:214-216`) opens the Create form; mod commands `spaces-agents.new-bot`, `spaces-agents.edit {bot}`, `spaces-agents.start {bot}` and `spaces-agents.attach {bot, terminal}` (each finds the bot's project by looking its id up in `discoverProjects()`; ids are random, so the lookup is unambiguous) through the clone's `nextCommand()` loop (`main.js:129`; `herdr.d.ts:75`); the clone's terminal right-click menu (`main.js:450-452, 566`) gains "Attach as bot…"; a bot row's right-click menu offers Edit, Start (not for a planned bot) and Attach to the focused pane. | DESIGN names Create, Start and Attach but no way to reach them; without one, C1, C3 and C8 cannot be run from Herdr. These reuse the clone's own menu and command paths and add no new surface. |
| A11 | **Bots are fully managed from the command line** (owner, 2026-11-01: "why isn't the harness able to create and fully manage bots by CLI commands"). The pack ships `mods/spaces-agents/bin/herdr-bots.mjs` (node, no Herdr import), installed on PATH as `herdr-bots` by one README step. Subcommands: `ls`, `show`, `create`, `edit`, `rm`, `category add|edit|rm|order`, `start`, `attach`, `detach`, `brief`; every one takes `--json`; a bot is named by id or by name within its project; the project defaults to the one the current folder keys to (Decision 15). It shares `model.js`, `launchArgs.js` and `briefingText.mjs` with the mod, so the CLI and the sidebar apply the same rules, and it talks to herdr-core with `hc` directly. The CLI is the primary path for agents and scripts and for every acceptance check; the sidebar form is one more front end. | Agents (the main bot included) must create and run bots without a GUI, and GUI automation of Herdr needs the window in front, which takes over the owner's screen. One shared rule set keeps the two front ends from drifting. |
| A12 | **The model is detected, never typed.** A live bot's model is read from its pane's foreground command line (`hc get` `.foreground.argv`, the agent's model flag, e.g. `claude --model claude-opus-5-5`), else from the agent's own configured default; the row shows that. `model` in `.herdr/bots.json` becomes an optional pin chosen from a list of the agent's known models (never free text); when pinned, Start passes it with that agent's model flag, so the pin and the running model are the same thing. Replaces A5. | Owner, 2026-11-01: "why are we selecting the models in a typed field that's completely not linked... this needs to be automatically detected". `hc get t1bw --json` on this host shows `foreground.argv` = `claude --dangerously-skip-permissions --model claude-opus-5-5`. |
| A13 | **The Create/Edit form is redesigned** (owner, 2026-11-01: the current form's UX is unacceptable). A visual mockup is approved by the owner before it is built, as the sidebar was (artifact v9); it is built on the CLI's rules (A11) and the model list (A12). Until then the current form stays as is and the CLI is the way to create bots. | The sidebar's approved-mockup route worked; the form had no visual spec. |
| A14 | **Public repo with Automagik's release automation and updates** (owner, 2026-11-01: "create it under automagik-dev/automagik-herdr, dev = default branch, copy automated version control and updates from automagik itself"; "make it public"). github.com/automagik-dev/automagik-herdr, public, default `dev`, topics `herdr-mod`, `automagik`, `ai-agents`; rulesets as Automagik's (no force push or deletion on `dev`/`main`; no moving or deleting `v*` tags). Copied from Automagik: the bash commit-message check on PRs (`commitlint.yml`), CI on push and PRs, `release.yml`'s cut job (on every push to `dev` with something new: version commit `chore(release): vX.Y.Z`, annotated tag, atomic push, GitHub release with the pack tarball and `SHA256SUMS`, then fast-forward `main`), one version field kept by `scripts/version.mjs`, and updates read from the GitHub releases API: `automagik-herdr update [--check]` verifies the tarball against `SHA256SUMS` and swaps the installed pack with a `.prev` rollback; the mod checks every 4 h and shows a notice. Not copied: Bun, npm, desktop builds, the signed plugin lane, follow-omni. Reopens DESIGN's OUT item "shipping through Automagik's catalogue or update channel" only as far as this repo's own releases. | The owner asked for Automagik's own version control and update path; research of automagik-dev/automagik (`commitlint.yml`, `ci.yml`, `release.yml`, `scripts/version.ts`, `apps/desktop/src/update.js`) gave the smallest copy for a pack with no build step. |
| A15 | **Name and pitch: Automagik Herdr** (owner, 2026-11-01: "rename things from old herdr-bot name"; "sell the power of autonomous cross-harness teams of agents"). The product is Automagik Herdr; the CLI is `automagik-herdr` (was `herdr-bots`, no alias: it never shipped); package and release assets use `automagik-herdr`. Kept on purpose: the mod folder `spaces-agents` (the owner's layout names it and Herdr never overwrites a taken folder), the `bot` label key and `.herdr/bots.json` (bots stay the unit). The README is rewritten to lead with autonomous, cross-harness agent teams (Claude Code, Codex, Gemini, Oh My Pi… under one main bot, briefed every turn, waking each other, visible at a glance), then install, CLI, sidebar. | Owner's words; the old name was internal to the brainstorm. |
| A16 | **Pane labels for the agent event envelope** (t1m for the owner, 2026-11-01; Brain RFC `agent-event-envelope.md`, `ae/1`, where herdr-meter stamps `actor.bot/role/squad` from hc labels). Start and Attach set, Detach removes, and an edit rewrites on a live pane: `bot=<id>` (already shipped); `role=<rank>` when the bot has a rank (a new optional `rank` field, one of captain, dev, tester, reviewer, integrator, pm, main, owner, chosen in the form and the CLI; the main bot is `main`); `category=<category id>` when the bot has one. `squad=` names the team and is set by the team-assembly helper (`squad=memory`). It is never overwritten. When a pane has none, it is copied from the lead's live pane. **Pending:** the owner's OK on `rank`. Owning the `ae/1` JSON Schema is a separate scope after v0.1.0. | The free-text `role` stays for the briefing; the meter needs a closed set. A squad is not a category (Knowledge = retrieval + memory), so it stays separate. Lands as a small group after PR #1. |

## Simplicity Case

- **Simplest complete design:** DESIGN.md's (one mod folder, one definitions file per project, one label per bot pane, one hook script, two theme files), plus three optional fields on a bot entry (`lead`, `category`, `planned`), one optional display field (`model`) and one ordered `categories` list.
- **Added machinery:** `lead`, because the approved view nests captains' members under the captain (A1); `categories`, because the owner reads a team by category first (A2); `planned`, because the view shows later-wave squads before they exist (A3); a per-session fold map in the view, because rows fold and nothing persists (A7). Each is a field read by code that already walks the definitions; none adds a process, store or file.
- **Deferred until measured:** everything DESIGN defers; passing `model` to the coding agent (trigger: the owner asks Start to pick the model); a form to reorder or rename categories (trigger: the owner edits them by hand often enough to ask); persisted fold state (trigger: the owner asks the view to remember).
- **Complexity removed:** no fold counts; no separate squad object (a planned squad is one bot entry); no copy of Herdr's icons into the pack; no use of the hc parent for membership at any depth; the mockup's `ASKED_BY` and label-note patches stay out.

## Dependencies

**depends-on:** none
**blocks:** none

## Success Criteria

DESIGN.md C1–C10 stand, with C4–C7 widened by the additions. Proofs are DESIGN's unless written here.

- [ ] C1. Create writes a bot (name, character and colour, role with instructions, coding agent, optional model, category, lead, planned) to the project's `.herdr/bots.json`; a teammate's clone shows the same rows, and a pulled edit shows without reload (DESIGN C1 proof).
- [ ] C2. A defined bot that is not running shows, marked not running, never missing; once per project across worktree spaces (DESIGN C2 proof).
- [ ] C3. Start opens a pane running the bot's agent, with the parent rule of A1; Attach labels a running pane without restarting it (DESIGN C3 proof, plus: a member whose `lead` is a live captain shows the captain's terminal as its `parent` in `hc get --json`).
- [ ] C4. Anything a bot starts appears under it when unfolded and disappears when its work ends, with no name or character. **Proof:** a bot runs a short `hc run` helper; with the bot unfolded, a `herdr-app` screenshot shows the helper row; with it folded, the row shows no count or other mark; after the helper finishes, unfolding shows no helper row.
- [ ] C5. DESIGN C5 as written, and also for a lead: running `briefing.mjs` with a captain's `HC_TERMINAL_ID` prints its own entry, then each of its members' status and latest report; a captain's member stuck under the live captain types herdr-core's note into the captain's pane.
- [ ] C6. DESIGN C6 as written, with "main bot" read as the member's `lead`: a captain's member prints the captain as parent and report address; after the captain restarts in a new terminal, the new address.
- [ ] C7. The sidebar matches the approved mockup's structure and DESIGN C7's poses. **Proof:** DESIGN C7's proof as written (restart nesting, a member started while the main bot is down, a member under the live main bot drawn once and not counted as a helper, one row per bot across worktree spaces), plus `herdr-app` screenshots on this host with a test project defining a main bot, two categories, a captain with two members, one uncategorised member and one planned bot show: the main bot as the root card; categories in file order with title and sub; the captain under its category with its members nested under it; the planned bot dimmed, dashed, asleep, with its note and `Wave <n>`; each row with name in ink, `role · model`, the agent's Herdr icon and status mark; with the pointer away, no fold arrow anywhere; hovering a captain row shows its arrow; default view has categories open and the captain folded; bots in each of the six statuses show DESIGN Decision 7's poses; a bot waiting on input is visible with every pane closed.
- [ ] C8. Today's orchestrator conversation is attached as its project's first main bot without restart (DESIGN C8 proof).
- [ ] C9. The pack installs by copying, docks on the left, and carries its four licence files (DESIGN C9 proof).
- [ ] C10. The Automagik theme is on after first load in both appearances and listed in Settings (DESIGN C10 proof).

## Execution Strategy

DESIGN's group 1 is split in two (Groups 1 and 2 here) to keep each group inside the admission band (≤ 25 files, ≤ 2,000 insertions). Group 1 carries the copied lines (byte copy ~732, two Apache-2.0 licences ~402, layout ~183, about 1,317 before new code), so the Create form moves to Group 2 with Start and Attach. DESIGN groups 2, 3, 4 are Groups 3, 4, 5 here.

### Wave 1 (sequential)

| Group | Agent | Complexity | Model | Description |
|-------|-------|------------|-------|-------------|
| 1 | engineer | Medium: first commit must be a byte copy; project-key rule and schema are the base every later group reads | inherit | Pack skeleton, definitions file, project key, discovery |

### Wave 2 (sequential)

| Group | Agent | Complexity | Model | Description |
|-------|-------|------------|-------|-------------|
| 2 | engineer | High: hc parent rules, label uniqueness, attach folder check, a live attach of the running orchestrator, a 12-field form | inherit | Create/Edit form, entry points, Start, Attach, and attaching today's orchestrator |

### Wave 3 (parallel, disjoint files)

| Group | Agent | Complexity | Model | Description |
|-------|-------|------------|-------|-------------|
| 3 | engineer | High: largest visual change; `image()`, hover and focus are unproven on this host until its first task | inherit | The bot view to mockup v9, characters, licences |
| 4 | engineer | Medium: hook merge into per-person settings, mid-session hook pickup unproven | inherit | The Claude per-turn briefing |

### Wave 4 (sequential)

| Group | Agent | Complexity | Model | Description |
|-------|-------|------------|-------|-------------|
| 5 | engineer | Low: two theme files and a one-time selection; share files need the finished view | inherit | Automagik theme and share files |

**Global constraints:**
- No change to Herdr, herdr-core or Automagik; the pack adds files, never a service (DESIGN Approach).
- Install is copy-only: `cp -R mods/spaces-agents ~/.config/herdr-app/mods/` (DESIGN C9).
- The first commit of `mods/spaces-agents/` is a byte copy of `~/.config/herdr-app/mods/spaces-agents/` without `sidebar-agents.json`, `gpui-kit.d.ts` and `jsconfig.json`; every later change shows as a diff (DESIGN item 1).
- Never write inside a mod folder at run time (a write there reloads the mod); generated SVGs go under the app home outside `mods/` (DESIGN Decision 8).
- Pure logic (project key, definitions parsing and validation, tree building over plain data, colour resolution, briefing text) lives in modules that do not import `herdr`, `gpui-kit` or `gpui-base`, and is tested with `node --test 'test/*.test.mjs'` (Node ≥ 24, already on this host). Screenshots and `hc get` are acceptance evidence, not the validation command.
- Every `.js`/`.mjs` file in `mods/spaces-agents/` passes `node --check`.
- Bot label key `bot`; `.herdr/bots.json` `"version": 1`; the schema in Group 1's Interfaces is the only shape any group reads or writes (A9).
- Membership comes only from `.herdr/bots.json` by id, at every depth; the hc parent serves only the typed notes (DESIGN Decision 5, A1).
- Code written here is Apache-2.0 (DESIGN Decision 14).
- PRs target `dev`, never `main` (host rule: `gh pr create --base dev`).

## Execution Groups

### Group 1: Pack skeleton and definitions

**Goal:** The owner's sidebar clone lives in this repository as the pack, reads his rename map from the app home, and reads, validates, discovers and writes the projects' `.herdr/bots.json` files (with lead, category, planned, model), keyed by DESIGN Decision 15.

**Deliverables:**
1. First commit: byte copy of the clone's `main.js`, `argv.js`, `paste.js`, `clipboard-png.jxa`, `mod.json` into `mods/spaces-agents/`; second commit onward: `mod.json` `place` → `left`, the rename map read from `${appHome()}/sidebar-agents.json` on every load and on the existing 15-second data timer (absent file = empty map), as DESIGN item 1 and Approach "Group 1".
2. `layouts/bots.json` (Herdr's shipped `main` layout with `spaces` and `agents` replaced by the pack), `LICENSE` (Apache-2.0) and `mods/spaces-agents/LICENSE` (copy), `README.md` (install, the explicit replace-the-clone step with the rename-map move, the optional layout, `node` for the briefing, herdr-core's `notes` setting, committing `.herdr/bots.json`, hand-editing category order and text).
3. `mods/spaces-agents/bots.js`: project key (Decision 15), discovery (open spaces' folders plus projects remembered with `setShared`, forgotten only on a null read), `watchFolder` on local `.herdr/`, 15-second re-read for remote; read/validate/write `.herdr/bots.json` per the schema below, with A1's `lead` fallback and A9 ids. Pure parts in `mods/spaces-agents/model.js` (no `herdr` import).
4. `test/model.test.mjs`: project key cases (main checkout, worktree, subfolder, non-git with and without an ancestor `.herdr/bots.json`), schema validation, `lead` fallback (missing, planned, cycle), one-main-bot rule, `defaultLook` stable per id.

**Interfaces:**
- Consumes: none.
- Produces (`mods/spaces-agents/model.js`, no Herdr imports):
  - `.herdr/bots.json` holds a `BotsFile`: `type BotsFile = { version: 1, categories: Array<{ id: string, title: string, sub?: string }>, bots: Array<Bot> }`
  - `type Bot = { id: string /* "b-" + 10 base32 */, name: string, kind: "main" | "member", lead?: string /* member only; default the main bot */, category?: string /* used only when the effective lead is the main bot */, look: { character: string, colour: string }, role: string, instructions: string /* ≤ 4000 chars */, agent?: string /* required unless planned */, model?: string, planned?: { wave: number, note?: string } }`
  - `projectKeyOf(folder: string, git: (args: string[], cwd: string) => Promise<string | null>, exists: (path: string) => Promise<boolean>): Promise<string>` — DESIGN Decision 15.
  - `parseBots(text: string): { file: BotsFile, warnings: string[], raw: object }` (`raw` is a separate copy of the file as read, including entries `file` leaves out; callers edit `raw` for a write-back); `effectiveLead(file: BotsFile, botId: string): { lead: string, warning?: string }`; `newBotId(): string`; `defaultLook(botId: string): { character: string, colour: string }` (a hash of the id, mirroring Automagik's `lookOf()`, DESIGN Decision 7); `BOT_LABEL = "bot"`; `MAX_INSTRUCTIONS = 4000`.
- Produces (`mods/spaces-agents/bots.js`): `discoverProjects(): Promise<Array<{ key: string, machine?: string, file: BotsFile }>>`, `writeBots(projectKey: string, file: BotsFile, expected: string | null): Promise<void>` (`expected` required: the text the caller read, `null` for a new file; a stale snapshot rejects; the whole raw file must pass `checkBots`, else it rejects naming why); also `keyOf`, `watchProject`, `checkBots`, `mainBotOf`. A discovered project may carry no bots and only `warnings` (a file that failed to parse), so later groups must handle a project with no main bot, `rememberProject(key: string): void`.

**Acceptance Criteria:**
- [ ] `git log --reverse -- mods/spaces-agents` shows a first commit whose files are byte-identical to the clone's (`cmp` each), with no `sidebar-agents.json`, `gpui-kit.d.ts` or `jsconfig.json`.
- [ ] With the pack copied into `~/.config/herdr-app/mods/` (old clone moved out per README), `herdr-app status` shows it loaded with no error, and an edit to `${appHome()}/sidebar-agents.json` shows within 15 seconds.
- [ ] `test/model.test.mjs` proves `projectKeyOf(<worktree of a scratch git project>)` returns its main checkout; inside Herdr (a temporary call from `main.js`, removed before the PR), `writeBots(projectKeyOf(worktree), file)` writes `.herdr/bots.json` in the main checkout only, and `discoverProjects` with that project open as two spaces returns it once.
- [ ] `node --test 'test/*.test.mjs'` passes, covering every case in deliverable 4.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/spaces-agents/*.js; do node --check "$f" || exit 1; done
```

**depends-on:** none

---

### Group 2: Create, entry points, Start, Attach, and today's orchestrator

**Goal:** From Herdr, the owner can create and edit a bot, start it as a new pane or attach it to a running pane on this computer, with the bot label, the A1 parent rule and the attach folder check, and today's orchestrator conversation is attached as its project's first main bot.

**Deliverables:**
0. `mods/spaces-agents/create.js`: a Herdr overlay with Herdr's form controls for name, character and colour (21 characters, default from `defaultLook`, the Omni preset = octopus in `deepseek`), role, instructions (refuses over 4,000 characters, shows the limit), coding agent from `knownAgents()`, optional model, category (existing or new with title and sub), lead (main bot or another non-planned member), planned (wave and note), project folder from `pickFolder()`; the same form edits an existing bot (including clearing `planned`). Create writes only projects on this computer. Entry points per A10 in `main.js`: the footer "New bot" button, the four commands, and "Attach as bot…" on the clone's terminal menu (the bot-row menu lands with the bot rows in Group 3).
1. `mods/spaces-agents/launch.js`: Start (`hc run --bg`, label `bot=<id>`, `herdr.space`/`herdr.tab` adoption labels, name, project folder as cwd, in the space whose folder keys to the project else the shown space, active tab); main bot `--no-parent`; member `--parent <effective lead's live terminal> --outlive-parent` when that lead is live, else `--no-parent`; never `--no-notify`; Start of a live bot focuses its pane; Start not offered for a planned bot. As DESIGN Approach "Group 1" paragraph 2.
2. Attach: `hc label <t> bot=<id>` after removing the label from any other terminal holding it; for a Claude pane, the `.foreground.cwd` check against the project key, refusing with both folders named and nothing written. Start runs the same check on its cwd.
3. Live-bot lookup: a terminal counts as a bot's live pane only while it carries `bot=<id>` and an agent is in the foreground (`terminals()`'s `program.agent`, else `hc get` `foreground`; DESIGN Decision 3); among several, the newest by `created_ms` when two terminals carry one label (read with `hc get` for the duplicates only), with a duplicate warning flag for the view.
4. The orchestrator attach run once, on **brain-orchestrator (`t1bw`, Brain HQ space)**, the conversation running the Brain project (t1m only forwards messages and is not attached): create its main bot in the project of `hc get t1bw --json` `.foreground.cwd` (on 2026-11-01 `/Users/feliperosa/workspace/repos/brain-v3`, its own main checkout), then Attach. First show the refusal against a bot in another project. brain-v3's `dev` is protected: Create writes `.herdr/bots.json` into brain-v3's main checkout as an uncommitted file (Decision 15 reads only there), and it reaches git only through a brain-v3 feature branch and MR, never a direct commit in the main checkout. Runs only after the owner approves live step (c).
5. Pure parts (argument building for `hc run`, the refusal message) in `model.js` or a new `launchArgs.js` without Herdr imports, with tests in `test/launch.test.mjs`.

**Interfaces:**
- Consumes: Group 1's `model.js` (`Bot`, `BotsFile`, `projectKeyOf`, `effectiveLead`, `newBotId`, `defaultLook`, `BOT_LABEL`, `MAX_INSTRUCTIONS`) and `bots.js` (`discoverProjects`, `writeBots`, `rememberProject`).
- Produces (`mods/spaces-agents/launch.js`): `startBot(projectKey: string, botId: string): Promise<{ terminal: string } | { focused: string } | { refused: string }>`, `attachBot(projectKey: string, botId: string, terminal: string): Promise<{ ok: true } | { refused: string }>`, `liveTerminalOf(botId: string): Promise<{ terminal: string, duplicate: boolean } | null>`, and the hook-point `afterBind(bot: Bot, sessionFolder: string, claude?: boolean): Promise<{ written: boolean }>` (a no-op in Group 2; Group 4 fills it; `claude` defaults to `bot.agent === "claude"`).

**Acceptance Criteria:**
- [ ] The footer "New bot" button opens the form; Create on a scratch git project writes a valid `.herdr/bots.json` in its main checkout, creating from a worktree of it writes the same file, and instructions over 4,000 characters are refused in the form; Edit clears `planned`.
- [ ] DESIGN C3's proof, run from `spaces-agents.start` and "Attach as bot…", plus a member whose `lead` is a live captain shows the captain's terminal as `parent` in `hc get --json`.
- [ ] Attaching a Claude pane whose `.foreground.cwd` is outside the bot's project is refused, naming both folders, with no label and no file written (`hc get --json` labels unchanged).
- [ ] DESIGN C8's proof up to the briefing step: refusal first, then the orchestrator's terminal carries `bot=<id>` with its original `created_ms`.
- [ ] `node --test 'test/*.test.mjs'` passes.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/spaces-agents/*.js; do node --check "$f" || exit 1; done
```

**depends-on:** Group 1

---

### Group 3: The bot view to mockup v9, characters and licences

**Goal:** The sidebar draws every discovered project's bot tree as the approved mockup shows it — main bot root card, categories, nested leads, planned rows, poses, agent icon and status mark, hover/focus-only fold arrows, minimal default — with Automagik characters and the pack's licences.

**Deliverables:**
1. **First task, before the roster:** on this host, draw one generated character SVG through `image()`; confirm `terminals()` carries `program.agent`, `status_ms` and herdr-core's `error` status (else read them with `hc get` per bot-labelled terminal on the existing data timers); prove a row whose fold arrow is invisible until `on_hover` or keyboard focus (gpui-kit `on_hover`, `focus_handle`/`track_focus`). Record the results in the PR body.
2. `mods/spaces-agents/characters.js`: Automagik's 21 characters and `INKS` (from `automagik/apps/bots-dsh/src/client/characters.js` and `inks.js`), `color-mix()` stops resolved in JS, six poses; SVGs written under the app home outside `mods/` (Decision 8). Pure, tested.
3. `mods/spaces-agents/rows.js` (pure tree builder, tested) and `main.js` changes: the bot-row menu of A10 (Edit, Start unless planned, Attach to the focused pane), A2 categories, A1 nesting, A3 planned rows, A4 row layout (icon through the clone's `icon()`, status through its `status()`, guide lines), A6 poses, A7 folding and default, A8 placement; bot-labelled terminals placed only by definition, never as an hc child or in a helper list; helpers keep the clone's `parent` tree under their bot; not-running and duplicate marks; one data wake-up per idle bot at its 10-minute mark, no redraw loop.
4. `mods/spaces-agents/LICENSE-automagik`, `LICENSE-herdr` (from `/Applications/Herdr.app/Contents/Resources/LICENSE`), `NOTICE` (Herdr attribution; Automagik's NOTICE incl. its `apps/bots-dsh` line; DS Bot's copyright from `automagik/apps/bots-dsh/NOTICE`); changed files marked as modified (DESIGN item 7, Decision 14).
5. `test/rows.test.mjs` and `test/characters.test.mjs`: the C7 test project as plain data produces the expected tree (order, nesting, planned, uncategorised, helper exclusion of bot-labelled terminals, worktree dedupe); every character × colour × pose yields an SVG with no `color-mix(`.

**Interfaces:**
- Consumes: Group 1's `model.js` and `bots.js`; Group 2's `liveTerminalOf`.
- Produces (`rows.js`, pure): `buildTree(input: { projects: Array<{ key: string, file: BotsFile }>, live: Record<string /* bot id */, { terminal: string, duplicate: boolean, status?: string, status_ms?: number }> /* built from Group 2's liveTerminalOf, so liveness is decided once */, terminals: Array<{ id: string, labels: Record<string,string>, parent?: string, agent?: string, status?: string }> /* for helpers only */, now: number }): Array<ProjectTree>` where `ProjectTree = { key: string, main: BotNode, categories: Array<{ id: string, title: string, sub?: string, bots: BotNode[] }>, uncategorised: BotNode[] }` and `BotNode = { bot: Bot, live: { terminal: string, duplicate: boolean } | null, pose: "working" | "idle" | "needs-you" | "done" | "failed" | "asleep", planned: boolean, members: BotNode[], helpers: Array<{ terminal: string, name?: string, agent?: string, status?: string }>, warning?: string }`. (`characters.js`): `characterSvg(character: string, colour: string, pose: BotNode["pose"]): string`, `inkOf(colour: string): string`.

**Acceptance Criteria:**
- [ ] DESIGN C1's proof (a second Herdr install with the pack, a space on a clone of the project, the same bot row; a pulled edit shows without reload).
- [ ] DESIGN C2 and the widened C4 and C7 in Success Criteria, with `herdr-app` screenshots attached to the PR.
- [ ] Side-by-side of the C7 screenshot and mockup v9 shows the same structure (root card, category headers, nesting, planned row, icon and status mark positions).
- [ ] The pack folder holds `LICENSE`, `LICENSE-herdr`, `LICENSE-automagik`, `NOTICE`.
- [ ] `node --test 'test/*.test.mjs'` passes.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/spaces-agents/*.js; do node --check "$f" || exit 1; done
```

**depends-on:** Group 2

---

### Group 4: The Claude per-turn briefing

**Goal:** Before every turn, a Claude bot receives its own entry, then its team's state (a main bot or lead: each direct member's status and latest report; a member: its lead's state and current address, and its own children), from a fail-open `UserPromptSubmit` hook written per person.

**Deliverables:**
1. `mods/spaces-agents/briefing.mjs`: DESIGN Approach "Group 3" as written, with "main bot" generalised to the bot's effective `lead` (A1): exits silently unless `HC_TERMINAL_ID` carries a `bot` label defined in the project keyed from `$CLAUDE_PROJECT_DIR`; 5-second timeout; fails open; block under 10,000 characters; opens with the bot's name, kind, role and instructions; skips planned bots (A3); helper counts never include bot-labelled terminals. Pure text building in `mods/spaces-agents/briefingText.mjs`.
2. `launch.js` `afterBind`: for a Claude bot, merge the hook entry if absent into the session folder's `.claude/settings.local.json` (`command -v node >/dev/null && node "<appHome>/mods/spaces-agents/briefing.mjs" || true`), after checking with `readTextFile` that the path exists (else tell the owner the README fix); add `**/.claude/settings.local.json` to the file `git rev-parse --git-path info/exclude` names when `git check-ignore` says it is not ignored; warn and continue if that write fails.
3. Build-time checks recorded in the PR: whether a running session picks up a hook written mid-session (else the attach flow tells the owner to open `/hooks` once, and the README says so); whether herdr-core types a note on `done` with the host's config.
4. `test/briefing.test.mjs`: main bot, captain and member blocks from fixture data; cap respected; planned skipped; silent exit cases.

**Interfaces:**
- Consumes: Group 1's `model.js` (`parseBots`, `effectiveLead`, `projectKeyOf`); Group 2's `afterBind` hook-point in `launch.js`.
- Produces (`briefingText.mjs`): `briefingText(input: { self: Bot, file: BotsFile, members: Array<{ bot: Bot, status?: string, report?: string }>, lead?: { bot: Bot, terminal: string, status?: string }, helpers: Array<{ status?: string }> }): string` (pure, ≤ 10,000 chars).

**Acceptance Criteria:**
- [ ] DESIGN C5 and C6 proofs, widened for a captain as in Success Criteria C5 and C6.
- [ ] DESIGN C8's briefing step: the attached orchestrator's next prompt receives a briefing with no restart, or after the documented `/hooks` step.
- [ ] `git status` in the bot's project shows no `.claude/settings.local.json` after Start or Attach.
- [ ] `node --test 'test/*.test.mjs'` passes.

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/spaces-agents/*.js mods/spaces-agents/*.mjs; do node --check "$f" || exit 1; done
```

**depends-on:** Group 2

---

### Group 5: Automagik theme and share files

**Goal:** Herdr shows the Automagik colours after the pack's first load without the owner picking them, and the pack carries Herdr's share files.

**Deliverables:**
1. `mods/spaces-agents/themes/automagik-light.json` and `automagik-dark.json` from Automagik's `STAGE_LIGHT`/`STAGE_DARK` and named colours; `mods/spaces-agents/theme.js` writes them to the app home's `themes/` if absent, runs `app.theme` once for both halves, records it with `setShared`, never selects again (DESIGN Approach "Group 4", Decision 12).
2. `mods/spaces-agents/RECIPE.md` written from the real files and `mods/spaces-agents/preview.png` (a `herdr-app` screenshot of the finished bot view); README delivery step: the `herdr-mod` topic on the public repository, and that both files are inert in an installed copy.

**Interfaces:**
- Consumes: Group 1's skeleton; Group 3's finished view (for the screenshot); Group 4's `briefing.mjs` and README section (for `RECIPE.md` and the README edit).
- Produces: none.

**Acceptance Criteria:**
- [ ] DESIGN C10's proof.
- [ ] DESIGN C9's proof, end to end on a Herdr with no pack.
- [ ] Choosing another theme after first load survives a Herdr restart (not overridden).

**Validation:**
```bash
node --test 'test/*.test.mjs' && for f in mods/spaces-agents/*.js mods/spaces-agents/*.mjs; do node --check "$f" || exit 1; done && for f in mods/spaces-agents/themes/*.json layouts/*.json; do node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$f" || exit 1; done
```

**depends-on:** Group 3, Group 4

---

## QA Criteria

_What must be verified on dev after merge. The QA agent tests each criterion._

- [ ] Fresh install: on a Herdr with no pack, the README's steps alone bring up the bot view and the Automagik theme (C9, C10).
- [ ] Owner install: replacing the owner's clone per README keeps his rename map working and his `main-agents` layout drawing the pack.
- [ ] End to end: create a main bot, a category, a captain with two members, and a planned bot in a scratch project; Start them; the view matches mockup v9's structure; the captain's member gets stuck and the captain's pane receives herdr-core's note; the main bot's next prompt briefing lists the captain's state.
- [ ] Regression: terminals with no bot label still draw in the clone's existing `parent` tree; spaces, tabs and the rename map behave as before.

---

## Assumptions / Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| DESIGN Risks 1–15 | as rated there | as stated there; each lands in the group that owns its feature |
| gpui-kit hover and keyboard focus on sidebar rows are unproven in a mod on this host (`on_hover` and focus handles are declared in `gpui-kit.d.ts`; the clone uses neither) | Medium | Group 3's first task proves both before the roster. If keyboard focus cannot reach rows, ship hover-only and report it to the owner as an open item, not a silent drop. |
| The additions (A1–A15) change a SHIP-reviewed design without a new design review | Medium | Each is recorded with its source and the design item it replaces; DESIGN.md stays untouched so its digest still verifies; the plan review of this wish covers them. The owner can veto any one by editing this table before `work`. |
| A3's planned-bot shape (one bot entry with `planned`) is this wish's reading of "planned squads", not the owner's words | Low | Smallest shape that draws the mockup's row; the owner corrects it here before `work` if a squad must be its own object. |
| The remote has no `dev` branch; host rule is `gh pr create --base dev`, never `main` | Medium | The operator creates `dev` from `main` before `work`; this wish does not create branches on the remote. |
| `${appHome()}/icons/` may lack an icon for a bot's agent | Low | Fall back to `shell.svg`; the row still draws. |
| Every live acceptance step acts on the owner's Herdr, terminals or projects: (a) installing the pack over his sidebar clone, (b) starting and labelling test bot panes, (c) attaching brain-orchestrator `t1bw` and writing brain-v3's `.herdr/bots.json` (later its git-excluded `.claude/settings.local.json`) | Medium | Asked of the owner through t1m on 2026-11-01, one yes/no per letter. Until answered, groups ship as code plus unit tests with live steps pending on their cards; no group is marked done with a live criterion unmet. |

---

## Review Results

_The read-only reviewer returns evidence; the invoking orchestrator appends a timestamped block here after plan, execution, and PR reviews._

### Plan review — 2026-11-01

- **Reviewer:** independent read-only Claude Code subagent (claude-opus-5-5), not the author.
- **Round 1: FIX-FIRST.** HIGH: H1 nothing opened Create/Start/Attach; H2 no group owned C1. MEDIUM: M1 Group 1 over 2,000 insertions; M2 C7 proof narrowed silently; M3 Decision 4 contradicted unnamed; M4 icon path bypassed Herdr's tint rule. LOW: L1–L7 (status-mark wording, `BotsFile` undefined, double liveness, Group 4 files, Group 5 depends-on, hash default look, guide lines and planned-row details). All repaired: A10 added, Create moved to Group 2, C1 proof in Group 3, C7 "as written, plus", A1 names Decision 4, A4 via the clone's `icon()`/`status()`, interfaces fixed.
- **Round 2: APPROVED.** All round-1 findings verified resolved; no new contradiction, broken interface or size-band breach (Group 1 ≈ 1,900 insertions, tight; Group 2 ≈ 1,000). Three LOW wording notes repaired after the verdict: Group 1's `writeBots` check reworded, Decision 3's live rule added to `liveTerminalOf`, command → project lookup stated in A10.
- **Verdict on disk:** APPROVED. `genie wish lint` OK.

### Group 1 review — 2026-11-01

- **Branch:** `wish/herdr-bots-g1` (6 commits, bf36909..8cbffda); worker g1-engineer; validation `node --test` 26/26 + `node --check` clean; `herdr-app check` passed on a scratch copy.
- **Size note:** 2,236 insertions, of which ~1,306 are copied files (clone byte copy ~732, two licences 402, layout 172); new code, tests and README ~930.
- **Criteria review, round 1: FIX-FIRST.** HIGH: `bots.js` uses `fs.access`, absent from Herdr's `fs/promises` (readFile, writeFile, readdir, exists, unlink, rmdir, mkdir), so the non-git key rule and local `watchFolder` are dead inside Herdr; tests miss it because they load Node's `fs`. MEDIUM: `fs.mkdir` of `<project>/.herdr` may be refused (Herdr fs writes only under its app home). LOW: first-read parse failure vanishes silently; remote key cached across an outage; README change notice omits `mod.json`; no remote-space `on` test; remote empty-folder space skipped. Passed: byte copy (cmp), interfaces, `defaultLook` = Automagik `lookOf` on 3,000 ids, Decision 15 (plus `--show-toplevel` fallback for non-`.git` common dirs), discovery forget rule, rename map, README items, layout, LICENSE, scope.
- **Quality pass, round 1: FIX-FIRST.** MEDIUM: a rejected git call cached as "not git" for 60 s; `writeBots` without `expected` re-reads before writing, so the snapshot guard never fires (and `parseBots` drops entries a write-back would delete). LOW: overlapping watchers, out-of-order refreshes, redraw every tick, rename-map type unchecked. Clean: injection (argv array), prototype pollution, type checks.
- **Route:** all findings sent to g1-engineer as fix loop 1 of 2 (quality loop 1 of 1).
- **Pending live (owner approval asked of t1m):** pack install over the owner's clone, rename-map edit within 15 s, in-Herdr `writeBots`/`discoverProjects` dedupe.
- **Fix loop 1:** 76daf45, d0bf1e4, 1307111. `bots.js` no longer imports `fs/promises` (existence and watch via `readTextFile`; `.herdr/` via `exec mkdir -p` only for a new file); `test/fs-stub.mjs` exposes only Herdr's seven fs functions (the pre-fix `bots.js` fails 4 tests under it); unreachable machine told apart from missing git by an `exec("true", [], {on})` probe, last key reused; `writeBots` `expected` required, write-back via `raw`; one watcher per project by token, stale discovery dropped, redraw only on change, rename map must be an object.
- **Criteria review, round 2: SHIP.** All round-1 findings resolved; signatures coherent; 32/32. LOW notes for Group 2: the Create form must show `writeBots`/`checkBots` "not saved" reasons; the live `writeBots` check should use a project with no `.herdr/` yet.
- **Quality pass, round 2: PASS.** All six findings fixed, nothing broken.
- **Merged into `dev`:** 6a02ba3 (`--no-ff`); on merged `dev` `node --test 'test/*.test.mjs'` 32/32 pass, `node --check` clean.
- **Card:** stays open until the three live in-Herdr checks run (owner approval pending); code dependency for Group 2 is met.
- **Live checks (owner approved 2026-11-01), all PASS:**
  1. Install per README over the owner's clone (backup `~/herdr-mods-backup/spaces-agents-20261101-122719`, rename map moved to the app home): `herdr-app status` `"errors": []`.
  2. Rename-map edit: a temporary entry for live terminal `g10/t8` showed `ZZ-live-check` in the cropped sidebar shot 15.13 s after the write; map restored (`cmp` identical, 263 B).
  3. In-Herdr `writeBots(keyOf(<worktree>), …, null)` on a scratch repo with no `.herdr/`: `live/proj/.herdr/bots.json` created via `mkdir -p`, nothing in the worktree; `discoverProjects` returned the project once with both space ids. Installed `main.js` restored (`cmp`), result file removed, scratch spaces closed, status errors `[]`.
  - Side note (clone behaviour, not Group 1's): the rename map applies only to live non-agent terminals whose `command(argv)` is `hermes`; a `space.new` argv wrapped as `/bin/zsh -lic` reads as `zsh`. Two stale map entries (`g10/t2`, `g10/t3`) point at terminals that no longer exist.
- **Group 1: done.**

### Group 2 review — 2026-11-01

- **Branch:** `wish/herdr-bots-g2` from edf59b1, 7 commits to e4a3a8c (+ `saucer` fix for Group 1's 20-of-21 characters, Start/Attach, Create/Edit form, entry points, README brain-v3 note, a Bots list); worker g1-engineer; `node --test` 52/52, `node --check` clean, `herdr-app check` passed on a scratch copy.
- **A10 as built (accepted by the criteria reviewer):** the clone has no terminal menu, so "Attach as bot…" is on a sidebar agent row's right-click; mod commands receive no arguments, so bare `edit`/`start`/`attach` act on the focused pane's `bot` label, plus a `refresh` command; the window footer belongs to `workspace-chrome`, so "New bot" sits at the foot of the pack's block; right-click "New bot" opens a Bots list (Edit, Start) so a bot with no pane can be reached before Group 3's row menu; `terminals()` rows carry labels, so no `hc ls --label`.
- **Criteria review, round 1: SHIP** (LOW: bare start/edit with no bot only warns; dialog `init` should prefer `props()`; Bots list overlaps Group 3's row menu; half-failed attach message; lead picker offers own descendants).
- **Quality pass, round 1: FIX-FIRST.** MEDIUM: two concurrent Starts of one bot can launch two agents with one label. LOW: half-failed attach message; Attach steals another bot's pane silently; `liveTerminalOf` counts remote holders Attach can't clear; a throw ends the command loop; Edit rebuilds `planned` dropping extra keys. Clean: argv-only `hc` calls with `--` before agent argv, name slugs strip dashes, write path with snapshot.
- **Route:** fix loop 1 of 2 (quality loop 1 of 1) to g1-engineer, all findings except the Bots-list overlap, which Group 3 folds into the bot-row menu.
- **Fix loop 1:** 9f8b75a, 9b56d6c: `starting` set plus a 60 s memory of the just-started pane; half-failed attach message; Attach refuses another bot's pane; `liveTerminalOf` local-only; command loop survives a throw; bare start/edit opens the Bots list; `props() ?? given`; `plannedOf` keeps extra keys; lead choices exclude self and descendants (`descendantsOf`).
- **Criteria review, round 2: SHIP** (58/58). Note for Group 3: `liveTerminalOf` is local-only by design for Start/Attach; the sidebar rows need their own lookup that also counts remote live bots.
- **Quality pass, round 2: PASS.** LOW left: a pane not yet listed in `terminals()` within the 60 s window can still let a twin start (reported as a duplicate if it happens); `agent.focus` on a pane whose agent is not up may not switch.
- **Merged into `dev`:** 6727fa5; on merged `dev` `node --test` 58/58, `node --check` clean.
- **Card:** open until live steps A–E (scratch Create/Start/Attach, refusals, attach brain-orchestrator `t1bw`, brain-v3 MR) run.
- **Live run, 2026-11-01 (halted):** pack reinstalled from `dev` (status errors `[]`); step A done; B1 Lead and B2 Captain + Dev saved through the form. Halted at the owner's instruction ("someone is using /cua-driver the wrong way, it needs to be background"): the live agent had used foreground cua-driver delivery, and Group 3's spike overlay contended for the same window. Remaining: B3 Studio and Edit, C, D, E. Rule from here: background-only GUI driving, one agent at a time on the owner's window.

### Group 4 review — 2026-11-01

- **Branch:** `wish/herdr-bots-g4` from 5bf3b61: 7b29d57, 6abfc64, fix 07fd527; worker g4-engineer; `node --test` 84/84, `node --check` clean, `herdr-app check` passed on a scratch copy; `briefing.mjs` silent (exit 0, no output) with no `HC_TERMINAL_ID`, a non-bot pane, and the worker's own pane, using the real `hc`.
- **Criteria review, round 1: SHIP.** Worker rulings accepted: hook written before `hc run`; hook timeout 10; an entry naming another `briefing.mjs` path updated in place; a lead with no live pane points to `hc ls --label`; helper line for main bots and leads; briefing pane lookup not local-only. Hermetic tests (`GIT_CONFIG_GLOBAL=/dev/null`) really isolate the exclude path, which this host's global ignore would otherwise hide.
- **Quality pass, round 1: FIX-FIRST.** MEDIUM: other agents' reports unfenced in the block (injection); one away machine slowed every prompt by ~4.5 s. LOW: process burst per prompt; silent failures; tracked `settings.local.json`; exclude write race. Clean: hook-path quoting under `sh -c`, settings merge, output caps.
- **Fix loop 1:** 07fd527: each report in its own `<untrusted-report>` with `<`/`>` neutralised under a data-not-instructions line; 1.5 s per call, 2 s budget, 2.4 s guard, "unreachable" on timeout; one `hc ls` for helpers; one stderr line on error; tracked settings file warns; exclude race re-read and retry.
- **Round 2:** criteria SHIP, quality PASS. LOW left: a hard cut can end inside an open `<untrusted-report>`; on a slow host a local pane can read as "unreachable".
- **Merged into `dev`:** see the merge commit after 5bf3b61; validation on merged `dev` green.
- **Card:** open for live checks (mid-session hook pickup on `t1bw`, C5/C6 runs, herdr-core note on `done`, `git status` after Start/Attach).

### Group 3 review — 2026-11-01 (round 1)

- **Branch:** `wish/herdr-bots-g3` from 5bf3b61, 7 commits to 4c1c3a1; worker g3-engineer (stopped after the GUI halt); `node --test` 76/76.
- **Spike (deliverable 1), via a temporary `hb-spike-g3` dialog mod, since removed:** `image()` draws an SVG written at run time only by a path relative to the app home (absolute paths draw nothing, no error); `terminals()` rows carry `status_ms`, `program.agent`, `created_ms`, `foreground` and herdr-core's `error`; fold arrow on keyboard focus shown by screenshot, hover by the clone's `on_hover` pattern. Its overlay contended with the Group 2 live run (see the GUI halt above).
- **Criteria review: FIX-FIRST.** MEDIUM: `track_focus`/`tab_index` on each bot tree lets a click in the sidebar take keyboard focus from the terminal (shipped mods use `track_focus` only on overlays). LOW: liveness via `rows.js` `liveFrom` (counts remote, per the Group 2 note); a project under a folded machine header is not drawn; `error` shows the "Needs you" mark with the failed pose. Passed: 21 characters and 19 inks match Automagik; 0 of 4,788 SVGs contain `color-mix(`; poses; folding (A7); helpers exclude bot-labelled terminals; worktree dedupe; A1–A4, A8, A10 row menu; licences byte copies and NOTICE.
- **Quality pass: PASS.** LOW: a colour named like `__proto__` blanks a picture; a failed picture write is never retried; keyboard handles keyed by list position.
- **Route:** fix after Group 6, together with the detected model in rows (A12) and CLI-created projects showing in the sidebar.

### Group 6 review — owner decisions A11/A12 — 2026-11-01

- **Branch:** `wish/herdr-bots-g6` from 9a48489: f971244, d7bcab6, fixes 8c01b8a, b9857da, 865432d; worker g6-engineer; `node --test` 126/126; `node --check` clean incl. `bin/`; read-only real-host runs: `herdr-bots ls --all --json` wrote nothing; `detectModel` on `t1bw` foreground argv → `claude-opus-5-5`.
- **Round 1: criteria FIX-FIRST** (HIGH sidebar Start ignored a pinned model; MEDIUM hidden pane without `--space`, live bot showing its pin, unchecked legacy model at start) **and quality FIX-FIRST** (HIGH `rm` deleted the whole `bots.json`, other bots included, when the file had no main bot, reproduced; MEDIUM failed `hc` read as "no pane", unbounded processes, triplicated logic).
- **Fix loop 1:** `rm` deletes only an empty list, else `checkBots`; launch.js and CLI pass a listed pin via `modelArgs`; placement from a live local terminal's `herdr.space`/`herdr.tab`, else a stderr warning; running bot shows detected else default; failed `hc` is an error; global cap of 8 processes; live rule, report tail and hook install shared (`launchArgs.js`, `briefingText.mjs`, `briefing.mjs` `gatherBriefing`); `detach` by bare id.
- **Round 2: criteria SHIP, quality PASS.** LOW left: the 60 s twin-start guard misses a pane still in its `sh -c` wrapper; CLI start dropped the always-passing folder check; `--tab` without `--space` ignored; placement can pick another space whose terminal works in the project; one unreachable remote holder marks a bot "hc unavailable".
- **Merged into `dev`:** a4ff066; on merged `dev` 126/126, `node --check` clean.
- **Form mockup (A13): approved by the owner 2026-11-01** ("approved, build the form like the mockup"): https://claude.ai/artifact/BjhApoVpvzHzXZER2uJ6Ch, version 2; source kept at `mockup/create-form.dc.html` (its `/_blob/` image urls resolve only inside the artifact; characters come from `characters.js`).

---

## Files to Create/Modify

```
# Group 1
mods/spaces-agents/main.js            (byte copy, then modified)
mods/spaces-agents/mod.json           (copy, then place: left)
mods/spaces-agents/argv.js            (copy)
mods/spaces-agents/paste.js           (copy)
mods/spaces-agents/clipboard-png.jxa  (copy)
mods/spaces-agents/model.js           (new, pure)
mods/spaces-agents/bots.js            (new)
mods/spaces-agents/LICENSE            (new, copy of LICENSE)
layouts/bots.json                     (new)
LICENSE                               (new, Apache-2.0)
README.md                             (new)
test/model.test.mjs                   (new)
# Group 2
mods/spaces-agents/create.js          (new)
mods/spaces-agents/main.js            (modified: A10 entry points)
mods/spaces-agents/launch.js          (new)
mods/spaces-agents/launchArgs.js      (new, pure; or inside model.js)
test/launch.test.mjs                  (new)
# Group 3
mods/spaces-agents/characters.js      (new, derived from Automagik / DS Bot)
mods/spaces-agents/rows.js            (new, pure)
mods/spaces-agents/main.js            (modified)
mods/spaces-agents/LICENSE-automagik  (new)
mods/spaces-agents/LICENSE-herdr      (new)
mods/spaces-agents/NOTICE             (new)
test/rows.test.mjs                    (new)
test/characters.test.mjs              (new)
# Group 4
mods/spaces-agents/briefing.mjs       (new)
mods/spaces-agents/briefingText.mjs   (new, pure)
mods/spaces-agents/launch.js          (modified: afterBind)
README.md                             (modified: /hooks fallback)
test/briefing.test.mjs                (new)
# Group 5
mods/spaces-agents/theme.js           (new)
mods/spaces-agents/themes/automagik-light.json (new)
mods/spaces-agents/themes/automagik-dark.json  (new)
mods/spaces-agents/RECIPE.md          (new)
mods/spaces-agents/preview.png        (new)
README.md                             (modified)
# Reference only, not pack code
mockup/gen-sidebar.mjs                (visual spec generator for artifact v9)

# Written at run time, outside this repository
<project>/.herdr/bots.json
<session folder>/.claude/settings.local.json
<git dir>/info/exclude
${appHome()}/sidebar-agents.json, ${appHome()}/themes/automagik-*.json, generated character SVGs under ${appHome()}
```
