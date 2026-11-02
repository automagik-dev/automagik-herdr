Install Automagik Herdr on this Mac and set up my first bot.

1. Run: curl -fsSL https://raw.githubusercontent.com/automagik-dev/automagik-herdr/main/install.sh | bash
   If it stops to ask something (install Node or Herdr), ask me; if I say yes, run it again
   with: ... | bash -s -- --yes
   If it stops for anything else (not a Mac), tell me what it printed and stop.
   If the output has a layout.switch command, ask me whether to switch, and run that exact
   command only if I say yes.
2. Check the install. Both must succeed:
   automagik-herdr --version
   herdr-app check ~/.config/herdr-app/mods/spaces-agents
   If automagik-herdr is not found, use ~/.local/bin/automagik-herdr and tell me to add
   ~/.local/bin to my PATH.
3. Ask me for: the project folder, and the main bot's name, character and coding agent
   (claude, codex, antigravity…). Characters: whale, octopus, star, moon, wave, squircle, zed,
   hex, gumdrop, peanut, saucer, bunny, kitty, beacon, plus, magnet, acorn, pebbles, cushion,
   ring, gem. If I don't pick a character, use --omni (the octopus); never guess the folder,
   name or agent.
4. In that folder, create and start it:
   automagik-herdr create --kind=main --name=<name> --agent=<agent> --character=<character>
   automagik-herdr start <name>
5. Report back: the installed version, the output of automagik-herdr ls, and anything that failed.
Do not edit files under ~/.config/herdr-app by hand.
