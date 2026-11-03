# v0.5.0 owner click-through

These are the checks a headless run can't prove: they need a Herdr window. Do them after
installing, on a test machine or your own window. Each step says what you should see. Note any
step that shows something else, with a screenshot.

**Before you start:** run the installer, then switch to the pack layout:

```sh
curl -fsSL https://raw.githubusercontent.com/automagik-dev/automagik-herdr/main/install.sh | bash
herdr-app do layout.switch '{"name":"automagik"}'
```

1. **The layout.** You should see the sidebar on the left, the footer rail under it and the tab
   bar on top. No mod shows an error banner or an empty red block.
2. **The sidebar body.** Your spaces and their bots are listed. There is **no "+ New bot" row**.
3. **The footer's Bots tab** (robot icon, first in the rail). A small menu opens with **New bot**
   and **Bot settings**. Esc closes it. With no bot on this computer, the menu shows only
   **New bot**.
   - **New bot** opens the Create form (about 1000×840).
   - **Bot settings** opens the bot picker (about 560 wide, 85% of the window's height).
4. **The rest of the rail**, in this order after Bots: Mods, Automations, Quota, Settings, Add
   machine. **Pocket Link** shows only if Pocket Link is installed.
   - **Mods** (or `⌘⇧M`) opens the mod table, with all eight `am-*` mods on and checked.
   - **Quota** toggles the quota panel. With no CLIProxyAPI key set up, it says "no management key"
     and shows no token.
   - **Automations** opens the automations panel.
5. **A space's icon.** Click a space row's icon: the icon dialog opens. Set an emoji, then a
   colour, then transparent. Each one shows on the row at once.
6. **The `+` menu** (in the sidebar and in the tab bar) lists Terminal and the agents you have
   installed. The tab bar shows agent-named pills, a ✕ on hover, and middle-click closes a tab.
7. **Markdown.** In a terminal, run `ls *.md` in a folder with Markdown files, then right-click the
   terminal. Those files appear under Herdr's own items. Pick one and a preview pane opens; picking
   another replaces it.
8. **Upgraded machines only (from 0.2–0.4).**
   - Your bots, space icons, colours and the collapsed state look as they did before.
   - `cmd-v` still pastes into a bot pane.
   - Your own layout (e.g. `main-agents`) still shows the sidebar and footer.
9. **The briefing.** Restart one Claude bot (`automagik-herdr restart <bot>`, or the bot row's
   Restart), then send it a prompt.
   The briefing block arrives with the prompt. A session that was running during the upgrade and
   was not restarted gets no briefing: that is expected.
10. **usagemeter.** About 30 s after Herdr loads, `usagemeter` has run once. Check the meter's own
    output or store for a fresh sync. No LaunchAgent was added: `ls ~/Library/LaunchAgents` shows
    no usagemeter entry.
11. **Rollback (optional, on a test machine).** Run `automagik-herdr update --rollback` and reload
    mods. The previous sidebar comes back, and so do your old layout and keys. Rerun the installer
    to return to 0.5.0.
