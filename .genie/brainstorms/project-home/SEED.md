# Brainstorm seed: project home, project identity, opinionated foldering

Status: inputs gathered 2026-11-02. The brainstorm with the owner has not started yet.

## Owner decisions so far (2026-11-02)
- **Opinionated but friendly.** Our users aren't technical, so they shouldn't have to think about folders. Respect what already exists (Claude's `.claude/worktrees`, Codex defaults), and offer to import it into our standard. Migration is a detailed prompt that is precise about never losing data, terminal sessions included.
- **Projects folder.** The default is `~/workspace/<project>`. Anyone can override it. No brand name in the folder. The owner keeps `~/workspace/repos` for coding.
- **Storage.** Follow Mac App Store and Linux (XDG) good practice for app data.
- **Bot home (D5, settled with t259).** `~/.automagik/bots` on every platform. The App Store sandbox will be solved when that build exists (the user picks a folder once). D6: Desktop's bot home merges into it.
- **Per-repo bots.** `.herdr/bots.json` moves to `<repo>/.automagik/bots/bots.json` (version 2) plus `pets/`, as agreed with t259. `.herdr/bots.json` stays as a fallback that is read. Note: t16r's handoff says `.automagik/bots.json`; t259's agreed shape is `.automagik/bots/bots.json`.
- **Identity.** One Herdr space = one project. The space id is the project's identity, and the icon and bots hang off it. Today bots are keyed by the git main-checkout folder.
- **Worktrees.** A worktree opened as its own space is the SAME project as its repo; a worktree is a task (a branch).
- **herdr-app.** Design first. After that, the automagik repo (t259) owns herdr-app's Rust code. Keep the same GPUI app, customised through mods.

## Already built that this must fold in
- sidebar-rules D14: a space is always its project's top level. tidy plans `recreate-space` for a space on a missing, sub- or foreign folder.
- tidy's planner (sidebar-rules G2) and the Group 4 `--apply` plan.
- Bot workers (v0.3.x): worktrees in `<project>/.claude/worktrees/<slug>`, with the ledger and labels.
- am-pack G6a/G6b migrations: journalled, backed up, reversible. Reuse them for project moves.
- Today's manual renames (herdr-bots → automagik-herdr, herdr-pocket → automagik-pocket):
  - worktree repair;
  - the Claude project dir copy;
  - the registry update;
  - recreating the space;
  - resuming the session.
  That is the procedure the migration prompt must automate.

## Open questions for the owner
1. When the space id is the identity: what happens if a person opens the same repo in two spaces, or moves the folder?
2. The new-project flow: create from nothing, clone a URL, or adopt an existing folder. Which comes first, and how much does Herdr ask?
3. Where worktrees live under the opinionated layout: keep `.claude/worktrees`, or a neutral `<project>/.worktrees`?
4. The import offer for existing projects: per project or batch, and what it shows before it moves anything.
5. Linux and Mac app data: which XDG dirs hold registry, ledger and caches, and does `~/.config/herdr-app` itself move?
