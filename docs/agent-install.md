Install Automagik Herdr on this Mac and set up my first bot.

1. Run: curl -fsSL https://raw.githubusercontent.com/automagik-dev/automagik-herdr/main/install.sh | bash
   If it stops to ask something (install Node or Herdr), ask me; if I say yes, run it again
   with: ... | bash -s -- --yes. If it stops for anything else, tell me what it printed and stop.
   If the output has a layout.switch command, ask me before running that exact command. If
   it names a layout of mine that lacks pack pieces, tell me which; edit it only if I ask.
2. Verify, don't assume: a version and a checksum don't say what was installed. All must hold:
   automagik-herdr --version prints 0.5.0 or later (0.4.x and older are the sidebar alone);
   sed -n 's/^mods=//p' ~/.config/herdr-app/automagik-herdr/installed-by-install.sh prints
   am-quota,auto-tabs,automations,md-menu,mod-manager,new-menu-tui,sidebar-chrome,spaces-agents;
   herdr-app check ~/.config/herdr-app/mods/<mod> succeeds for each of those eight mods.
   If anything is missing or fails, report the install as incomplete. If automagik-herdr is not
   found, use ~/.local/bin/automagik-herdr and tell me to add ~/.local/bin to my PATH.
3. Ask me for: the project folder, and the main bot's name, character and coding agent
   (claude, codex, gemini…). Characters: whale, octopus, star, moon, wave, squircle, zed,
   hex, gumdrop, peanut, saucer, bunny, kitty, beacon, plus, magnet, acorn, pebbles, cushion,
   ring, gem. If I don't pick a character, use --omni (the octopus); never guess the folder,
   name or agent.
4. In that folder, create and start it:
   automagik-herdr create --kind=main --name=<name> --agent=<agent> --character=<character>
   automagik-herdr start <name>
5. Report back: the installed version and mods, the output of automagik-herdr ls, and what failed.
Do not edit files under ~/.config/herdr-app by hand.
