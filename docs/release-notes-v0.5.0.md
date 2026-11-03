# Release notes v0.5.0: must say

Group 8 publishes these notes with the release. Each entry below is something the notes must say. Wording can change; the facts must stay.

## The briefing hook after the upgrade (Group 7)

v0.5.0 renames the sidebar's folder from `spaces-agents` to `am-sidebar`. The installer then moves every briefing hook it knows about to a fixed entry point, `<app home>/automagik-herdr/briefing.mjs`, and lists each settings file it rewrote at the end of its run. There is no shim at the old path (D12), so:

- **Running Claude sessions keep the old hook and get no briefing.** A session that was already running in one of the listed projects still holds the old hook, which points into the renamed folder. Until the session is restarted, or `/hooks` is run in it once, it gets no briefing.
- **Projects the pack doesn't know about are not rewritten.** The installer only rewrites projects it knows:
  - the sidebar's remembered projects;
  - the CLI's project list;
  - folders in the workers ledger;
  - the open spaces and bot panes of the default app home.

  Any other project keeps the old hook and gets no briefing. To fix one, run `automagik-herdr start <bot>` or `automagik-herdr attach <bot>` (either writes the new hook), or open the project as a space in Herdr and run the installer again.

`automagik-herdr update --rollback` moves the hooks back to the older release's path and prints the same kind of list. A session that is already running keeps the hook it loaded until it is restarted, or until `/hooks` is run in it.
