# DRAFT: herdr-bots

## Settled

- **R1-1** (round 2, decision): What must 'permanent bot' mean in the first cut? Today the orchestrator t1m has no name, template or parent; its only continuity is `claude --resume 5a886336…` in its argv. A seat label plus a resume pointer and a registry row gives it a stable identity that outlives any terminal and shows 'seat empty' when it is gone, but nothing reloads memory, respawns it after a lost-terminal recovery or runs schedules. — owner said: "the idea is that the permanent bot is a permanent identity slot, that is attached to any coding agent. besides being any herdr pane, it has hooks injected with everything thats going on in their project all the time, the idea is that me as a human would only have to talk to it to develop a whole project, like im doing to you, every project can have a team of agents, inspired in automagik (we will add direct support to dsh next)" · reopened by R7-2
- **R1-2** (round 2, decision): Who gets a seat? Of 49 live terminals, about 10 are orchestrator-spawned permanent roles (orchestrator, pm, dogfood, integrator, two captains, two devs, two tests), per-MR reviewers and astra-N escalations come and go under reused names, and the rest are helper processes (autopg, fixtures, host-e/t18, t19) and unnamed remote terminals on host-a, host-b, host-c and host-d. — owner said: "i dont know what youre talking about, i will create the bots from scratch. this project kinda got it. Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/Aryan1092raj/Herdr-pets"
- **R1-3** (round 2, decision): May an automated binder write seat labels on terminals that their spawner forgot to label? It would run as a mod (terminals() plus exec('hc label …')) or an hc events follower, apply one rules file (template or exact name → seat) only to terminals with no seat label, and leave any label set at spawn untouched. It is a writer that touches live terminals across machines, so it needs your approval. — owner said: "explain better this is too complex to me" · reopened by R5-4
- **R1-4** (round 2, decision): Should the orchestrator spawn devs and tests with `--parent <captain>` so hc lineage draws the team? Today t3x, t48 and t4h are all children of t1m. Every seat already has die_with_parent=false and keep=true, so a member would not die with its captain, but its notes (notify=true) would reach the captain instead of you at t1m; the team-captain template already says members report to the captain. — owner said: "explain better im confused, this is t1m and other naming i dont know about t3x, ... we do need to take in consideration whose children and parents... main bot > team of bots, each bot in the team spawns their children, which may spawn children maybe" · reopened by R2-3
- **R2-1** (round 3, decision): When you create a bot from scratch, where should the saved bot be kept? A bot would carry a name, a look, a role with instructions, which coding agent it runs on (Claude, Codex, Gemini, Kimi and so on) and its project. Herdr can show a form to create one; this question is only about where the bot lives once it is saved, and who can see it. — owner picked "With the project (Recommended)"
- **R2-2** (round 3, decision): How much of 'everything going on in the project' should the main bot receive automatically in the first version? Every coding agent on this computer (Claude, Codex, Gemini, Kimi) can receive a quiet briefing before each turn that you never see typed, but each one needs its own setup. Nothing today gathers project activity into one place, so the feed itself has to be built. — owner said: "1. + the other memebers of the team get the context of their child + parent, so that no one sees more than they should"
- **R2-3** (round 3, decision): Earlier you answered "explain better im confused, this is t1m and other naming i dont know about t3x, ... we do need to take in consideration whose children and parents... main bot > team of bots, each bot in the team spawns their children, which may spawn children maybe" → this replaces it with one of the choices below. Herdr already supports that tree at any depth: whatever a bot starts sits under it, and its automatic reports go one level up (a helper reports to the team member that started it, a team member to the main bot, the main bot to you). What is left to decide is which levels are bots (permanent, with a name and a look, created by you) and which are temporary helpers. — owner said: "1. and their "helpers" dont have to be a new system, we can improve over regular herdr layered orchestration  (Image attached) [attached image, described by the orchestrator because the workflow cannot see images: a screenshot of today's Herdr desktop sidebar tree: 'orchestrator' (Claude crab icon, red 'Needs you' badge) with nested children drawn with tree connector lines: pm, dogfood → df-install, df-knowledge, df-components, df-serve; t1-cap, t4-cap, t1-dev, t1-test, t4-dev; integrator → its command terminals d1-mac-autopg-registered, launchd161-autopg-short, d1-linux-fixture, d1-linux-autopg-registered; t4-test; two 'sh' shells. Each row has a per-app icon (Codex logo, omp robot, terminal glyph, '>_' shell) and a status ring on the right (hollow idle, spinner working)]" · reopens R1-4
- **R2-4** (round 3, decision): Should the plan drop 'show the orchestrator's current team as bots'? Before you said you would create bots from scratch, the plan included turning the team running this project today (captains, developers, test writers, integrator, PM, dogfood, reviewers, escalations) into bots. With bots created from scratch, that would be a second, separate job. — owner picked "Drop it (Recommended)"
- **R3-1** (round 4, decision): Where should the bot view come from? The tree in your screenshot is drawn by a customised copy of Herdr's sidebar already installed on your computer: it shows spaces and agents in one list, with whatever an agent starts nested under it. The plan currently says the bot view is "adapted from herdr-space-groups", but that mod does something different: it puts spaces into folders and shows agents in a separate list, and it never draws the single nested tree you showed. You said helpers should improve on Herdr's existing layered orchestration rather than be a new system. — owner picked "Improve your sidebar (Recommended)"
- **R3-2** (round 4, decision): You asked that each team member gets only its parent's and its children's context "so that no one sees more than they should". We found that nothing in Herdr stops an agent from looking at another. Any agent on your computer can list, read, message or stop any other agent, including agents on your connected machines. Herdr also takes each agent's word for who it is. How strict should the rule be? — owner said: "its not about limiting, its about automatically injecting context that matter so that they dont have to look in the first place."
- **R3-3** (round 4, decision): The plan still lists "The orchestrator as a permanent bot": the conversation you are using today to run this project would become its first main bot. You also said you will create bots from scratch, and you dropped today's team. Every bot will be attachable to a pane that is already running, so turning this conversation into a bot would be an ordinary attach, not special work. Should the first version still promise it? — owner picked "Attach it as first main bot (Recommended)"
- **R3-4** (round 4, decision): What should a bot look like in the view? Each bot gets a look when you create it, and it shows on the bot's row next to its name and status. — owner said: "use same pet system as automagik, this is going to be an automagik mod, so lets use its assets, i want to slightly make herdr automagiky"
- **R4-1** (round 5, decision): You said "this is going to be an automagik mod". We checked what Automagik can do today: its catalogue and its update channel only carry plugins for Automagik's own app, and nothing in Automagik installs anything into Herdr. Herdr's own way to share a mod is a public GitHub repository tagged herdr-mod that people copy into Herdr's mods folder. Where should the bot mod live, and how should it reach Herdr? — owner picked "This repo, Automagik look (Recommended)"
- **R4-2** (round 5, decision): How much should each bot's pet move on its row? In Automagik a pet plays a short loop of 4 to 8 drawings for each state: idle, working, needs you, failed, done. Herdr's guide for mod makers says not to animate a mod with a timer, because each redraw repaints the whole Herdr window and drains battery, and with up to about 50 rows that cost adds up. Herdr does give mods free built-in motion (gentle bobbing, fading, sliding). Herdr-pets uses that kind of motion. — owner picked "A pose per status (Recommended)"
- **R4-3** (round 5, decision): Which Automagik pets can a bot pick from in the first version? Automagik ships only one ready-made animated pet as files: Genie, about 2.4 MB. Its other 21 characters, among them the octopus, whale, star, kitty and bunny, plus Omni, are drawn by code in any colour, the way Automagik's character picker shows them. This choice depends on the pet-motion question: with poses, every character can be drawn in each bot's own colour with no extra tools; with full animation, each character must be exported once and comes in one fixed colour. — owner picked "All Automagik characters (Recommended)"
- **R4-4** (round 5, decision): You said you want to make Herdr "slightly automagiky". In the first version, how much of Herdr should look like Automagik? — owner picked "Plus Automagik colours"
- **R5-1** (round 6, decision): Are these the checks that prove the first version works? (1) You create a bot in Herdr with a name, an Automagik character and colour, a role with instructions and a coding agent; it is saved with the project, and a teammate who opens the same project sees the same bot. (2) A bot you created that is not running still shows in the sidebar, marked not running, never missing. (3) Starting a bot opens a pane running its coding agent; attaching a bot to a pane that is already running does the same without restarting it. (4) Anything a bot starts appears folded under it with a count and disappears when its work ends; it gets no name or character of its own. (5) Before each turn, a main bot running on Claude quietly learns each team member's status (working, stuck, finished, idle) and latest report, with nothing typed into its pane. (6) Each team member's briefing carries its parent's and its own children's state, so it does not need to look at other agents; nothing stops it from looking. (7) In the sidebar, each bot's row shows its name, its Automagik character in its colour in a pose for its status (working, idle, needs you, done, failed, asleep) with Herdr's gentle built-in motion, and whether it is a main bot, a team member or a helper; a bot that needs you is visible without opening any pane. (8) The conversation running this project today can be attached as its first main bot without restarting it, and shows as that bot from then on. (9) The bot pack installs from this repository by copying it into Herdr's mods folder, with no change to Herdr, its terminal service or Automagik. Genie, which cannot take a bot's colour, is not among the characters; the theme and the pets strip have their own questions. — owner picked "Yes, these nine (Recommended)" · reopened by R7-1
- **R5-2** (round 6, decision): You asked to add the Herdr-pets mod. It draws a strip of small walking pets at the bottom of Herdr, one per running agent, each picked by Herdr-pets from its own small set (Claude and Codex logos, a blob, a cat, a ghost, a robot). Your bots will wear Automagik characters in the sidebar, so without a change the same bot would show one character in the sidebar and a different pet in the strip. What should the strip show? — owner picked "Leave it out"
- **R5-3** (round 6, decision): You chose Automagik colours for Herdr. Herdr lets a pack add colour themes that then appear in Herdr's Settings beside its own. We would build one from Automagik's own look, in its light and dark versions, with the terminal colours taken from Automagik's named colours. When someone installs the bot pack, should Herdr switch to the Automagik colours? — owner picked "Switch on at install (Recommended)"
- **R5-4** (round 6, decision): Earlier you answered "explain better this is too complex to me" → this replaces it with one of the choices below. The early plan had a background helper that would guess which running agents belong to which bot and tag them automatically. Now that you create every bot yourself, and a pane becomes a bot only when you start it as a bot or attach it to one, that helper has little left to do. Should it exist? — owner picked "No automatic tagging (Recommended)" · reopens R1-3
- **R6-1** (round 7, decision): The bot pack will be shared publicly as a herdr-mod repository. Its sidebar code comes from Herdr's shipped `spaces` mod and its characters from Automagik's drawing code, and both are Apache-2.0. Those two licences and a NOTICE naming both projects now ship in the pack, as their licences require. What still needs your choice is the licence for the code we write ourselves: the repository's own LICENSE file. This answer settles only that file. — owner picked "Apache-2.0 (Recommended)"
- **R7-1** (round 8, decision): When a team member finishes or gets stuck, should the main bot hear about it right away, or only before its next turn? The design today starts every team member with no Herdr parent, so the main bot learns about its team only from the quiet briefing before its next turn. Until you or someone else sends it a prompt, it is never woken when a member is done or stuck. R2-3's question had described reports going one level up automatically. Getting them right away means Herdr types a short note into the main bot's pane. That changes check 5 of the bar you approved in R5-1, so picking it reopens R5-1: "Yes, these nine (Recommended)" → "Yes, these nine, with check 5 reading: before each turn, a main bot running on Claude quietly learns each team member's status and latest report through the briefing, and a team member's finish or stuck note is also typed into the main bot's pane as it happens". — owner picked "Right away (Recommended)" · reopens R5-1
- **R7-2** (round 8, decision): Should the first version let you create, start and attach bots in a project on another machine, or only on this computer? Herdr does not block it: remote writes, remote runs and labelling a remote pane all exist today. The cost is a way to pick a remote project folder and, for the briefing, a copy of the briefing script plus node on that machine. Keeping remote bots out narrows your R1-1 answer, so the 'out' option reopens it: "the idea is that the permanent bot is a permanent identity slot, that is attached to any coding agent. besides being any herdr pane, it has hooks injected with everything thats going on in their project all the time, the idea is that me as a human would only have to talk to it to develop a whole project, like im doing to you, every project can have a team of agents, inspired in automagik (we will add direct support to dsh next)" → the same, with "in the first version, bots are created, started and attached in this computer's projects and panes; bots of a project on another machine are shown but not created, started or attached there". — owner picked "Out, shown only (Recommended)" · reopens R1-1

## Asked

_No open questions._

## Size

- **G** · raised by lead · round 1

## Scope ratchet

- ~~Bot view: a Herdr mod pack adapted from herdr-space-groups that shows bots (human name, role, look, status, permanent vs disposable, who reports to whom) instead of raw terminals~~ · added by lead · round 1 · dropped by lead · round 4 · approved by R3-1
- Bot concept and identity: where a bot is defined and how live hc terminals bind to it, inspired by Automagik Bots · added by lead · round 1
- The orchestrator as a permanent bot · added by lead · round 1
- ~~The orchestrator's whole team (captains, devs, test writers, integrator, PM, dogfood, reviewers, escalations) represented as bots~~ · added by lead · round 1 · dropped by lead · round 3 · approved by R2-4
- A humanised view that lets people understand ~50 agents working at once · added by lead · round 1
- Bots are created from scratch by the owner (a definition flow), not derived from today's terminals · added by lead · round 2
- Each project has its own main bot and team of bots, their definitions saved with the project · added by lead · round 3
- A quiet per-turn briefing: the main bot learns its team's status before each turn (Claude first); each team member gets only its parent's and its children's context · added by lead · round 3
- Helpers are not a new system: anything a bot starts is a temporary helper folded under it in Herdr's existing tree · added by lead · round 3
- ~~The Herdr-pets mod added, as the owner asked~~ · added by lead · round 3 · dropped by owner · round 8 · approved by R5-2
- Bot view: improve the sidebar tree Herdr already draws so it shows bots (human name, role, look, status, permanent vs disposable, who reports to whom), with each bot's helpers folded under it with a count · added by lead · round 4
- Each bot's look is an Automagik pet taken from Automagik's own pet assets, animated by the bot's status · added by lead · round 4
- An Automagik colour theme for Herdr, in light and dark, built from Automagik's own look · added by lead · round 5

## Councils

- run round-1 · round 1 · decided P1, P2, P3, P4, P5, P6, P7, P8, P9, P10, P11, P12, P13, P14

## Ledger

```ledger
{
  "settled": [
    {
      "id": "R1-1",
      "kind": "decision",
      "question": "What must 'permanent bot' mean in the first cut? Today the orchestrator t1m has no name, template or parent; its only continuity is `claude --resume 5a886336…` in its argv. A seat label plus a resume pointer and a registry row gives it a stable identity that outlives any terminal and shows 'seat empty' when it is gone, but nothing reloads memory, respawns it after a lost-terminal recovery or runs schedules.",
      "answer": "the idea is that the permanent bot is a permanent identity slot, that is attached to any coding agent. besides being any herdr pane, it has hooks injected with everything thats going on in their project all the time, the idea is that me as a human would only have to talk to it to develop a whole project, like im doing to you, every project can have a team of agents, inspired in automagik (we will add direct support to dsh next)",
      "value": null,
      "provenance": "owner said: \"the idea is that the permanent bot is a permanent identity slot, that is attached to any coding agent. besides being any herdr pane, it has hooks injected with everything thats going on in their project all the time, the idea is that me as a human would only have to talk to it to develop a whole project, like im doing to you, every project can have a team of agents, inspired in automagik (we will add direct support to dsh next)\"",
      "round": 2,
      "reopenedBy": "R7-2"
    },
    {
      "id": "R1-2",
      "kind": "decision",
      "question": "Who gets a seat? Of 49 live terminals, about 10 are orchestrator-spawned permanent roles (orchestrator, pm, dogfood, integrator, two captains, two devs, two tests), per-MR reviewers and astra-N escalations come and go under reused names, and the rest are helper processes (autopg, fixtures, host-e/t18, t19) and unnamed remote terminals on host-a, host-b, host-c and host-d.",
      "answer": "i dont know what youre talking about, i will create the bots from scratch. this project kinda got it. Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/Aryan1092raj/Herdr-pets",
      "value": null,
      "provenance": "owner said: \"i dont know what youre talking about, i will create the bots from scratch. this project kinda got it. Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/Aryan1092raj/Herdr-pets\"",
      "round": 2
    },
    {
      "id": "R1-3",
      "kind": "decision",
      "question": "May an automated binder write seat labels on terminals that their spawner forgot to label? It would run as a mod (terminals() plus exec('hc label …')) or an hc events follower, apply one rules file (template or exact name → seat) only to terminals with no seat label, and leave any label set at spawn untouched. It is a writer that touches live terminals across machines, so it needs your approval.",
      "answer": "explain better this is too complex to me",
      "value": null,
      "provenance": "owner said: \"explain better this is too complex to me\"",
      "round": 2,
      "reopenedBy": "R5-4"
    },
    {
      "id": "R1-4",
      "kind": "decision",
      "question": "Should the orchestrator spawn devs and tests with `--parent <captain>` so hc lineage draws the team? Today t3x, t48 and t4h are all children of t1m. Every seat already has die_with_parent=false and keep=true, so a member would not die with its captain, but its notes (notify=true) would reach the captain instead of you at t1m; the team-captain template already says members report to the captain.",
      "answer": "explain better im confused, this is t1m and other naming i dont know about t3x, ... we do need to take in consideration whose children and parents... main bot > team of bots, each bot in the team spawns their children, which may spawn children maybe",
      "value": null,
      "provenance": "owner said: \"explain better im confused, this is t1m and other naming i dont know about t3x, ... we do need to take in consideration whose children and parents... main bot > team of bots, each bot in the team spawns their children, which may spawn children maybe\"",
      "round": 2,
      "reopenedBy": "R2-3"
    },
    {
      "id": "R2-1",
      "kind": "decision",
      "question": "When you create a bot from scratch, where should the saved bot be kept? A bot would carry a name, a look, a role with instructions, which coding agent it runs on (Claude, Codex, Gemini, Kimi and so on) and its project. Herdr can show a form to create one; this question is only about where the bot lives once it is saved, and who can see it.",
      "answer": "With the project (Recommended)",
      "value": "project-file",
      "provenance": "owner picked \"With the project (Recommended)\"",
      "round": 3
    },
    {
      "id": "R2-2",
      "kind": "decision",
      "question": "How much of 'everything going on in the project' should the main bot receive automatically in the first version? Every coding agent on this computer (Claude, Codex, Gemini, Kimi) can receive a quiet briefing before each turn that you never see typed, but each one needs its own setup. Nothing today gathers project activity into one place, so the feed itself has to be built.",
      "answer": "1. + the other memebers of the team get the context of their child + parent, so that no one sees more than they should",
      "value": null,
      "provenance": "owner said: \"1. + the other memebers of the team get the context of their child + parent, so that no one sees more than they should\"",
      "round": 3
    },
    {
      "id": "R2-3",
      "kind": "decision",
      "question": "Earlier you answered \"explain better im confused, this is t1m and other naming i dont know about t3x, ... we do need to take in consideration whose children and parents... main bot > team of bots, each bot in the team spawns their children, which may spawn children maybe\" → this replaces it with one of the choices below. Herdr already supports that tree at any depth: whatever a bot starts sits under it, and its automatic reports go one level up (a helper reports to the team member that started it, a team member to the main bot, the main bot to you). What is left to decide is which levels are bots (permanent, with a name and a look, created by you) and which are temporary helpers.",
      "answer": "1. and their \"helpers\" dont have to be a new system, we can improve over regular herdr layered orchestration  (Image attached) [attached image, described by the orchestrator because the workflow cannot see images: a screenshot of today's Herdr desktop sidebar tree: 'orchestrator' (Claude crab icon, red 'Needs you' badge) with nested children drawn with tree connector lines: pm, dogfood → df-install, df-knowledge, df-components, df-serve; t1-cap, t4-cap, t1-dev, t1-test, t4-dev; integrator → its command terminals d1-mac-autopg-registered, launchd161-autopg-short, d1-linux-fixture, d1-linux-autopg-registered; t4-test; two 'sh' shells. Each row has a per-app icon (Codex logo, omp robot, terminal glyph, '>_' shell) and a status ring on the right (hollow idle, spinner working)]",
      "value": null,
      "provenance": "owner said: \"1. and their \"helpers\" dont have to be a new system, we can improve over regular herdr layered orchestration  (Image attached) [attached image, described by the orchestrator because the workflow cannot see images: a screenshot of today's Herdr desktop sidebar tree: 'orchestrator' (Claude crab icon, red 'Needs you' badge) with nested children drawn with tree connector lines: pm, dogfood → df-install, df-knowledge, df-components, df-serve; t1-cap, t4-cap, t1-dev, t1-test, t4-dev; integrator → its command terminals d1-mac-autopg-registered, launchd161-autopg-short, d1-linux-fixture, d1-linux-autopg-registered; t4-test; two 'sh' shells. Each row has a per-app icon (Codex logo, omp robot, terminal glyph, '>_' shell) and a status ring on the right (hollow idle, spinner working)]\"",
      "round": 3,
      "reopens": "R1-4"
    },
    {
      "id": "R2-4",
      "kind": "decision",
      "question": "Should the plan drop 'show the orchestrator's current team as bots'? Before you said you would create bots from scratch, the plan included turning the team running this project today (captains, developers, test writers, integrator, PM, dogfood, reviewers, escalations) into bots. With bots created from scratch, that would be a second, separate job.",
      "answer": "Drop it (Recommended)",
      "value": "scope-drop:The orchestrator's whole team (captains, devs, test writers, integrator, PM, dogfood, reviewers, escalations) represented as bots",
      "provenance": "owner picked \"Drop it (Recommended)\"",
      "round": 3
    },
    {
      "id": "R3-1",
      "kind": "decision",
      "question": "Where should the bot view come from? The tree in your screenshot is drawn by a customised copy of Herdr's sidebar already installed on your computer: it shows spaces and agents in one list, with whatever an agent starts nested under it. The plan currently says the bot view is \"adapted from herdr-space-groups\", but that mod does something different: it puts spaces into folders and shows agents in a separate list, and it never draws the single nested tree you showed. You said helpers should improve on Herdr's existing layered orchestration rather than be a new system.",
      "answer": "Improve your sidebar (Recommended)",
      "value": "scope-drop:Bot view: a Herdr mod pack adapted from herdr-space-groups that shows bots (human name, role, look, status, permanent vs disposable, who reports to whom) instead of raw terminals",
      "provenance": "owner picked \"Improve your sidebar (Recommended)\"",
      "round": 4
    },
    {
      "id": "R3-2",
      "kind": "decision",
      "question": "You asked that each team member gets only its parent's and its children's context \"so that no one sees more than they should\". We found that nothing in Herdr stops an agent from looking at another. Any agent on your computer can list, read, message or stop any other agent, including agents on your connected machines. Herdr also takes each agent's word for who it is. How strict should the rule be?",
      "answer": "its not about limiting, its about automatically injecting context that matter so that they dont have to look in the first place.",
      "value": null,
      "provenance": "owner said: \"its not about limiting, its about automatically injecting context that matter so that they dont have to look in the first place.\"",
      "round": 4
    },
    {
      "id": "R3-3",
      "kind": "decision",
      "question": "The plan still lists \"The orchestrator as a permanent bot\": the conversation you are using today to run this project would become its first main bot. You also said you will create bots from scratch, and you dropped today's team. Every bot will be attachable to a pane that is already running, so turning this conversation into a bot would be an ordinary attach, not special work. Should the first version still promise it?",
      "answer": "Attach it as first main bot (Recommended)",
      "value": "keep-orchestrator",
      "provenance": "owner picked \"Attach it as first main bot (Recommended)\"",
      "round": 4
    },
    {
      "id": "R3-4",
      "kind": "decision",
      "question": "What should a bot look like in the view? Each bot gets a look when you create it, and it shows on the bot's row next to its name and status.",
      "answer": "use same pet system as automagik, this is going to be an automagik mod, so lets use its assets, i want to slightly make herdr automagiky",
      "value": null,
      "provenance": "owner said: \"use same pet system as automagik, this is going to be an automagik mod, so lets use its assets, i want to slightly make herdr automagiky\"",
      "round": 4
    },
    {
      "id": "R4-1",
      "kind": "decision",
      "question": "You said \"this is going to be an automagik mod\". We checked what Automagik can do today: its catalogue and its update channel only carry plugins for Automagik's own app, and nothing in Automagik installs anything into Herdr. Herdr's own way to share a mod is a public GitHub repository tagged herdr-mod that people copy into Herdr's mods folder. Where should the bot mod live, and how should it reach Herdr?",
      "answer": "This repo, Automagik look (Recommended)",
      "value": "herdr-bots-repo",
      "provenance": "owner picked \"This repo, Automagik look (Recommended)\"",
      "round": 5
    },
    {
      "id": "R4-2",
      "kind": "decision",
      "question": "How much should each bot's pet move on its row? In Automagik a pet plays a short loop of 4 to 8 drawings for each state: idle, working, needs you, failed, done. Herdr's guide for mod makers says not to animate a mod with a timer, because each redraw repaints the whole Herdr window and drains battery, and with up to about 50 rows that cost adds up. Herdr does give mods free built-in motion (gentle bobbing, fading, sliding). Herdr-pets uses that kind of motion.",
      "answer": "A pose per status (Recommended)",
      "value": "pose-native",
      "provenance": "owner picked \"A pose per status (Recommended)\"",
      "round": 5
    },
    {
      "id": "R4-3",
      "kind": "decision",
      "question": "Which Automagik pets can a bot pick from in the first version? Automagik ships only one ready-made animated pet as files: Genie, about 2.4 MB. Its other 21 characters, among them the octopus, whale, star, kitty and bunny, plus Omni, are drawn by code in any colour, the way Automagik's character picker shows them. This choice depends on the pet-motion question: with poses, every character can be drawn in each bot's own colour with no extra tools; with full animation, each character must be exported once and comes in one fixed colour.",
      "answer": "All Automagik characters (Recommended)",
      "value": "full-roster",
      "provenance": "owner picked \"All Automagik characters (Recommended)\"",
      "round": 5
    },
    {
      "id": "R4-4",
      "kind": "decision",
      "question": "You said you want to make Herdr \"slightly automagiky\". In the first version, how much of Herdr should look like Automagik?",
      "answer": "Plus Automagik colours",
      "value": "plus-theme",
      "provenance": "owner picked \"Plus Automagik colours\"",
      "round": 5
    },
    {
      "id": "R5-1",
      "kind": "decision",
      "question": "Are these the checks that prove the first version works? (1) You create a bot in Herdr with a name, an Automagik character and colour, a role with instructions and a coding agent; it is saved with the project, and a teammate who opens the same project sees the same bot. (2) A bot you created that is not running still shows in the sidebar, marked not running, never missing. (3) Starting a bot opens a pane running its coding agent; attaching a bot to a pane that is already running does the same without restarting it. (4) Anything a bot starts appears folded under it with a count and disappears when its work ends; it gets no name or character of its own. (5) Before each turn, a main bot running on Claude quietly learns each team member's status (working, stuck, finished, idle) and latest report, with nothing typed into its pane. (6) Each team member's briefing carries its parent's and its own children's state, so it does not need to look at other agents; nothing stops it from looking. (7) In the sidebar, each bot's row shows its name, its Automagik character in its colour in a pose for its status (working, idle, needs you, done, failed, asleep) with Herdr's gentle built-in motion, and whether it is a main bot, a team member or a helper; a bot that needs you is visible without opening any pane. (8) The conversation running this project today can be attached as its first main bot without restarting it, and shows as that bot from then on. (9) The bot pack installs from this repository by copying it into Herdr's mods folder, with no change to Herdr, its terminal service or Automagik. Genie, which cannot take a bot's colour, is not among the characters; the theme and the pets strip have their own questions.",
      "answer": "Yes, these nine (Recommended)",
      "value": "accept",
      "provenance": "owner picked \"Yes, these nine (Recommended)\"",
      "round": 6,
      "reopenedBy": "R7-1"
    },
    {
      "id": "R5-2",
      "kind": "decision",
      "question": "You asked to add the Herdr-pets mod. It draws a strip of small walking pets at the bottom of Herdr, one per running agent, each picked by Herdr-pets from its own small set (Claude and Codex logos, a blob, a cat, a ghost, a robot). Your bots will wear Automagik characters in the sidebar, so without a change the same bot would show one character in the sidebar and a different pet in the strip. What should the strip show?",
      "answer": "Leave it out",
      "value": "scope-drop:The Herdr-pets mod added, as the owner asked",
      "provenance": "owner picked \"Leave it out\"",
      "round": 6
    },
    {
      "id": "R5-3",
      "kind": "decision",
      "question": "You chose Automagik colours for Herdr. Herdr lets a pack add colour themes that then appear in Herdr's Settings beside its own. We would build one from Automagik's own look, in its light and dark versions, with the terminal colours taken from Automagik's named colours. When someone installs the bot pack, should Herdr switch to the Automagik colours?",
      "answer": "Switch on at install (Recommended)",
      "value": "theme-on",
      "provenance": "owner picked \"Switch on at install (Recommended)\"",
      "round": 6
    },
    {
      "id": "R5-4",
      "kind": "decision",
      "question": "Earlier you answered \"explain better this is too complex to me\" → this replaces it with one of the choices below. The early plan had a background helper that would guess which running agents belong to which bot and tag them automatically. Now that you create every bot yourself, and a pane becomes a bot only when you start it as a bot or attach it to one, that helper has little left to do. Should it exist?",
      "answer": "No automatic tagging (Recommended)",
      "value": "no-binder",
      "provenance": "owner picked \"No automatic tagging (Recommended)\"",
      "round": 6,
      "reopens": "R1-3"
    },
    {
      "id": "R6-1",
      "kind": "decision",
      "question": "The bot pack will be shared publicly as a herdr-mod repository. Its sidebar code comes from Herdr's shipped `spaces` mod and its characters from Automagik's drawing code, and both are Apache-2.0. Those two licences and a NOTICE naming both projects now ship in the pack, as their licences require. What still needs your choice is the licence for the code we write ourselves: the repository's own LICENSE file. This answer settles only that file.",
      "answer": "Apache-2.0 (Recommended)",
      "value": "apache-2.0",
      "provenance": "owner picked \"Apache-2.0 (Recommended)\"",
      "round": 7
    },
    {
      "id": "R7-1",
      "kind": "decision",
      "question": "When a team member finishes or gets stuck, should the main bot hear about it right away, or only before its next turn? The design today starts every team member with no Herdr parent, so the main bot learns about its team only from the quiet briefing before its next turn. Until you or someone else sends it a prompt, it is never woken when a member is done or stuck. R2-3's question had described reports going one level up automatically. Getting them right away means Herdr types a short note into the main bot's pane. That changes check 5 of the bar you approved in R5-1, so picking it reopens R5-1: \"Yes, these nine (Recommended)\" → \"Yes, these nine, with check 5 reading: before each turn, a main bot running on Claude quietly learns each team member's status and latest report through the briefing, and a team member's finish or stuck note is also typed into the main bot's pane as it happens\".",
      "answer": "Right away (Recommended)",
      "value": "live-and-briefing",
      "provenance": "owner picked \"Right away (Recommended)\"",
      "round": 8,
      "reopens": "R5-1"
    },
    {
      "id": "R7-2",
      "kind": "decision",
      "question": "Should the first version let you create, start and attach bots in a project on another machine, or only on this computer? Herdr does not block it: remote writes, remote runs and labelling a remote pane all exist today. The cost is a way to pick a remote project folder and, for the briefing, a copy of the briefing script plus node on that machine. Keeping remote bots out narrows your R1-1 answer, so the 'out' option reopens it: \"the idea is that the permanent bot is a permanent identity slot, that is attached to any coding agent. besides being any herdr pane, it has hooks injected with everything thats going on in their project all the time, the idea is that me as a human would only have to talk to it to develop a whole project, like im doing to you, every project can have a team of agents, inspired in automagik (we will add direct support to dsh next)\" → the same, with \"in the first version, bots are created, started and attached in this computer's projects and panes; bots of a project on another machine are shown but not created, started or attached there\".",
      "answer": "Out, shown only (Recommended)",
      "value": "remote-out",
      "provenance": "owner picked \"Out, shown only (Recommended)\"",
      "round": 8,
      "reopens": "R1-1"
    }
  ],
  "asked": [],
  "size": [
    {
      "value": "G",
      "by": "lead",
      "round": 1
    }
  ],
  "scopeIn": [
    {
      "item": "Bot view: a Herdr mod pack adapted from herdr-space-groups that shows bots (human name, role, look, status, permanent vs disposable, who reports to whom) instead of raw terminals",
      "by": "lead",
      "round": 1,
      "dropped": {
        "by": "lead",
        "round": 4,
        "approvedBy": "R3-1"
      }
    },
    {
      "item": "Bot concept and identity: where a bot is defined and how live hc terminals bind to it, inspired by Automagik Bots",
      "by": "lead",
      "round": 1
    },
    {
      "item": "The orchestrator as a permanent bot",
      "by": "lead",
      "round": 1
    },
    {
      "item": "The orchestrator's whole team (captains, devs, test writers, integrator, PM, dogfood, reviewers, escalations) represented as bots",
      "by": "lead",
      "round": 1,
      "dropped": {
        "by": "lead",
        "round": 3,
        "approvedBy": "R2-4"
      }
    },
    {
      "item": "A humanised view that lets people understand ~50 agents working at once",
      "by": "lead",
      "round": 1
    },
    {
      "item": "Bots are created from scratch by the owner (a definition flow), not derived from today's terminals",
      "by": "lead",
      "round": 2
    },
    {
      "item": "Each project has its own main bot and team of bots, their definitions saved with the project",
      "by": "lead",
      "round": 3
    },
    {
      "item": "A quiet per-turn briefing: the main bot learns its team's status before each turn (Claude first); each team member gets only its parent's and its children's context",
      "by": "lead",
      "round": 3
    },
    {
      "item": "Helpers are not a new system: anything a bot starts is a temporary helper folded under it in Herdr's existing tree",
      "by": "lead",
      "round": 3
    },
    {
      "item": "The Herdr-pets mod added, as the owner asked",
      "by": "lead",
      "round": 3,
      "dropped": {
        "by": "owner",
        "round": 8,
        "approvedBy": "R5-2"
      }
    },
    {
      "item": "Bot view: improve the sidebar tree Herdr already draws so it shows bots (human name, role, look, status, permanent vs disposable, who reports to whom), with each bot's helpers folded under it with a count",
      "by": "lead",
      "round": 4
    },
    {
      "item": "Each bot's look is an Automagik pet taken from Automagik's own pet assets, animated by the bot's status",
      "by": "lead",
      "round": 4
    },
    {
      "item": "An Automagik colour theme for Herdr, in light and dark, built from Automagik's own look",
      "by": "lead",
      "round": 5
    }
  ],
  "councils": [
    {
      "run": "round-1",
      "round": 1,
      "decided": [
        "P1",
        "P2",
        "P3",
        "P4",
        "P5",
        "P6",
        "P7",
        "P8",
        "P9",
        "P10",
        "P11",
        "P12",
        "P13",
        "P14"
      ]
    }
  ],
  "reviews": [
    {
      "verdict": "FIX-FIRST",
      "digest": "9f1b9a434db1d732d3c12b35285658dece7144093540c49ea652f8f210137ec9",
      "round": 6,
      "repaired": false,
      "findings": [
        "C1",
        "C2",
        "C3",
        "C4",
        "C5",
        "C6",
        "C7",
        "C8",
        "C9",
        "C10",
        "C11",
        "C12",
        "C13",
        "HIGH-1",
        "HIGH-2",
        "MEDIUM-1",
        "MEDIUM-2",
        "MEDIUM-3",
        "MEDIUM-4",
        "MEDIUM-5",
        "LOW-1",
        "LOW-2"
      ]
    },
    {
      "verdict": "FIX-FIRST",
      "digest": "98d5a43eef11a41adab46d521926fb436010be42c41727fa2554280c91cd241e",
      "round": 7,
      "repaired": false,
      "findings": [
        "C1",
        "C2",
        "C3",
        "C4",
        "C5",
        "C6",
        "C7",
        "C8",
        "C9",
        "C10",
        "C11",
        "C12",
        "HIGH-1",
        "MEDIUM-1",
        "MEDIUM-2",
        "MEDIUM-3",
        "MEDIUM-4",
        "MEDIUM-5",
        "MEDIUM-6",
        "LOW-1",
        "LOW-2",
        "LOW-3",
        "LOW-4"
      ]
    },
    {
      "verdict": "FIX-FIRST",
      "digest": "fddbb7f8c7861a14f3f45dd3cd6ea331ece8d73f1103ddc3a8709ed6a3ca163f",
      "round": 8,
      "repaired": false,
      "findings": [
        "C1",
        "C2",
        "C3",
        "C4",
        "C5",
        "C6",
        "C7",
        "C8",
        "C9",
        "C10",
        "C11",
        "C12",
        "C13",
        "C14",
        "HIGH-1",
        "HIGH-2",
        "MEDIUM-1",
        "MEDIUM-2",
        "MEDIUM-3",
        "MEDIUM-4",
        "LOW-1",
        "LOW-2",
        "LOW-3"
      ]
    },
    {
      "verdict": "SHIP",
      "digest": "d5ba9728d00afdf51c7391ca149c3648c4ead502ed6066cdd4b1bb3b7106464b",
      "round": 8,
      "repaired": true,
      "findings": [
        "C1",
        "C2",
        "C3",
        "C4",
        "C5",
        "C6",
        "C7",
        "C8",
        "C9",
        "C10",
        "C11",
        "MEDIUM-1",
        "MEDIUM-2",
        "LOW-1",
        "LOW-2",
        "LOW-3"
      ]
    }
  ]
}
```

## Round 1 lead notes

### What the owner said, and what I assume

Said (owner's words, 2026-10-31): make better visualisations for the teams; read `~/.config/herdr-app/AGENTS.md`; add the mod `suppa-duppa-labs/herdr-space-groups`, but instead of groups create a concept called **bot**, inspired by Automagik (`../automagik`); the orchestrator has the knowledge to turn itself into a **permanent bot** and to create its **whole team** as bots; **humanise** the experience so people understand how 50 agents work at once; run `/council` and `/brainstorm`; the owner wants to **participate**.

Assumed (each load-bearing one is listed under Open as a question, not decided here):
- A1. "Instead of groups" means the bot replaces the folder as the sidebar's organising unit, not that folders disappear entirely.
- A2. The first audience is the owner and teammates watching the brain-v3 fleet in Herdr desktop; other machines' spaces (Sofia, Tactu, Hermes...) stay visible but are not bots unless someone makes them so.
- A3. Work happens in this repo (`herdr-bots`) as a mod pack installed into `~/.config/herdr-app/mods/`, by clone, never by editing shipped mods.
- A4. herdr-core and the Herdr app binary are not changed; only what mods, layouts, hc labels and hc templates can do.
- A5. "Permanent bot" means a stable identity that outlives any one terminal; whether it also means a long-lived runtime (memory, schedules, Automagik-style chat) is not assumed.

### Evidence gathered this round (facts, not decisions)

- `herdr.terminals()` returns every core terminal as `hc ls --json` describes it: `address, argv, name, template, parent, labels, state`, plus `status`, `report`, `program` (herdr.d.ts:209). `agents()` adds `space_name`, `tab_name`, `app`. A mod can therefore read role and lineage without new infrastructure.
- Live snapshot (`hc ls --json`, 2026-10-31, 47 live terminals across this Mac, host-a, host-b, host-c, host-d, host-e):
  - Orchestrator-spawned agents carry both `template` and `parent`: `pm`(pm, parent t1m), `dogfood`(dogfood, t1m), `t1-cap`/`t4-cap`(team-captain, t1m), `t1-dev`/`t4-dev`(dev-sol, t1m), `t1-test`/`t4-test`(test-deepseek, t1m), `integrator`(integrator, t1m), `df-install`/`df-knowledge`/`df-components`/`df-serve`(dogfood-*, parent t34 = dogfood).
  - Captains, devs and test writers are all children of the orchestrator `t1m`, not of their captain: the team relation lives today only in the name prefix (`t1-`, `t4-`) and the space name ("T1 · components-runtime").
  - The orchestrator itself (`t1m`) has no name and no template; it is identified only by its tab ("brain-v3 / orchestrator").
  - `labels` is null on every live terminal; no `herdr.bot`-style label exists yet.
  - Helper processes (`d1-mac-autopg-registered`, `launchd161-autopg-short`, `host-e/t18`, `host-e/t19`) are children of agents with no template: these are the anonymous/fixture entries the owner sees.
- hc templates on disk (`~/.config/herdr-core/templates/`): astra, dev-kimi, dev-sol, dogfood(-components, -install, -knowledge, -serve), integrator, pm, reviewer, reviewer-opus, team-captain, test-deepseek, test-kimi, test-terra. These are the closest thing to Automagik's bot definitions today (role + instructions + model).
- herdr-space-groups (MIT, pushed 2026-10-31): `mods/space-groups/{main,sidebar,menu,groups,dialogs}.js`, `mods/space-groups-agents/main.js`, `RECIPE.md`; state in `shared.json` under `space-groups`. Tested on Herdr 0.1.9; this host runs 0.1.10 (compatibility unverified).
- This host already has a user clone `mods/spaces-agents` (cloned from `spaces` 0.1.7) with its own `sidebar-agents.json` (address → display name + program), i.e. a hand-kept rename map already exists in one place.
- Automagik `apps/bots-dsh`: long-lived Bots with name, role, instructions, model, look (20 characters, 12 colours, or photo), Main Bots, group chats, per-bot/group/team memory, permission presets, scheduled tasks, usage by bot/model, bots that message and create each other (from orchestrator context; not re-read this round).

### Size triage

**G, and it splits.** Three separable pieces, each shippable alone:
1. **Bot view** — a Herdr mod pack (forked from space-groups' sidebar/menu) that shows bots instead of terminals: human name, role, look, status, permanent vs disposable, who reports to whom.
2. **Bot identity** — where a bot is defined and how a live terminal binds to it (registry file, hc label, template fields), and how the orchestrator writes it when it spawns.
3. **Bot behaviours** — the orchestrator as a permanent bot and the Automagik-style runtime features (memory, chat, schedules, bots creating bots).
Piece 2 is the hard-to-reverse decision everything else stands on; it goes to the council this round.

### WRS

| Dimension | Score | Evidence |
|---|---|---|
| Problem | 9/20 | Pain is concrete and observed (anonymous `t4-cap`, `review-118`, `2`/`3` entries; no permanent-vs-disposable signal; team relation only in name prefixes). Not yet settled with the owner what "understand" must mean (which questions a human must be able to answer at a glance). |
| Scope | 4/20 | Owner named five things; nothing in or out is agreed; the split is proposed, not accepted. |
| Decisions | 2/20 | No decision settled. The data model is open and goes to council. |
| Risks | 4/20 | Known: space-groups untested on 0.1.10; shipped mods are read-only (clone); identity that lives in a mod-side map dies when addresses change; registry drift. Not weighed yet. |
| Criteria | 2/20 | No acceptance criteria yet. |
| **Total** | **21/100** | |

### Gap map

- Settled: nothing.
- Open and blocking: **G1 bot data model** (what a bot is; where identity lives; how terminals bind) blocks the view's data source, the orchestrator's spawn changes and every criterion.
- Open, blocked by G1: G2 who gets a bot (permanent seats only vs every terminal; how disposable reviewers/astra-N and helper processes show); G3 team shape (captain-led teams vs today's flat t1m parentage); G4 the orchestrator-as-bot (identity only, or runtime too).
- Open, independent: G5 the look (Automagik's 20 characters/12 colours vs photos: whether gpui-kit renders raster images is unverified); G6 whether folders (space-groups) survive beside bots; G7 which Automagik features are in the first cut.

### Open

- O1. The bot data model (council this round).
- O2. Permanent vs disposable: do per-MR reviewers, astra-N escalations and helper processes become bots, shifts of a bot, or stay plain terminals?
- O3. Team shape: should the view group devs/tests under their captain even though hc parentage points at the orchestrator, and should spawns change to make the captain the parent?
- O4. The orchestrator as a permanent bot: identity and look only, or also persistent memory/instructions it reloads on restart?
- O5. Automagik features not yet in or out, listed so nothing is dropped silently: group chats with @mentions, per-bot/group/team memory, permission presets, scheduled tasks, usage by bot and model, bots messaging and creating bots, ask_user.
- O6. Folders: keep space-groups' manual folders beside bots, or replace them.
- O7. Look: character/colour set vs photos; raster image support in gpui-kit unverified.
- O8. Reach: only the brain-v3 fleet, or every machine's spaces (Sofia, Tactu, Hermes on host-a, host-e, host-c...).
- O9. space-groups compatibility with Herdr 0.1.10 (a fact to verify, not an owner question).

### Assumed

- A1–A5 above, each pending the owner's answers in later rounds. Nothing here is a silent decision.

## Council round-1

Decision at hand: The bot data model: what a 'bot' is in Herdr and how a live hc terminal binds to it. Candidates: (a) a bot is a persistent seat/identity in a registry (e.g. a bots file in this mod pack or shared.json) and terminals bind via an hc label such as herdr.bot=<id> written by the orchestrator/templates at spawn; (b) a bot is derived on the fly from what hc already records (template => role, parent => lineage, name/space => assignment) with only a thin display overlay; (c) a bot is an Automagik-style long-lived agent that owns and spawns its terminals and carries its own instructions, model, look and memory. Evidence is in the DRAFT's 'Evidence gathered this round' section (live hc ls snapshot: template+parent set on orchestrator-spawned agents, labels null everywhere, captains/devs/tests all parented to t1m, orchestrator itself unnamed).
Lenses: legibility, operations, feasibility, automagik, dissent
Reading of Socrates: Two facts in the DRAFT's evidence were wrong, and correcting them is what moved the council. First, "labels is null on every live terminal" is an artifact of `hc ls --json`, whose rows have no labels key at all. `hc get <t> --json` shows labels on 48 of 49 live terminals: Herdr's own `herdr.space`, `herdr.tab` and `where`, and on host-a/t2 and t4 the per-seat `sofia.role`, `sofia.claude_session` and `sofia.codex_thread` written by another system. Shipped mods already read `terminals()[i].labels` (mods/menu/main.js:34, mods/spaces-agents/main.js:161), and the core persists labels in ~/.local/state/herdr-core/default/terminals.json beside keep, last_cwd and program_started_ms. So binding a terminal to an identity through a label is an existing, working, undoable (`key=`) pattern on this fleet, not new infrastructure. Second, "the team relation lives only in the name prefix" is wrong but not fixed by the correction: `hc ls --label herdr.space=<T1 space>` does return the T1 terminals, yet escalate.sh places Astra in the captain's space purely for display, and t3x, t48 and t4h all have parent t1m. The space label is UI placement, not membership, so reports_to still cannot be derived from anything hc records today unless the spawner sets --parent. With those corrected, the three candidates stopped being rivals. Every lens, including the dissent that opened with "oppose", now lands on the same hybrid: a thin (a), the seat id as an hc label on the terminal, as the binding; (b), derivation from template, parent and name, as the honest fallback for anything unbound; and (c) as a layer to grow toward on top of the same label, not the starting model. The live disagreements are narrower than the candidates: whether a separate hand-kept registry file should exist at all (dissent: no; legibility, feasibility, automagik: yes, but only slow owner-set facts for about 8-10 permanent seats), and whether an automated writer may label terminals that spawners forgot (operations proposes it; dissent prefers fewer moving parts). What the label alone cannot show is absence: a permanent seat whose terminal has ended is simply missing from `hc ls`, and "the t4 tester is down" cannot be told apart from "there was never a t4 tester". That one job, plus a stable persona per seat (two dev-sol seats cannot differ by template alone) and the orchestrator's permanence (t1m's identity today is only `claude --resume 5a886336…` in its argv), is what earns the minimal registry its place. Nothing is Settled in the DRAFT yet, so numbering starts at P1.
Consensus: Unanimous after answers, with every lens marking changedMind: the bot data model is a stable seat id carried as an hc label on the terminal (thin (a)), written at `hc run --label` by whoever spawns and retro-bound on live terminals with `hc label`; (b) derivation from template, parent and name is the honest, visibly tagged fallback with coverage always shown; (c) is a later layer that writes the same label. All five lenses agree the DRAFT's 'labels null everywhere' was an artifact of `hc ls --json`, that labels reach mods and persist in terminals.json, that templates cannot carry a label, that `herdr.space` is placement rather than membership, that a live bot needs both the label and an agent in the foreground, that reviewers and Astra are shifts of one seat, that a shift is address plus created_ms, and that history is a retrofit rebuilt from hc's retained finished terminals. Residual disagreement is confined to whether a hand-kept registry file should exist at all, whether an automated binder may write labels, and what 'permanent' must include in the first cut.
- **P1** What a bot's identity is and what key carries it.: A bot is a stable seat id. A live terminal binds to it through an hc label on the terminal (candidate (a), thin form). The key is never a terminal address and never the hc name alone.. All five lenses after answers. Addresses die: review.sh does `hc rm` and recreates review-$mr with a new address on every re-review, and sidebar-agents.json's two address-keyed rows (host-c/t2, host-c/t3) are already orphaned against host-c's live t8, t11, t12. Names are 'unique among live terminals', settable only on `hc run`, and reused ('integrator' on finished t2q and live t64). Labels persist in terminals.json, are already used for binding (herdr.space, herdr.tab, sofia.*), reach mods via terminals(), and can be set on a running terminal with `hc label <t> k=v`, which is the only way to give the unnamed t1m and the 28 anonymous terminals an identity without restarting them.
- **P2** Who writes the binding label and where.: Whoever runs `hc run` writes `--label <key>=<seat>` on that line (t1m's spawns, review.sh:11, escalate.sh:11, the dogfood launchers). Live terminals, t1m included, are bound after the fact with `hc label <t> <key>=<seat>`. Templates cannot carry it.. Feasibility, operations, dissent. `hc schema` TemplateInfo is {name, description, command, error} and the files in ~/.config/herdr-core/templates/ match, so no template frontmatter slot exists. review.sh and escalate.sh already pass `--label herdr.space=…` on the same line. hc has no rename verb and `--name` exists only on `hc run`.
- **P3** The label key's namespace.: A key outside `herdr.*`, for example `bot=<seat>` (exact spelling is implementation); a companion key may carry a resume pointer for agents whose permanence is a session (t1m's `claude --resume …`).. Feasibility. Herdr gives behaviour to the `herdr.*` keys it writes (herdr.right-click routes clicks, herdr.space/tab adopt terminals), so a `herdr.bot` key could collide with a future app version. This is a convention inferred from Herdr's use of its keys, not a documented reservation; the sofia.* labels on host-a are the precedent for a project-owned namespace.
- **P4** How a terminal with no bot label is shown (the (b) fallback).: Derived and marked: template as the role chip, hc parent as lineage, hc name as the live name, and an explicit 'unbound' tag. The view always shows coverage (bound ÷ live terminals with an agent in the foreground; today 0 of 13 templated), never folds an unbound terminal into a bot, never drops it, and never invents a name or look. Registered seats with no live terminal show 'seat empty'; a label whose seat is unknown shows 'unregistered'; two terminals on one seat show a duplicate warning.. Operations and legibility. 13 of the live terminals are templated and none carries a bot label, so the view would otherwise be a confident lie; the host's failure doctrine (silence is the bug) applied to the UI. mods/spaces-agents/main.js already draws children by parent (line 223) and labels rows `k.name || k.template || …` (line 264), so derivation costs nothing new.
- **P5** When a bound terminal counts as a live bot.: Only when it carries the seat label AND an agent program is in the foreground (`foreground`/`status.app`, not `argv`). A kept terminal whose program was replaced by a shell shows as 'seat vacant'.. Operations. AGENTS.md:131-134: a lost terminal comes back as a shell at the same address and its command is never re-run; `--keep` means the same. t1m's argv is `/bin/zsh -l` with claude as the foreground, so argv is the wrong signal. This rule makes the unverified question of whether labels survive readoption harmless: lost label shows unbound, surviving label under a shell shows vacant, neither shows a stale live bot.
- **P6** Where role, instructions and model live, and what reviewers and Astra are.: The hc template is the role class and the bot record holds only a reference to it, never a copy. Model defaults from the template command and is read from the terminal's argv as the truth. Reviewer and Astra are one permanent seat each; every review-<mr> and astra-N terminal is a disposable shift of that seat, labelled by the script that spawns it.. Automagik lens. review.sh:13 and escalate.sh:13 run a bare codex command and paste the template body (`sed -n '/^# Role/,$p' …reviewer.md`), so hc records template=null (t13m confirms) and their model (gpt-6-astra in argv) differs from the template. Automagik's duplicateBot/copyOf is the same template-versus-instance split. Without the shift kind, every review-<mr> becomes its own bot and the 50-agent view becomes hundreds.
- **P7** What a shift is and whether binding history is kept from day one.: A shift is one instance of a seat, identified by address plus created_ms (unique even when a name is reused). No history store on day one: the view shows the live shift and a count since it started, and says history is not kept. History is a later retrofit rebuilt from hc's retained finished terminals, or from an `hc events` follower when per-bot usage or memory needs more. Condition: `hc rm` on bot-bound terminals (review.sh:9, reap.sh:6) destroys what hc would have retained, so the retrofit's reach depends on changing or archiving those removals.. Operations and automagik after answers. `hc ls --all --json` returns 193 terminals, 144 finished and retained, and `hc get` on a finished terminal (t13m) still returns name, parent, template, labels, created_ms and finished_ms. `hc events` is a live subscription with a 'missed' snapshot and no durable replay; the state directory holds no event log.
- **P8** How team and reports_to are encoded.: Explicit, never derived from `herdr.space`. An explicit label (e.g. `reports_to=<seat>` or `team=<id>`) wins; otherwise the hc parent is read as the reporting edge. The registry does not hold reports_to.. Feasibility withdrew the space-label claim (escalate.sh places Astra in the captain's space for display; parent is whoever ran the script, cut loose by --outlive-parent). Legibility withdrew 'only a registry can carry reports_to': hc parent already draws the org chart where the spawner set it (t188 review-128 under t40, df-* under t34, helpers under t64). Reading label-then-parent keeps the model correct whether or not the owner re-parents spawns (Q4).
- **P9** Whether a registry exists, what it holds and where it lives.: A minimal registry of slow, owner-set facts only: seat id, display name, look, permanent flag, optional resume pointer; about 8-10 rows for the core team, keyed by seat id. It never holds binding, lineage, status or reports_to. It is versioned in this repo (not in shared.json or data/, which belong to the one computer running the app, and not inside the installed mod folder, where any save hot-reloads every copy); remote viewers re-read it with readTextFile({on}) since watchFolder takes no `on` argument.. Legibility, feasibility, automagik. Its one job the label cannot do is absence and permanence ('seat empty', 'the t4 captain is missing'), plus a persona per seat where one template backs several seats (t48 and t4m both run dev-sol with identical argv and model). The owner said the visualisations are 'for our teams', which rules out per-app-computer stores. Dissent opposes any hand-kept file (see dissent).
- **P10** What (c), the Automagik-style long-lived bot, is in this design.: Deferred and layered, not the starting model. A `--keep` hc terminal is already the long-lived seat with its instructions and look inside hc. What hc cannot do, respawning the agent after a lost-terminal recovery (keep gives back a shell, never the command) and memory, schedules and chat between sessions, comes later from an external writer (the orchestrator, Automagik or Brain) that writes the same seat label. A mod cannot be that owner (block-bound life, 250 ms close, 30 s exec cap).. Feasibility after answers; operations and automagik concur. Automagik itself keeps identity (bots[id], an id that never changes) apart from runtime (sessions, segments, owner maps), so (a) is how Automagik works underneath. (c) as the data model would fold O3 (who spawns) and O4 (runtime) into a structural choice and would likely need a runtime outside hc against A4.
- **P11** What 'permanent bot' means in the first cut (O4 / A5).: Identity now: a seat label with a resume pointer, a registry row, and 'seat empty' when the terminal is gone. Memory reload, respawn after loss and schedules are a later layer that writes the same label.. Carried by question 1 (owner's). Dissent conceded t1m's permanence today is only the `claude --resume` argv; automagik lens says if memory is required day one, (c) is required day one. (the owner decides)
- **P12** Who gets a seat (O2).: Permanent seats (about 8-10: orchestrator, pm, dogfood, integrator, captains, devs, tests) plus the Reviewer and Astra seats whose terminals are shifts. Helper processes fold under their parent as a count and never become bots.. Carried by question 2 (owner's). Dissent counted 21 of 49 terminals as orchestrator-spawned; operations warned that showing every helper (autopg, fixtures, host-e/t18, t19) as a bot collapses the at-a-glance reading. (the owner decides)
- **P13** Whether an automated binder may write labels on terminals that spawners forgot.: Yes, with a dry-run mode: one binder (a mod using terminals() plus exec('hc label …'), or an hc events follower) applies a single rules file (template or exact name → seat) only to terminals with no seat label; a label set explicitly at spawn always wins. If it is not running, coverage drops and the view says so.. Carried by question 3 (owner's, because it is a writer across machines). Operations: the captain, dev, PM and dogfood spawns are ad hoc `hc run` calls from t1m with no single place to change, so spawn-site discipline cannot be enforced. Dissent prefers no extra machinery. (the owner decides)
- **P14** Whether spawns change so devs and tests are children of their captain (O3).: Yes: the orchestrator spawns team members with `--parent <captain>` and keeps today's flags (every seat already has die_with_parent=false, keep=true, so no member dies with its captain). The open cost is notify routing: members' notes would reach the captain instead of t1m.. Carried by question 4 (owner's workflow). Dissent read `die_with_parent` on every live seat; legibility named the lifecycle and notify edges as the owner's call; the team-captain template already says members report to the captain. (the owner decides)
- Dissent, dissent: Supports a thin, label-only (a) but opposes a separate bots file maintained by hand: sidebar-agents.json holds 2 rows against 47 live terminals, a measured drift rate for this kind of file, and no script or role exists today to keep a richer one current (legibility conceded this). Looks should come from a table in the mod keyed by template and tinted by space, with a per-seat override only when the owner wants a persona per seat. Also opposes (c) until the owner settles that a bot must exist with no terminal or must run schedules and memory reloads.
- Dissent, dissent: Prefers fixing the data where it is produced (every spawn passes --name and --parent; tabs and spaces renamed) over any additional writer; an automated binder is more machinery that can itself be down.
- Dissent, automagik: If the owner requires memory keyed by bot id, usage credited across shifts, or bots creating bots in the first cut, then (c)'s runtime is needed from day one as an external supervisor that writes the same label, not deferred.
- Dissent, legibility: Re-parenting devs and tests to their captain changes where their notes go (notify=true, --no-notify exists); whether that helps or disrupts the captain was not testable read-only and is the owner's call, so P8 must not assume it.
## Round 2 lead notes

The Round 1 "Open" and "Assumed" lists above are kept as history; the lists below supersede them.

### How the owner's round-2 answers read (plain)

- **R1-1 is a real answer, and a larger one than the council proposed.** A permanent bot is a permanent identity slot that can be attached to any coding agent (Claude, Codex, …) in any Herdr pane. On top of identity it receives, through hooks, a continuous feed of everything happening in its project. The goal is that the owner talks only to that bot to build a whole project, the way he talks to this session. Every project can have a team of agents, inspired by Automagik; direct support for "dsh" comes next (not now).
- **R1-2 is a redirect, not a seat list.** The owner does not want today's live fleet mapped into bots. He will create bots from scratch. He points at the Herdr-pets mod (`github.com/Aryan1092raj/Herdr-pets`) as a project that "kinda got it", asks again that `~/.config/herdr-app/AGENTS.md` be read, and asks that the Herdr-pets mod be added. Installing it is recorded as owner intent for the design and the wish; this round is read-only and installs nothing.
- **R1-3 and R1-4 decided nothing.** Both came back as "explain better". The owner does not follow terminal ids (t1m, t3x) or hc vocabulary (labels, `--parent`, notify). R1-4 did state a shape he wants: main bot → a team of bots → each team bot spawns its own children → which may spawn children. Any re-ask goes through a question that reopens R1-3 or R1-4 and quotes the old answer.

### Standing rule for every later question

Plain language only: bot names, roles, "the main bot", "a team member", "a helper it starts". No terminal ids, no hc flags or label keys, no file paths in the question text. A mechanism appears in a question only as its consequence for the owner ("you would see…", "messages would go to…").

### Council decisions against the owner's answers

| P | Status | Why |
|---|---|---|
| P1 seat id carried on the terminal, never the address or name | Unshaken (mechanism) | Still how a pane is tied to a bot created from scratch. |
| P2 the spawner writes the binding at launch | Unshaken | A from-scratch bot is launched by Herdr/the owner/its parent bot, which writes it. |
| P3 key outside `herdr.*` | Unshaken | |
| P4 unbound terminals shown derived and tagged, coverage shown | Shaken | With bots created from scratch, unbound terminals are no longer the main population; whether they appear at all is open (O2-4). |
| P5 live only with an agent in the foreground | Unshaken | |
| P6 template is the role class; reviewers/Astra are shifts of one seat | Shaken | Mechanism survives; whether hc templates are the role class of a from-scratch bot, or the bot carries its own role/instructions as Automagik does, is open (O2-1). Reviewer/Astra seats belong to the old fleet framing. |
| P7 shift = address + created time; no history store day one | Unshaken | |
| P8 team edge explicit, else hc parent | Unshaken, simplified (scout 3) | hc records the starter as parent by default, at any depth (t1m → dogfood → df-* is a live 3-level chain), so a bot that starts its own helpers draws the owner's tree with no extra label. The explicit edge is needed only where a spawner starts terminals on someone else's behalf. |
| P9 minimal hand-kept registry for 8-10 seats | Superseded in shape | A from-scratch bot needs a definition (name, look, role, agent, project) somewhere; that is the registry, but it is now the primary object, not an overlay on the fleet. Where it lives is open (O2-1). |
| P10 Automagik-style runtime deferred | Superseded by owner, in part | R1-1 asks for project-context hooks on the permanent bot; whether that is first cut is open (Q2-2). P10's reason still holds (scout 1): a mod cannot be the long-lived owner of a bot (close gets 250 ms, exec 30 s, `keep` gives back a shell and never re-runs the agent), so a feed or respawner lives in a hook or an outside process, not in the mod. |
| P11 permanent = identity only in the first cut | Superseded by owner | R1-1 adds "attached to any coding agent" and "hooks injected with everything going on in the project". |
| P12 who gets a seat from the live fleet | Superseded by owner | R1-2: bots are created from scratch. |
| P13 automated binder relabels forgotten terminals | Likely moot | With from-scratch bots there is no legacy fleet to retro-bind; to be confirmed by a reopen of R1-3 in plain words, or dropped with the owner's agreement. |
| P14 devs/tests re-parented to their captain | Reframed by owner, mechanism confirmed | R1-4 wants main bot → team → children → grandchildren. Scout 3: this falls out of default parentage when each bot starts its own helpers; automatic reports go one level up only (parent, never the root). Correction to R1-4's question text: "every seat already has die_with_parent=false and keep=true" holds only for t1m's direct children; dogfood's and the integrator's children have die_with_parent=true, keep=false. The plain re-ask is Q2-3. |

### Scope

- Raised this round (mine): **Bots are created from scratch by the owner (a definition flow), not derived from today's terminals.** Source: R1-2.
- Kept, in conflict with R1-2 until the owner answers a drop question: "The orchestrator's whole team (captains, devs, test writers, integrator, PM, dogfood, reviewers, escalations) represented as bots". Also probably reshaped: "The orchestrator as a permanent bot" (becomes "a project's main bot").
- Candidate raises held under Open, not added: per-project teams; project-context hooks on the permanent bot; the Herdr-pets mod installed and used as reference. dsh support is "next" per the owner and stays out.

### Size

G stands; the split from round 1 still holds (view, identity/definition, behaviours), now with "definition flow" and "context hooks" inside pieces 2 and 3.

### What the scouts found (facts, not decisions)

- **Herdr-pets (scout 0).** One pet per live terminal that reports a status; never created or defined by anyone; nothing stored per pet (only two global prefs, on/off and colour); its look comes from a hash of the terminal address (Claude and Codex get their logos, anything else a blob/cat/ghost/bot); it vanishes when the terminal dies. It draws a 64 px bottom strip of 28×28 SVG sprites tinted by status, with blink/bounce/sleep animations, speech bubbles, parent/child pets walking to each other, and double-click to focus. It uses only `terminals()`, `agents()`, `shared`, `svg()`, `run('agent.focus')`; no exec, no file reads, no labels. MIT, targets Herdr 0.1.10, about one hour old (created and last pushed 2026-10-31), 1 star; it ships the Claude and Codex logos, which are brand material. **What "kinda got it" maps to:** a visible avatar per agent, status shown on the avatar, and the parent/child picture. It has no creation flow and no permanence, so it informs the look, not the identity model. Source: `github.com/Aryan1092raj/Herdr-pets` mods/herdr-pets/pets.js:24-51, main.js:32-35,146-168, README.md:5,58,76.
- **What a mod can do (scout 1, `~/.config/herdr-app/AGENTS.md` + herdr.d.ts).** Identity: arbitrary labels on terminals (`hc run --label`, `hc label`), returned by `terminals()`; a terminal carrying `herdr.space`/`herdr.tab` labels is adopted into that space/tab with a pane. Spawning: the app commands (`tab.new`, `space.new`, `terminal.open`, `pane.split`) take an agent and a first message but no label, parent or template; only `hc run` takes `--label`, `--name`, `--cwd`, `--parent`, `--bg`, so a bot launched from a mod goes through `exec('hc', …)` plus adoption labels. UI: sidebar/band blocks, panes, tabs, dialogs/popups/windows via `openOverlay`, a custom right-click menu, and form controls (Input, Button, Checkbox, Switch, a folder picker), enough for a create-bot form. Images: `image()` draws PNG/JPEG/SVG from under `~/.config/herdr-app`, so a photo look is feasible (resolves round-1 O7's open fact). Limits: exec 30 s / 8 MiB, readTextFile 1 MiB, no timers outside `cx.timer`, close gets 250 ms, a crashed agent is never re-run by `keep`. No event-hook API in the mod runtime beyond live re-render; talking to an agent is `hc send`. AGENTS.md:86-160, 506-589, 700-756, 818-943; herdr.d.ts:10-77, 209-212.
- **Feeding a bot "everything going on" (scout 2).** Quiet, per-turn context hooks exist on every coding agent on this host: Claude Code (SessionStart/UserPromptSubmit `additionalContext`, proven by Brain's hook), Codex 0.166 (Claude-shaped hooks.json, `additionalContext` in the binary, runtime behaviour unverified), Gemini 0.27 (BeforeAgent `additionalContext` in source), Kimi CLI (TOML hook table) and omp (extension `before_agent_start` hidden message). Each agent needs its own installer and payload shape, and the same hook files are already written by ai-memory, Orca and Herdr's own Kimi state hook, so a bot injector would be one more writer. `hc send` reaches every agent uniformly but arrives as a typed user turn and competes with the human's input. Brain's hook today injects memory recall (≤10,000 chars per prompt, ≤320 at session start), Claude Code only, and no project activity. **No existing surface aggregates project activity** (agent status, git, PRs, CI) into one feed; `hc events` gives terminal facts (status, labels, children) live. compiled-entry.ts:32-56,412-476; khortex-memory/inject-budget.ts:14-33; ~/.codex/hooks.json; ~/.gemini/settings.json; ~/.kimi-code/config.toml:64-103.
- **Hierarchy (scout 3).** hc records the starting terminal as parent by default; no depth limit is documented and none observed (deepest live chain: orchestrator → dogfood → df-*, plus chains that cross machines). Automatic reports ("notes") go to the direct parent only, never bubble to the top; explicit messages can go anywhere. A child dies with its parent's program unless started with `--outlive-parent`. `hc run --help`; `hc get` on 15 terminals; `hc read t34` tags.
- **Automagik and dsh (scout 4).** "dsh" is **DeepSeek Harness**, a third-party agent harness; `apps/bots-dsh` is Automagik's Bot-team plugin for it. An Automagik bot is created by a form or by a Main Bot's `create_bot` tool with name, role (2-4 chars), instructions, brief, colour, avatar, model (fixed at creation), effort and work folder; it is stored in one team file (`state.json`, version 1) with per-bot, per-group and team memory as Markdown. There can be several Main Bots; **only a Main Bot creates bots**, so the roster is flat (one `createdBy` field, no parent/team tree); delegation depth exists only as transient "works". Automagik has **no project concept and no hook injection**: bots receive messages, schedules, a time refresh and frozen memory. The outside interface is an HTTP endpoint plus an SSE feed on the dsh server, cookie-authenticated, marked "Labs" and format-unstable. A `genie` bot kind already sits next to `omni`. Correction to round-1 evidence: colours are 13 plus 6 extra, not 12. apps/bots-dsh/src/host/roster.js:23,116-186,540-574; tools.js:253-285; store.js:21-22,95-100; README.md:7-9,101-143.

### WRS

| Dimension | Score | Evidence |
|---|---|---|
| Problem | 11/20 | R1-1 names the product: one permanent main bot per project that the owner talks to, with a team under it, attachable to any coding agent. Still missing what the owner must see or do at a glance. Scouts added no owner statement. |
| Scope | 5/20 | R1-2 "from scratch" conflicts with one Scope IN item; no in/out list agreed. Unchanged: no owner answer landed. |
| Decisions | 5/20 | Unchanged: R1-1 (vision), R1-2 (from scratch). Scouts made Q2-1 to Q2-4 askable in plain words, but nothing is decided until the owner answers. |
| Risks | 9/20 | Now enumerated from evidence: each coding agent needs its own hook installer and payload (scout 2); hook files already shared with ai-memory, Orca and Herdr (scout 2); `hc send` competes with the human's typing (scout 2); no project-activity feed exists to inject (scout 2); a mod cannot supervise or respawn a bot (scout 1); app commands cannot attach a label or parent, so launches go through `hc run` plus adoption (scout 1); Automagik's format is "Labs" and unstable (scout 4); Herdr-pets is an hour old and ships third-party logos (scout 0). Not yet weighed or mitigated. |
| Criteria | 2/20 | None yet. |
| **Total** | **32/100** | |

### Gap map

- Settled: R1-1 (vision of the permanent bot), R1-2 (bots from scratch; Herdr-pets as reference).
- **G1 where a bot is kept and what it carries** — facts in hand (Automagik's field set, mod form controls, image support). Asked: Q2-1.
- **G2 first cut of the project feed** — facts in hand (hooks per agent, no aggregate feed exists). Asked: Q2-2.
- **G3 hierarchy** — mechanism confirmed (default parentage, any depth, reports one level up). Asked in plain words: Q2-3 (reopens R1-4).
- **G4 the orchestrator's existing team as a scope item** — Asked: Q2-4 (scope drop).
- G5 automated binder (R1-3) — waits on Q2-4; moot if the existing team is dropped.
- G6 who may create team bots (only the owner, or the main bot too as in Automagik) — after Q2-3.
- G7 the look: Herdr-pets' sprite vocabulary vs Automagik's characters/colours vs photos (all three feasible).
- Independent: folders beside bots (O6), reach across machines (O8), "dsh next" meaning (A6).

### Open

- O2-4. Whether terminals that are not bots (helpers, today's fleet) appear in the bot view, and how (folded under their bot as a count, per P4/P12's spirit).
- O2-5b. Reshape "The orchestrator as a permanent bot" into "a project's main bot" (needs its own question; Scope IN text is exactly "The orchestrator as a permanent bot").
- O2-6. Automated binder: drop as moot or keep (reopens R1-3; only after Q2-4).
- O2-7. Herdr-pets: the owner asked for it to be added (A7); open is whether the bot view borrows its look and animations, and whether its Claude/Codex logos may be reused.
- O2-8. Per-project teams as a scope item (R1-1: "every project can have a team of agents").
- O2-9. Who may create team bots: only the owner, or the main bot too (Automagik lets only a Main Bot create bots).
- O2-10. What "direct support to dsh next" means: run DeepSeek Harness as a coding agent in a pane, or read/write an Automagik bot team (A6).
- Facts for the next round's scouts, not owner questions: whether `hc run --bg` with `herdr.space`/`herdr.tab` labels launched from a mod's `exec` gets a pane by adoption; what parent a terminal launched by a mod gets (exec runs outside any terminal, so likely none: the main bot would be a root); whether Codex, Gemini and Kimi honour `additionalContext` at runtime and their size caps; space-groups on 0.1.10 (O9); Herdr-pets on 0.1.10.
- Carried from round 1: folders (O6), reach across machines (O8). O7's raster question is answered (feasible); the choice of look is G7.

### Assumed

- A1–A4 from round 1 stand; A5 was answered by R1-1.
- A6 (revised). "dsh" is DeepSeek Harness, a third-party agent harness, and `bots-dsh` is Automagik's plugin for it (scout 4). dsh support stays out of the first cut (owner: "next"); which kind of support is O2-10.
- A7. "Add this mod" is a request the wish fulfils; this brainstorm installs nothing.
- A8. herdr-core and the Herdr binary are not changed (A4); a feed built on per-agent hooks and `hc events` needs no change there (scout 2), so this assumption is not under pressure yet.
- A9. A bot's look, name, role, instructions, coding agent and project are the minimum fields of a from-scratch bot, following Automagik's record (scout 4) minus model-fixed-at-creation, since the coding agent is chosen per bot. Pending Q2-1.

### Dispatch this round

Five read-only worker scouts reported (Herdr-pets, AGENTS.md, context-injection surfaces, hc lineage, Automagik/dsh). No council. Four plain-language questions went to the owner: Q2-1 where a bot is kept, Q2-2 the first cut of the project feed, Q2-3 which levels of the tree are bots (reopens R1-4), Q2-4 drop the orchestrator's existing team as a scope item.

## Round 3 lead notes

The Round 2 "Open" and "Assumed" lists above are kept as history; the lists below supersede them. The standing plain-language rule for questions (Round 2) still applies.

### How the owner's round-3 answers read (plain)

The option texts the owner picked from were read from the round-2 workflow state, so "1." below is the first option exactly as it was offered.

- **R2-1, "With the project".** A bot's definition (name, look, role and instructions, coding agent, project) is saved alongside the project's code, so teammates and every computer that opens the project see the same bots and changes are tracked like code. Trade-off the owner accepted: creating or editing a bot changes the project and someone has to commit it.
- **R2-2, "1. + the other members of the team get the context of their child + parent, so that no one sees more than they should".** Option 1 was "Team briefing": before each turn the main bot quietly learns what its team is doing (who is working, stuck or finished, and their latest reports); Claude first, the other agents after; code changes, merge requests and test results are **not** in it yet. Read narrowly: it is the team-status briefing, not the full project feed. The owner added a rider: every other team member also gets a briefing, limited to its own parent and its own children. **"So that no one sees more than they should" is a visibility rule.** Whether it is met by what the briefing chooses to include (curation) or must also stop an agent from reading other agents directly (enforcement) is not yet known; scout S3 checks whether hc offers any access scoping between terminals.
- **R2-3, "1. and their helpers don't have to be a new system, we can improve over regular herdr layered orchestration" (with a screenshot of today's nested Herdr sidebar).** Option 1 was "Main bot and team": the main bot and its team members are bots the owner creates; anything a team member starts, at any depth, is a temporary helper shown folded under it and gone when its work ends. The rider: helpers are just Herdr's existing parent/child terminals, and the bot view should **improve the tree Herdr already draws** rather than invent a helper system. This sits uneasily with Scope IN item 1's wording "adapted from herdr-space-groups"; scout S1 finds which mod draws the screenshot's tree before any question about the base is asked. Item 1's text is not touched until the owner answers.
- **R2-4, "Drop it".** Today's running team stays as plain agents; bots start empty and the owner creates them. The Scope IN item is removed this round on that answer.

### Council decisions against the owner's answers (update)

| P | Status after round 3 | Why |
|---|---|---|
| P1, P2, P3, P5, P7 | Unshaken | Mechanism for tying a pane to a saved bot. |
| P4 unbound terminals derived and tagged | Moot in its fleet form | R2-4 dropped today's team; R2-3 keeps non-bot terminals as Herdr's ordinary rows/helpers. Coverage reporting survives only as "bot defined but no pane" (seat empty). |
| P6 template as role class | Superseded by R2-1 | The bot's own definition, kept with the project, carries role and instructions. hc templates may still be a launch convenience; not a design dependency. |
| P8 team edge = hc parent | Confirmed by R2-3 | Main bot → team → helpers is default hc parentage at any depth. |
| P9 registry | Reshaped by R2-1 | The registry is the project's bot definitions file, the primary object. |
| P10 runtime deferred | Partly superseded by R2-2 | A per-turn briefing is first cut; it still lives in a coding-agent hook (Claude first), never in the mod (scout 1, round 2). Respawn, schedules and memory remain later. |
| P11, P12 | Superseded (round 2) | |
| P13 automated binder | Moot, not yet settled | No legacy fleet to label after R2-4; a bot is labelled when it is started or attached. Needs a plain reopen of R1-3 to close. |
| P14 re-parent team members | Confirmed by R2-3 | Whatever a bot starts sits under it; reports go one level up. |

### Scope

- Removed on the owner's answer (R2-4): "The orchestrator's whole team (captains, devs, test writers, integrator, PM, dogfood, reviewers, escalations) represented as bots".
- Raised this round (mine), each sourced:
  - "Each project has its own main bot and team of bots, their definitions saved with the project" (R1-1, R2-1).
  - "A quiet per-turn briefing: the main bot learns its team's status before each turn (Claude first); each team member gets only its parent's and its children's context" (R2-2).
  - "Helpers are not a new system: anything a bot starts is a temporary helper folded under it in Herdr's existing tree" (R2-3).
  - "The Herdr-pets mod added, as the owner asked" (R1-2). Reusing its Claude/Codex logos is not part of this item (brand material; Open).
- Kept verbatim pending a question: "The orchestrator as a permanent bot" (Q3-b asks whether it stays as the first main bot or is dropped as a separate item); "Bot view: a Herdr mod pack adapted from herdr-space-groups …" (Q3-d; S1 found the screenshot's tree is not drawn by herdr-space-groups).
- Held, raised only if the owner picks Q3-d's recommended option (which drops item 1 as worded): "Bot view: improve the sidebar tree Herdr already draws so it shows bots (human name, role, look, status, permanent vs disposable, who reports to whom), with each bot's helpers folded under it with a count". Source: R2-3's rider and S1.
- The R2-4 drop is carried by R2-4's recorded value; the Scope ratchet section is the script's to update, not the lead's.

### Size

G stands. Pieces: (1) bot view over Herdr's tree; (2) bot definition file, create/attach flow and launch binding; (3) the per-turn briefing hook with parent/children scoping. Each ships alone; (2) is the foundation of (1) and (3).

### Candidate acceptance criteria (drafted from Settled answers only; not agreed)

- C1. Creating a bot through Herdr writes one definition into a file inside the project (name, look, role/instructions, coding agent); a second computer that opens the same project shows the same bot (R2-1).
- C2. A defined bot with no running pane shows as present but empty, never as missing (R1-1 "permanent identity slot", P4 survivor).
- C3. Starting a bot opens a pane running its chosen coding agent and ties that pane to the bot; attaching a bot to an already-running pane does the same without restarting it (R1-1 "attached to any coding agent… any herdr pane").
- C4. Anything a bot starts appears folded under that bot in Herdr's tree and disappears from the view when its work ends; it gets no name or look of its own (R2-3).
- C5. Before each turn, a main bot running on Claude receives, without anything typed into its pane, a briefing of each team member's status (working, stuck, finished, idle) and latest report (R2-2). Herdr stores no report (S3: no notes command, no report field), so "latest report" in the first cut is the status text a member's agent publishes when it publishes one, else the last lines of its screen (A13).
- C6. A team member's briefing names only its parent and its own children; it contains nothing about siblings or other branches (R2-2 rider). This is a property of the briefing's contents. S3 found hc does not stop any agent from reading any other terminal, so whether anything beyond the briefing's contents is required is Q3-c.
- C7. A bot's row shows its name, look, live status and whether it is permanent (main bot / team member) or a helper (Scope IN item 1).

### WRS

| Dimension | Score | Evidence |
|---|---|---|
| Problem | 13/20 | R1-1 product vision plus R2-3's shape (main bot → team → folded helpers) and R2-2's scoped context. Still unsaid by the owner: what must be readable at a glance with ~50 agents (C7 is a lead draft). |
| Scope | 10/20 | R2-4 drop recorded; four sourced raises. Two items await reshaping questions (orchestrator item, view base); Herdr-pets logos, dsh and folders unplaced. |
| Decisions | 11/20 | Four real answers landed (R2-1..R2-4). G-create closes on R2-3's picked option text ("bots the owner creates"). Open owner decisions: first main bot vs today's orchestrator, look, view base, visibility (all asked this round), binder closure, logo reuse. |
| Risks | 13/20 | Now known, not guessed: hc has no access control between terminals and the caller's identity is self-declared, so the visibility rule can be curated, not locked, without changing how agents run (S3); hooks already shared by four writers on the same events coexist as separate entries, and a project hook is a new file per repo (S3); the screenshot's tree comes from the owner's own sidebar copy, which lacks per-bot folding (S1); a team member started by its main bot ends with it unless started to outlive it (S2); Herdr keeps no report to brief from (S3). Untested inferences named in the scouts section. Mitigations drafted under Assumed, not agreed. |
| Criteria | 4/20 | C1–C7 drafted; C5 and C6 sharpened by S3. None agreed by the owner. |
| **Total** | **51/100** | |

### Gap map

- Settled: R1-1 vision, R1-2 from scratch, R2-1 kept with the project, R2-2 team briefing + parent/children rider, R2-3 main bot and team are bots, helpers on Herdr's tree, R2-4 old team dropped.
- **G-base (view base)**: fact found (S1: the tree is the owner's own sidebar copy; herdr-space-groups groups spaces in a separate block). Asked: Q3-d.
- **G-vis (visibility)**: fact found (S3: no access control in hc). Asked: Q3-c.
- **G-first (today's orchestrator)**: attach mechanism found (S2, partly inferred). Asked: Q3-b.
- **G-look**: Asked: Q3-e (promoted, see Dispatch).
- G-start (start/attach path): closed on S2 for design purposes; two inferences untested (a pane started from the mod gets no parent; a bot label survives an app and core restart). Design assumption A11.
- G-create (who may create team bots): closed by R2-3's picked option text, "the main bot and its team members are bots the owner creates". Letting the main bot create bots too would need a reopen of R2-3 (Open).
- G-report (what a "latest report" is): no stored report exists (S3). Lead assumption A13, revisited at design.
- G-lifetime (team members survive their main bot's restart): follows from R1-1's "permanent identity slot"; lead assumption A12, not an owner question.
- G-binder (R1-3) closure: owner reopen, low priority.
- G-logos (reuse Herdr-pets' Claude/Codex logos): owner question, after Q3-e.

### Open

Asked this round: Q3-b, Q3-c, Q3-d, Q3-e (see Questions this round). Waiting, ranked:
1. Q3-f Close the automated binder: reopen R1-3 quoting "explain better this is too complex to me" → "no automatic labelling; a pane becomes a bot only when started or attached as one".
2. Q3-g Logos: may the bot view reuse the Claude and Codex logos that Herdr-pets ships (brand material)? Only meaningful after Q3-e.
3. Q3-a (parked) Letting the main bot create team bots, Automagik-style: a reopen of R2-3, whose picked option says the owner creates them. Ask only if the owner raises it.
4. Later: confirm C1–C7 as the acceptance bar; folders beside bots (O6); reach across machines (O8; S3 shows hc already lists six connected machines' terminals); what "dsh next" means (O2-10, out of first cut).
5. Facts for the design, not the owner: run the untested S2/S3 inferences once (a pane started from the mod gets no parent; a bot label survives an app and core restart; a Claude hook sees the terminal id; several hooks' briefings on one event are all delivered); which agents publish a status text a briefing could quote.

### Assumed

- A1, A3, A4/A8 stand (mod pack by clone; herdr-core and the app binary unchanged).
- A2 narrowed by R2-1: the audience is whoever opens the project; other machines' spaces are not bots unless defined in a project.
- A6: dsh support is out of the first cut (owner: "next").
- A7: "add this mod" (Herdr-pets) is fulfilled by the wish; this brainstorm installs nothing.
- A9 revised by R2-1: minimum fields are name, look, role/instructions, coding agent; the project is implied by where the file lives.
- A10. R2-2's "1." is the Team briefing option exactly: team status and latest reports only, Claude first; code, merge requests and test results are later. Not inflated toward the full feed.
- A11. Start shape: a bot is started from Herdr with `hc run --bg`, its bot label, `herdr.space`/`herdr.tab` adoption labels, its name and the project folder. Because the mod's `exec` most likely gives no parent (S2, inferred), a team member started from the form passes `--parent <main bot's terminal>` so it nests under its main bot. Attach is `hc label <terminal> <bot key>=<bot>` on a live pane (S2).
- A12. Team members are started with `--outlive-parent` (or re-parented explicitly) so a main bot's restart does not end them; helpers keep hc's default and end with their bot (S2: children end with their parent's program by default). Follows R1-1 "permanent identity slot" and R2-3.
- A13. First-cut "latest report" is a member's published status text when present, else a short tail of its screen (`hc read`, about 7 ms per child; one `hc ls --json`, about 33 ms, gives the whole tree). No new report store in the first cut (S3).
- A14. The briefing hook is a project-level Claude Code hook (a new `.claude/settings.json` in each bot project), gated on `HC_TERMINAL_ID` and fail-open with a short timeout, beside the Brain plugin, ai-memory, Orca and mnemosyne hooks already on SessionStart/UserPromptSubmit (S3). Following the Brain/Orca precedent; delivery order with several hooks unverified.
- A15. If Q3-d's recommended option is picked, per-bot folding with a count is ported from Herdr's shipped agents list into the owner's sidebar copy, and a bot's name and look replace the row label and app icon there (S1).

### Dispatch this round

Three read-only worker scouts (S1 sidebar base, S2 start/attach path, S3 scoped briefing and access scoping). No council: the round-2 answers were clear and no single open decision is both contested and hard to reverse. Questions are written after the scouts report.

Deviation from the plan: Q3-a (who may create team bots) was not asked, because R2-3's picked option already says the owner creates them; asking again would be a re-ask or an undeclared reopen. The freed slot went to Q3-e (look), next in the ranked list and free of scout dependencies.

### What the scouts found (facts, not decisions)

- **Sidebar base (S1).** The screenshot's tree is data from herdr-core: every terminal carries a `parent`, and the live tree matches the screenshot (orchestrator → pm, dogfood → df-*, integrator → d1-* command terminals). The active layout is `main-agents`, whose sidebar block is the user clone `spaces-agents` (cloned from shipped `spaces` 0.1.7), not shipped `spaces` (which draws only space rows) and not herdr-space-groups. In the clone, nested rows come from `kids()` over `terminals()` (main.js:222-271), the app icon from the program entry (:237, :254), the status ring from `status()` (:213-220). The row label already reads the terminal name, and a clone can swap it and the icon (`image()` from under the app home, or a programs.json entry). Per-agent fold with a count is **not** in the clone; it exists in Herdr's shipped `agents` mod (agents/main.js:235-262) and in space-groups-agents. herdr-space-groups is two blocks: folders of *spaces* plus a separate agents list; no merged view. Static check only: space-groups (tested on 0.1.9) and Herdr-pets (requires 0.1.10) import nothing this host's 0.1.10 lacks; neither was run. Unverified: whether `image()` takes absolute paths.
- **Start and attach (S2).** `hc run` has every flag needed (`--bg`, `--label`, `--name`, `--cwd`, `--parent`, `--no-parent`, `--outlive-parent`, `--keep`, `--on`); `herdr.space`/`herdr.tab` labels make the app adopt a terminal into a pane (AGENTS.md:136-149). A terminal a bot starts gets that bot as parent at every depth (live chains confirm), and ends with it unless `--outlive-parent`; a parented terminal has no pane unless adopted by labels or `terminal.keep`. `hc label` sets free-form labels on a live terminal; custom labels sit in the core's persisted records (terminals.json: 140 records carry a custom `where` label). The app's own `terminal.open`/`tab.new` start panes without hand-written labels but take no label or parent. **Inferred, not tested:** a terminal started from a mod's `exec` gets no parent (the app process has no `HC_TERMINAL_ID`); custom labels survive an app plus core restart; adding adoption labels to a live terminal gives it a pane.
- **Briefing and visibility (S3).** A coding agent inside a terminal carries `HC_TERMINAL_ID` (observed in the orchestrator's process environment), so its hooks should inherit it (inferred). `HC_SCOPE` is a kill-group tag, not a credential. `hc get` gives a terminal's parent and status in one call (about 7 ms); `hc ls --json` gives the whole tree (about 33 ms; no `--parent` filter, children found by filtering); `hc events --children-of` streams a parent's children. There is **no** `hc notes` command and no stored report: a report is a published status text (often absent), an `hc send` message typed into the parent and not retrievable, or the screen via `hc read`. **hc has no access control between terminals:** from the orchestrator, an unrelated terminal and a terminal on another machine were readable; the socket is owned by the Unix user; the caller id is self-declared from the environment. So "no one sees more than they should" can be curated by what each briefing includes, not enforced by hc. Hooks: four writers already share SessionStart/UserPromptSubmit (mnemosyne script, Orca, ai-memory in user settings; Brain via its plugin, 3 s, fail-open); herdr-bots has no `.claude/` today; a project hook fires only in sessions rooted in that project. Unverified: whether several hooks' briefings are all delivered and in what order; whether identity spoofing works in practice.

### Questions this round

- Q3-b First main bot: attach today's orchestrator conversation, or drop the separate orchestrator item. Drop option value `scope-drop:The orchestrator as a permanent bot`.
- Q3-c Visibility: limit the briefings only, add a Claude-only guard, or a real lock.
- Q3-d View base: improve the owner's current sidebar (drops Scope item 1 as worded; the held replacement is raised on that answer), or keep herdr-space-groups.
- Q3-e Look: animated character like Herdr-pets, character plus colour like Automagik, or an uploaded picture.

## Round 4 lead notes

The Round 3 "Open" and "Assumed" lists above are kept as history; the lists below supersede them. The standing plain-language rule for questions (Round 2) still applies.

### How the owner's round-4 answers read (plain)

- **R3-1, "Improve your sidebar".** The bot view is built by improving the owner's own sidebar copy (the one that draws the nested tree in the R2-3 screenshot), not by adapting herdr-space-groups. The picked option carried the drop of Scope IN item 1 as worded; the replacement held in round 3 is raised this round, verbatim as held.
- **R3-2, "its not about limiting, its about automatically injecting context that matter so that they dont have to look in the first place."** The parent-and-children rider is a **curation** rule, not a visibility lock: each team member's briefing should already carry what matters (its parent's and its own children's state) so it has no reason to go and read other agents. No guard and no lock are wanted. Q3-c closes on this answer. The Scope IN item still reads "each team member gets only its parent's and its children's context"; I read "only" as "what its briefing contains", not as a restriction on what the agent may look at. The item's text is not edited here; if the wording should change, that is its own question.
- **R3-3, "Attach it as first main bot".** "The orchestrator as a permanent bot" stays in scope, read as: the conversation that runs this project today is attached, as an ordinary attach, as this project's first main bot. No special work beyond the attach flow every bot gets.
- **R3-4, "use same pet system as automagik, this is going to be an automagik mod, so lets use its assets, i want to slightly make herdr automagiky".** Three separate statements, read separately:
  - (a) **Looks are Automagik pets.** Decided: a bot's look comes from Automagik's pet system and its assets. A first look at the Automagik repo shows a real pet system in `apps/bots-dsh` (animated sprite sheets, one row per animation, with a mapping from agent states to animations; `dev/pets/FORMAT.md`). Raised as a scope item this round.
  - (b) **"This is going to be an automagik mod."** Not yet decided what this means. It presses on A3 (the mod pack lives in this repository and is installed by clone into Herdr's mods folder). It could mean branding only, or shipping the mod from Automagik's own catalogue (`marketplace/`, `plugin-lane/` exist there). S3 finds what Automagik can host before the owner is asked. Nothing is moved or renamed.
  - (c) **"Slightly make Herdr automagiky."** Breadth unknown: pets on bot rows only, or also the Herdr-pets strip, or also Automagik colours elsewhere in Herdr. Held under Open as a question; not raised as a scope item in this wording.

### Council decisions against the owner's answers (update)

| P | Status after round 4 | Why |
|---|---|---|
| P1, P2, P3, P5, P7 | Unshaken | Mechanism for tying a pane to a saved bot. |
| P4 | Moot in fleet form (round 3) | Survives only as "bot defined but no pane". |
| P8, P14 | Confirmed (round 3) | Main bot → team → helpers by default parentage. |
| P9 | Reshaped (round 3) | The project's bot definitions file; it now also names each bot's pet. |
| P10 | Partly superseded (round 3), sharpened by R3-2 | The per-turn briefing is first cut and is a context-injection job only; no access control is built. |
| P13 automated binder | Still moot, not closed | Needs a plain reopen of R1-3. |
| Dissent's "looks from a table keyed by template" | Superseded by R3-4 | Looks are Automagik pets chosen per bot. |

### Scope

- Removed on the owner's answer (R3-1): "Bot view: a Herdr mod pack adapted from herdr-space-groups that shows bots (human name, role, look, status, permanent vs disposable, who reports to whom) instead of raw terminals".
- Raised this round (mine), each sourced:
  - "Bot view: improve the sidebar tree Herdr already draws so it shows bots (human name, role, look, status, permanent vs disposable, who reports to whom), with each bot's helpers folded under it with a count" (R3-1, held verbatim in round 3).
  - "Each bot's look is an Automagik pet taken from Automagik's own pet assets, animated by the bot's status" (R3-4 (a)). If S1 finds the assets are generated or hosted rather than shipped in the repository, this item has an outside dependency, and the design says so. S1 answer: no hosted dependency. Genie ships as files; the other characters are drawing code in Automagik's repository; the only outside tool is Automagik's one-off export script (Chrome plus playwright), needed only if full animation frames are wanted (Q4-e).
- Kept: "The orchestrator as a permanent bot" (R3-3: attach as first main bot); "The Herdr-pets mod added, as the owner asked"; the rest unchanged.
- Not raised, held under Open: "an Automagik mod" (R3-4 (b)) and "slightly automagiky" (R3-4 (c)).

### Size

G stands. Pieces: (1) bot view in the owner's sidebar with folded helpers and pets; (2) bot definition file, create/attach flow, launch binding; (3) the per-turn briefing hook. (2) is the foundation of (1) and (3). The pet work sits in (1) and may split out if the asset pipeline is large (S1, S2).

### Candidate acceptance criteria (drafted from Settled answers only; not agreed)

C1–C5 as in round 3. Changed:
- C6 (revised by R3-2). A team member's briefing carries its parent's and its own children's current state, so it does not need to read other agents to know them. Nothing stops it from looking; no guard or lock is part of the design.
- C7 (revised by R3-1, R3-4). In the owner's sidebar, a bot's row shows its name, its Automagik pet, its live status (the pet's animation follows it) and whether it is a main bot, a team member or a helper; helpers fold under their bot with a count.
- C8 (new, R3-3). This project's running orchestrator conversation can be attached as its first main bot without restarting it, and from then on shows as that bot.

### WRS

| Dimension | Score | Evidence |
|---|---|---|
| Problem | 14/20 | R1-1 vision, R2-3 shape, R3-2 says what the briefing is for (inject what matters so agents need not look), R3-4 sets the feel (Automagik pets). Still unsaid by the owner: what must be readable at a glance with ~50 agents (C7 is a lead draft). Unchanged after the scouts: they found facts, not intent. |
| Scope | 13/20 | View base (R3-1) and orchestrator item (R3-3) settled; looks direction (R3-4). The scouts bounded what "an Automagik mod" can mean (S3: Automagik's catalogue and update channel carry only DSH plugins) and what "its assets" are (S1: one shipped pet file, 21 characters as drawing code), but the owner has not chosen; home, roster, motion and breadth are asked this round. Unchanged. |
| Decisions | 14/20 | No owner answer landed since the round-4 answers (already counted). Four decisions asked this round (Q4-a home, Q4-e motion, Q4-f roster, Q4-b breadth); the Herdr-pets strip, the acceptance bar and the binder wait. Unchanged. |
| Risks | 15/20 | Round-3 inferences now tested read-only (S4): custom labels survive a core restart (confirmed, 23 live terminals kept `where` across the 19:02 restart; an app-only restart not observed); the Herdr app process carries no `HC_*`, so a mod-started `hc run` has no default parent (strong, untested end to end); Claude Code hooks inherit the agent's environment and all hooks' `additionalContext` values are delivered, order undocumented (docs). New risks are known, not guessed: `image()` is documented for SVG/PNG/JPEG, WebP undocumented although the binary links a WebP decoder; no crop or object-fit API, so an atlas must be pre-sliced; Herdr's guide forbids timer animation (whole-window redraw), frame-stepping on ~50 rows is unmeasured; Automagik's characters use CSS `color-mix()` inside SVG gradients, untested in Herdr's SVG renderer; Genie art author unrecorded and the first eight mascots may come from the DeepSeek-Bot upstream (Apache-2.0, its NOTICE must travel); `bake-catalogue.mjs` fixes one colour per character. Mitigations drafted under Assumed, not agreed. |
| Criteria | 5/20 | C1–C8 drafted; C6 and C7 sharpened by R3-2 and R3-4. None agreed by the owner; Criteria moves only on that agreement. C7 will be rewritten by Q4-e/Q4-f, so the bar is not asked this round. Unchanged. |
| **Total** | **61/100** | |

### Gap map

- Settled: R1-1, R1-2, R2-1, R2-2, R2-3, R2-4 (rounds 2-3); R3-1 view base = owner's sidebar; R3-2 briefing is curation, no lock; R3-3 orchestrator attached as first main bot; R3-4 (a) looks are Automagik pets.
- **G-pet (what a pet is, where its assets come from)**: closed on facts (S1). How a bot picks one is now an owner choice: asked, Q4-f (roster).
- **G-render (can the sidebar draw and animate a pet)**: mostly closed on facts (S2): SVG and PNG draw; no crop; native motion only bobs, fades and slides; frame-stepping needs a timer Herdr's guide forbids. How much motion is an owner choice: asked, Q4-e. Two host facts still untested (does `image()` decode WebP and play animated WebP by itself; does Automagik's character SVG render in Herdr): first job of round 5's scout.
- **G-home ("an Automagik mod")**: facts found (S3: Automagik's catalogue and update channel are DSH-only; Herdr shares mods as GitHub repos tagged `herdr-mod`). Asked: Q4-a.
- **G-facts (round-3 inferences)**: closed except hook order (S4). Labels survive a core restart; no `HC_*` in the app process; hooks inherit the agent's environment; all briefings delivered, order undocumented.
- **G-breadth ("slightly automagiky")**: asked, Q4-b.
- **G-licence (art provenance)**: new, a Risks line, not an owner question yet: who drew Genie v5; whether the first eight mascots are DeepSeek-Bot's; the Apache-2.0 NOTICE that must travel with copied art.
- G-strip (Herdr-pets strip vs the bots' pets): owner question, waits (A7 default stands).
- G-criteria (C1–C8 as the bar): owner question after Q4-e/Q4-f rewrite C7; the only way Criteria moves.
- G-binder (R1-3 closure): owner reopen, low priority.
- Closed this round: Q3-c (by R3-2); Q3-g logo reuse, moot: looks now come from Automagik's assets, and the Herdr-pets mod is added as shipped, so the bot view reuses no Herdr-pets logos. Folders beside bots (O6): moot, space-groups is out (R3-1).

### Open

Asked this round: Q4-a (home), Q4-e (pet motion), Q4-f (pet roster), Q4-b (breadth). See Questions this round. Waiting, ranked:
1. Q4-c The Herdr-pets strip: shown as shipped beside the bot view (A7), or its walking pets wear the bots' Automagik pets (a change to someone else's mod). After Q4-e/Q4-f.
2. Q4-d Confirm C1–C8 as the acceptance bar, with C7 rewritten from Q4-e/Q4-f's answers.
3. Q3-f Close the automated binder: reopen R1-3 quoting "explain better this is too complex to me" → "no automatic labelling; a pane becomes a bot only when started or attached as one".
4. Parked: letting the main bot create team bots (a reopen of R2-3; ask only if the owner raises it); reach across machines (O8); what "dsh next" means (O2-10, out of first cut); whether the briefing item's word "only" should be reworded (R3-2 reading above).
5. Facts for the design, not the owner (round 5's scout, writing only a scratch file under the app home outside `mods/`, with the owner's permission for that write): does `image()` draw a `.webp`, and does it play an animated WebP by itself; does one of Automagik's character SVGs (with `color-mix()` stops and a mask) render through `image()`; does `image()` accept an absolute path; is a parent `overflow_hidden` clip honoured for an `image()` child. Also still open: hooks' delivery order (docs read only to character 100,000 of 284,258); whether `hc run` falls back to process ancestry for its parent as `hc send` does.

### Assumed

- A1, A4/A8 stand (herdr-core and the Herdr app binary unchanged). S3 adds: Automagik is unchanged too unless Q4-a's third option is picked.
- A3 kept, now asked (Q4-a): the work happens in this repository as a mod pack installed by clone, shareable Herdr's way (a GitHub repo tagged `herdr-mod`). S3 found nothing in Automagik that could install it instead.
- A2 (narrowed), A6, A7, A10, A12, A13 as in round 3.
- A9 revised by S1: a bot's look mirrors Automagik's own avatar shape so "same pet system" is literal: `{ shape, color }` for a character, or `{ pet: { source, id, version } }` for a pet such as Genie (Automagik's `state.json`, `roster.js:78-93`). Default shape and colour from a hash of the bot's id, as `lookOf()` does.
- A11 strengthened by S4: the app process carries no `HC_*`, so a mod-started `hc run` passes `--parent <main bot's terminal>` (or `--no-parent`, as machine-add does) explicitly. Still inferred end to end; the one way it could be wrong is if `hc run` falls back to process ancestry the way `hc send` does.
- A14 revised by S4: Claude Code delivers every hook's `additionalContext` (each up to 10,000 characters) but documents no order, so the briefing is self-contained and never relies on its position among the Brain, ai-memory, Orca and mnemosyne blocks.
- A15 revised by R3-1: per-bot folding with a count is ported from Herdr's shipped agents list into the owner's sidebar copy; the bot's name and pet replace the row label and app icon there.
- A16 revised by S1: "what Automagik ships" is two different things: one ready-made pet file (Genie, v2 atlas plus sleep strip, 2.4 MB) and 21 characters plus Omni drawn by code. Which ones are the first-cut set is asked (Q4-f). Making new pets stays out of scope unless the owner asks.
- A17 (new, S2). Pet pictures ship inside the mod pack as files Herdr documents (SVG or small PNG), written under the app home but outside `mods/<name>` when generated at run time (a write inside a mod folder hot-reloads it). WebP, absolute paths and image cropping are not relied on until tested.
- A18 (new, S1). Copied Automagik art carries Apache-2.0: the licence, the NOTICE attributions (Automagik's and, for vendored characters, DeepSeek-Bot's), and a mark on changed files. No trademark rights come with it.

### Dispatch this round

Four read-only worker scouts: S1 Automagik's pet system and assets, S2 whether the owner's sidebar can draw and animate a pet, S3 what "an Automagik mod" could mean in Automagik's repository, S4 the round-3 inferences checked without starting anything. No council: the owner did not ask, and no open decision is both contested and hard to reverse yet (Q4-a may become one after S3). No questions until the scouts report. Nothing is installed, cloned, started or moved.

Deviation from the plan: the plan named five questions (home, breadth, Herdr-pets strip, acceptance bar, binder). The batch holds four, and the scout facts opened two owner decisions the plan did not foresee: how much a pet moves (S2: Herdr's guide forbids timer animation) and which pets are in the first cut (S1: one ready-made pet file, the rest drawing code). Those two, with home and breadth, are asked. The strip waits because A7's default (install Herdr-pets as shipped) is safe and the answer depends on the pet choices; the acceptance bar waits because C7 is rewritten by the motion and roster answers; the binder stays low priority.

### What the scouts found (facts, not decisions)

- **Automagik's pet system (S1).** Pets are the Codex pet format: a folder with `pet.json` and one `spritesheet.webp` atlas (192x208 cells, 8 columns; v2 1536x2288, 11 rows: idle, running right/left, waving, jumping, failed, waiting, running, review, two look rows), plus Automagik's own `sleep.webp` strip (six cells, played after 10 minutes idle). Code in `apps/bots-dsh` (`src/client/pet.js`, `pet-bake.js`, `src/host/pets.js`, `dev/pets/FORMAT.md`). **Only one pet ships as files:** Genie (`src/host/pets/genie-cosmic`, 2,405,572 bytes). The 21 characters (whale, octopus, star, moon, wave, squircle, bull, blossom, gumdrop, peanut, saucer, bunny, kitty, beacon, plus, magnet, acorn, pebbles, cushion, ring, gem) and Omni are **SVG drawing code** (`src/client/characters.js`), tinted in any colour and baked into atlases in the browser at run time; `characterMarkup(shape, color)` and `bakeMarkup()` return plain SVG with six faces (open, focused, closed, happy, asleep, sad). `dev/pets/bake-catalogue.mjs` exports all 22 as Codex packages but needs Chrome and playwright and fixes one colour per character. codex-pets.net is an optional picker source, never needed to wear a pet. A bot record names its look in `state.json`: `avatar = { shape?, image?, pet?: { source, id, version, sleep? } }` plus `bot.color`; a photo wins over a pet; default shape and colour come from a hash of the bot's id. State to animation: working/thinking/sending → running, searching → review, alert → waiting, done → jumping once, failed → failed, sleeping → sleep strip. Licence: Apache-2.0 throughout, no carve-out for art; `apps/bots-dsh` is vendored from DeepSeek-Bot (Apache-2.0), whose NOTICE travels with derived parts; no third-party pet art is shipped. Unknown: who drew Genie v5; whether the first eight mascots are DeepSeek-Bot's; the size of an exported catalogue.
- **Can the owner's sidebar draw and animate a pet (S2).** `image()` is documented for "SVG, PNG, JPEG and other GPUI image formats"; WebP is not named, though the Herdr binary links a WebP decoder (`image-webp 0.2.4`) and the update-notes viewer plays animated WebP. Paths are documented only relative to the app home; files a mod writes there at run time draw (space-icon's pattern). There is **no crop, sprite or object-fit API**; scaling is by sizing the element. Native motion is `.frames()` (text only), `.spin()`, `.loop()` (opacity, size, position) and transitions; none steps sprite cells, so frame-stepping needs a timer, and Herdr's guide says "Animate natively, never with a timer. Every redraw of a mod redraws the whole window" (AGENTS.md:830-838). A retained per-row view (`cx.new`) limits the rebuild to that child; whether that avoids the window redraw cost is undocumented. Herdr-pets draws small SVGs only, with one 3-second timer and native bob, blink and glide loops, capped by strip width (5 pets at 320 px). Pre-slicing Genie's atlas into small PNG frames once is feasible (ffmpeg and dwebp are on this host). The owner's `spaces-agents` rows are 26 px high and already draw `image()` icons beside the status ring.
- **What "an Automagik mod" can mean (S3).** Automagik is a repository of DeepSeek Harness (DSH) plugins plus a desktop app. Its `marketplace/` index and signed `plugin-lane/` update channel carry only DSH packages (`engines.dsh`, a closed source allowlist); nothing in Automagik reads Herdr's mods folder. The checked-out tree has no reference to Herdr; git history on a wish branch holds a draft, unscheduled RFC 0006 "Herdr terminal mode" (a planned `@automagik/herdr-dsh` that treats Herdr as a chat kind inside Automagik). Herdr's own sharing route is a public GitHub repo tagged `herdr-mod`, copied into `~/.config/herdr-app/mods/`; that needs no change to Herdr, herdr-core or Automagik. Automagik 3.51.0 is installed and running on this host; Herdr-pets is not installed. The `genie` bot kind is added by the separate genie-dsh plugin (one Genie per git repository) and wears the Genie pet.
- **Round-3 inferences (S4).** Custom labels survive a herdr-core restart: confirmed (23 live terminals created before the 19:02 core restart kept their `where` label; an app-only restart and a bot-style label key not observed). The Herdr app process has no `HC_*` variables, so a mod's `exec`/`hc` call has no terminal to be its default parent (strong; machine-add passes `--no-parent` explicitly). Claude Code hooks inherit the agent's environment (docs). Several hooks' `additionalContext` values on one event are all delivered, each capped at 10,000 characters, in no documented order (docs, read to character 100,000 of 284,258).

### Questions this round

- Q4-a Home ("an Automagik mod"): this repository with Automagik's look, a folder inside Automagik, or delivered by Automagik's app (needs Automagik's update channel taught a new package kind).
- Q4-e Pet motion: a pose per status with Herdr's native motion, or full Automagik frame animation on a timer.
- Q4-f Pet roster: all Automagik characters in each bot's colour, Genie only, or also Codex pets.
- Q4-b Breadth ("slightly automagiky"): bot rows only, plus an Automagik colour theme, or plus Automagik marks around Herdr.

## Round 5 lead notes

The Round 4 "Open" and "Assumed" lists above are kept as history; the lists below supersede them. The standing plain-language rule for questions (Round 2) still applies. The round-4 option descriptions were not found in any stored workflow state on this host, so the answers below are read from the picked labels and the question texts recorded in Settled.

### How the owner's round-5 answers read (plain)

- **R4-1, "This repo, Automagik look".** "An Automagik mod" means the look, not the home: the bot pack lives in this repository and reaches Herdr the way Herdr shares mods (copied into Herdr's mods folder). Automagik is not changed and does not deliver it. A3 is now settled, not assumed.
- **R4-2, "A pose per status".** One still drawing per status (working, idle, needs you, done, failed, asleep), moved only by Herdr's free built-in motion (bob, fade, slide). No frame-by-frame animation and no timer. This retires the round-4 risk about timer redraws on ~50 rows. The Scope IN item still says "animated by the bot's status"; I read "animated" as "pose plus Herdr's built-in motion", per R4-2. The item text is not edited; a rewording would be its own question.
- **R4-2 + R4-3, "All Automagik characters".** Every one of the characters Automagik draws by code (21 plus Omni), each drawn in the bot's own colour. Genie is treated as outside this pick (A19): in Automagik's own vocabulary Genie is a ready-made *pet* file, the others are *characters*; Genie cannot take a bot's colour and would need its picture sheet cut into poses. Revisit only if the owner names Genie.
- **R4-4, "Plus Automagik colours" (not the recommended option).** Besides pets on bot rows, Herdr itself takes Automagik's colours. Not included: Automagik marks around Herdr (the third option). Raised as a scope item this round. How the colours reach Herdr is now a fact (below); whether installing the pack switches Herdr to them is asked (Q5-c).

### Facts the lead read this round (no scouts)

- **Herdr themes.** A theme is one small file in Herdr's themes folder (`~/.config/herdr-app/themes/<name>.json`: background, foreground, selection, cursor, 16 terminal colours, optional named panel colours); new theme files appear in Settings by themselves; a layout or settings can name one theme per appearance (`{light, dark}`), and the theme picker overrides both (AGENTS.md:302-316, 612-617). The themes folder is outside `mods/`, so installing by copying a mod folder alone does not install a theme; the install step must place the theme file too.
- **Automagik's look.** Automagik's default theme ("Automagik", internal id `deepseek`, from `stage.js`) is eight colours per mode, light and dark (`STAGE_LIGHT` bg `#f6eee2` … accent `#007087`; `STAGE_DARK` bg `#1e1923` … accent `#7fd8ea`; apps/bots-dsh/src/client/stage.js:12-13, themes.js:12-20). It names no terminal colours. Its 19 named colours (`inks.js:2-9`) include red, green, yellow, blue, magenta, cyan, black and gray, so Herdr's 16 terminal colours can be taken from Automagik's own palette rather than invented.
- **Character colour.** Automagik's character drawing uses CSS `color-mix()` for its gradient stops for every colour except `aurora` (`GRADIENTS` holds only aurora; characters.js:129,162). The mod computes those two mixed colours itself and writes plain colours into the drawing, so nothing depends on Herdr's SVG renderer understanding `color-mix()`. The drawing's mask is still untested in Herdr.
- **Genie provenance.** The Genie pet was committed to Automagik by the owner on 2026-10-26 (`091ce72`); its `pet.json` names no artist. Moot for the first cut under A19.

### Council decisions against the owner's answers (update)

| P | Status after round 5 | Why |
|---|---|---|
| P1, P2, P3, P5, P7 | Unshaken | Mechanism for tying a pane to a saved bot. |
| P4 | Moot in fleet form (round 3) | Survives only as "bot defined but not running". |
| P8, P14 | Confirmed (round 3) | Main bot → team → helpers by default parentage. |
| P9 | Reshaped (rounds 3-4) | The project's bot definitions file; names each bot's character and colour. |
| P10 | Partly superseded (round 3), sharpened by R3-2 | Per-turn briefing is first cut; context injection only. |
| P13 automated binder | Still moot, not closed | Asked this round (Q5-d, reopens R1-3). |

### Scope

- Raised this round (mine), sourced: "An Automagik colour theme for Herdr, in light and dark, built from Automagik's own look" (R4-4).
- Kept unchanged: the ten live items. Two wordings read against later answers, not edited: "animated by the bot's status" (read per R4-2 as a pose plus built-in motion) and "Automagik's own pet assets" (read per R4-3 as Automagik's drawn characters).
- At stake this round: "The Herdr-pets mod added, as the owner asked" (Q5-b offers its drop as one option; the item stays until the owner picks it).

### Size

G stands. Pieces: (1) bot view in the owner's sidebar with folded helpers and character poses; (2) bot definition file, create/attach flow and launch binding; (3) the per-turn briefing hook; (4, small) the Automagik theme and the Herdr-pets strip. (2) is the foundation of (1) and (3).

### Candidate acceptance criteria (drafted from Settled answers only; not agreed)

Asked as one bar this round (Q5-a). Theme and strip checks ride with their own questions so each answer settles only its own check.
- C1. Creating a bot in Herdr (name, character and colour, role and instructions, coding agent) saves it with the project; a teammate who opens the same project sees the same bot (R2-1).
- C2. A bot that is defined but not running still shows in the sidebar, marked not running, never missing (R1-1).
- C3. Starting a bot opens a pane running its coding agent and ties it to the bot; attaching a bot to an already running pane does the same without restarting it (R1-1).
- C4. Anything a bot starts appears folded under it with a count and disappears when its work ends; it gets no name or character of its own (R2-3).
- C5. Before each turn, a main bot running on Claude quietly receives each team member's status (working, stuck, finished, idle) and latest report, with nothing typed into its pane (R2-2; A13 for "latest report").
- C6. A team member's briefing carries its parent's and its own children's state, so it need not look at other agents; nothing stops it from looking (R2-2, R3-2).
- C7 (rewritten from R4-2, R4-3). In the sidebar, each bot's row shows its name, its Automagik character in its colour in a pose for its status (working, idle, needs you, done, failed, asleep) moved only by Herdr's built-in motion, and whether it is a main bot, a team member or a helper. A bot that needs you is visible without opening any pane.
- C8. This project's running orchestrator conversation can be attached as its first main bot without restarting it, and shows as that bot from then on (R3-3).
- C9 (new, R4-1). The pack installs from this repository by copying into Herdr's mods folder (plus its theme file), with no change to Herdr, its terminal service or Automagik.
- C10 (from Q5-c's answer). The theme check: either Herdr shows Automagik's colours after install, light or dark following the system, or Settings offers the Automagik theme.
- C11 (from Q5-b's answer). The strip check: either a bot walks in the strip as its own character, or Herdr-pets runs as shipped, or neither (dropped).

### WRS

| Dimension | Score | Evidence |
|---|---|---|
| Problem | 15/20 | R4-1..R4-4 set the feel concretely (Automagik look, characters in the bot's colour, poses, Automagik colours in Herdr). What must be readable at a glance is written into C7 but not yet agreed (Q5-a). |
| Scope | 16/20 | Home (R4-1), motion (R4-2), roster (R4-3) and breadth (R4-4) settled; the theme item raised. Open: the Herdr-pets strip (Q5-b) and the theme's delivery (Q5-c). |
| Decisions | 17/20 | Four answers landed. Open owner decisions: strip, theme switch-on, binder closure, the bar. Everything else is closed or recorded as an assumption with its source. |
| Risks | 16/20 | Retired: timer redraw cost (R4-2), WebP and frame-cropping (no raster pets under A19), `color-mix()` (computed in the mod). Known and mitigated: theme file sits outside the mods folder (install step), Automagik's look has no terminal colours (taken from its named palette), labels survive a core restart (round 4). Still untested: the character drawing's mask and an `image()` of a run-time-written SVG on this host; whether `hc run` from the app falls back to process ancestry for a parent (A11 passes it explicitly); hook delivery order (A14 makes the briefing self-contained). |
| Criteria | 5/20 | C1–C11 drafted; none agreed. Moves only on Q5-a and on Q5-b/Q5-c's checks. |
| **Total** | **69/100** | |

### Gap map

- Settled: R1-1, R1-2, R2-1..R2-4, R3-1..R3-4, R4-1 home (this repo, Automagik look), R4-2 pose per status, R4-3 all drawn characters, R4-4 Automagik colours.
- **G-criteria**: C1–C9 asked as the bar (Q5-a). Blocks crystallize.
- **G-strip**: asked (Q5-b). Sets C11 and possibly drops a scope item.
- **G-theme-delivery**: facts found this round; switch-on vs offered asked (Q5-c). Sets C10.
- **G-binder** (R1-3 closure): asked (Q5-d, reopens R1-3).
- Closed this round on facts or answers: G-home (R4-1), G-render (R4-2 removes frame-stepping; colour mixing computed in the mod), G-licence for Genie (moot under A19; art copied from Automagik still carries Apache-2.0 and its NOTICE, A18), G-breadth (R4-4).
- Closed as settled by earlier answers, not open: who creates team bots (R2-3's picked option: the owner); the word "only" in the briefing item (read per R3-2's explicit answer); reach across machines (bots belong to a project, A2); dsh (owner: "next", out of the first cut, A6).
- After this round's answers, a clean set (Q5-a agreed, Q5-b to Q5-d answered) leaves nothing under Open and allows crystallize next round.

### Open

Asked this round: Q5-a (the bar), Q5-b (Herdr-pets strip), Q5-c (theme at install), Q5-d (automatic tagging, reopens R1-3). Nothing else waits.

### Assumed

- A1, A4/A8 stand: Herdr, herdr-core and Automagik are unchanged (R4-1 confirms Automagik).
- A2 (narrowed), A6, A7 (until Q5-b), A10, A12, A13, A14, A15, A17, A18 as in round 4.
- A3 settled by R4-1 (no longer an assumption).
- A9 revised by R4-3: a bot's look is `{ character, colour }` from Automagik's 21 drawn characters plus Omni and its 19 named colours; default from a hash of the bot's id, as Automagik's `lookOf()` does.
- A11 as in round 4: a team member started from Herdr is given its main bot as parent explicitly.
- A16 superseded by A19.
- A19 (new). Genie is not in the first-cut roster: R4-3's "All Automagik characters" is read in Automagik's own vocabulary (characters are drawn by code; Genie is a pet file that cannot take a bot's colour). Revisit only if the owner names Genie.
- A20 (new). Pose per status uses Automagik's six faces: working → focused, idle → open, needs you → closed eyes with an alert motion, done → happy, failed → sad, asleep → asleep; the motion for each is Herdr's built-in bob, fade or slide. The face per status is a design detail, not an owner decision.
- A21 (new). The Automagik theme for Herdr is two theme files (light and dark) built from `STAGE_LIGHT`/`STAGE_DARK` for background, foreground, selection and accent, with the 16 terminal colours taken from Automagik's named colours; the install step copies them into Herdr's themes folder. Whether installing also switches Herdr to them is Q5-c.
- A22 (new). The mod resolves Automagik's colour mixing itself and writes plain colours into each character drawing; it never relies on `color-mix()` in Herdr's SVG renderer.

### Dispatch this round

No scouts and no council. The round's facts (Herdr theme files, Automagik's theme and palette, the character drawing's colour mixing, Genie's provenance) were read directly by the lead in a few targeted reads; the round-4 rendering tests needed a write under Herdr's app home that the owner never approved, and R4-2 plus A22 made most of them moot. Council allowance is spent (1 of 1 without asking) and no open decision is both contested and hard to reverse. Expected spend: this lead pass only.

### Questions this round

- Q5-a The bar: are C1–C9 the checks that prove the first version works?
- Q5-b The Herdr-pets strip: bots walk as their own character (a copy of Herdr-pets in this repository), installed as shipped, or left out (`scope-drop:The Herdr-pets mod added, as the owner asked`).
- Q5-c Theme at install: switch Herdr to Automagik colours, or only add them to Settings.
- Q5-d Automatic tagging (reopens R1-3): no automatic tagging, or keep a helper that tags panes it thinks belong to a bot.

## Round 6 lead notes

The Round 5 "Open" and "Assumed" lists above are kept as history; the lists below supersede them. The standing plain-language rule for questions (Round 2) still applies. All four round-5 questions were answered with the options round 5 named as a clean set, so this round crystallizes: no scouts, no council, no new questions.

### How the owner's round-6 answers read (plain)

- **R5-1, "Yes, these nine".** C1–C9 below are the agreed acceptance bar, word for word as the question put them. The question's own text also settles that Genie is not among the characters (A19 is no longer an assumption) and sent the theme and the strip to their own questions.
- **R5-2, "Leave it out".** The Herdr-pets strip is not part of the work. Its Scope IN item is removed on this answer (value `scope-drop:The Herdr-pets mod added, as the owner asked`), as R2-4 and R3-1 were. A7 (install Herdr-pets as shipped) is retired. The bot view reuses nothing from Herdr-pets.
- **R5-3, "Switch on at install".** Installing the bot pack switches Herdr to the Automagik colours, light or dark following the system. This is the theme check (C10). How a copy-only install can switch a theme is a fact, read this round (below), and pinned as A23.
- **R5-4, "No automatic tagging" (reopens R1-3).** No background helper labels panes. A pane becomes a bot only when it is started as one or attached to one. P13 is closed.

### Facts the lead read this round (no scouts)

- **A mod can place and select a theme itself.** `writeTextFile(path, text, expected)` writes on this computer, creating a file when `expected` is null (herdr.d.ts:26-28; AGENTS.md:917-918); `appHome()` names `~/.config/herdr-app` (herdr.d.ts:20). `app.theme {name}` is an app command a mod can run (AGENTS.md:566; herdr.d.ts:74); it sets the half (light or dark) that matches the theme's lightness, and the theme menu writes the shown layout's root `theme` (AGENTS.md:302-306, 331-332). New `themes/*.json` files appear without a restart (AGENTS.md:258). So the pack can still install by copying into the mods folder alone (C9): on its first load it writes the two theme files and selects them. The C9 / R5-3 tension noted in round 5 ("the install step must place the theme file too") is resolved by this, not by a separate install script.
- **The character mask fails safe.** In Automagik's drawing the mask only cuts eye holes in the body, and the eyes are drawn on top of those holes with the same shape (characters.js:106-107, 140-141). If Herdr's SVG renderer ignored the mask, the character would still show with its eyes; it would not blank. Gradient stops use `color-mix()` only for non-aurora colours (characters.js:136), which A22 already resolves in the mod.

### Council decisions against the owner's answers (update)

| P | Status after round 6 | Why |
|---|---|---|
| P1, P2, P3, P5, P7 | Unshaken, carried into the design | Mechanism for tying a pane to a saved bot: a bot id label outside `herdr.*`, written when Herdr starts or attaches the bot; live only with an agent in the foreground. |
| P4 | Survives as C2 only | "Defined but not running" is shown, never missing. |
| P8, P14 | Confirmed | Main bot → team → helpers by default parentage; reports go one level up. |
| P9 | Reshaped | The project's bot definitions file, the primary object (R2-1); names each bot's character and colour (R4-3). |
| P10 | Partly superseded, sharpened by R3-2 | The per-turn briefing is first cut (a coding-agent hook, Claude first); respawn, schedules and memory stay later. |
| P6, P11, P12 | Superseded (rounds 2-3) | |
| P13 automated binder | **Closed by R5-4** | No automatic tagging. |

### Scope

- Removed on the owner's answer (R5-2): "The Herdr-pets mod added, as the owner asked".
- Kept, ten items, verbatim. Three wordings lag what the owner later settled; they are not edited (a rewording would cost a question and change nothing), and the design cites the Settled answer, not the label:
  - "Each bot's look is an Automagik pet taken from Automagik's own pet assets, animated by the bot's status": "pet assets" means Automagik's drawn characters, all of them, in the bot's colour (R4-3), Genie excluded (R5-1); "animated" means one pose per status moved only by Herdr's built-in motion (R4-2, R5-1 check 7).
  - "A quiet per-turn briefing: … each team member gets only its parent's and its children's context": "only" describes what the briefing carries, never a restriction on what an agent may look at (R3-2, R5-1 check 6).
  - "Bot view: improve the sidebar tree Herdr already draws so it shows bots (… permanent vs disposable …)": "permanent vs disposable" is shown as main bot / team member / helper (R5-1 check 7).
- Nothing raised this round.

### Size

G stands, and the design splits it into ordered groups: (1) bot definitions file plus create, start and attach (the foundation); (2) the bot view in the owner's sidebar with folded helpers and character poses; (3) the Claude per-turn briefing hook; (4, small) the Automagik theme switched on at first load. (2), (3) and (4) build on (1); (4) is independent of (2) and (3).

### Acceptance criteria (agreed)

- C1–C9: exactly the nine checks in R5-1's question text, agreed by the owner ("Yes, these nine").
- C10 (from R5-3's answer): after the pack is installed, Herdr shows the Automagik colours without the owner picking them, light or dark following the system; both Automagik themes are also listed in Herdr's Settings. R5-1 sent the theme check to its own question, and R5-3 is that question, so this check is the owner's.
- C11: dropped with the strip (R5-2).

### WRS

| Dimension | Score | Evidence |
|---|---|---|
| Problem | 20/20 | R1-1 names the product (one permanent main bot per project, a team under it, attachable to any coding agent); R2-3 its shape; R3-2 what the briefing is for; R4-1..R4-4 the feel. What must be readable at a glance, open until now, is check 7 of R5-1, agreed. |
| Scope | 20/20 | Ten items in, each sourced; the last two opens (strip, theme delivery) closed by R5-2 and R5-3. Out, by the owner: today's team as bots (R2-4), herdr-space-groups as the base (R3-1), the Herdr-pets strip (R5-2), automatic tagging (R5-4), Genie (R5-1), dsh (owner: "next"). |
| Decisions | 20/20 | Every owner decision answered: home, motion, roster, breadth (R4-1..R4-4); bar, strip, theme, binder (R5-1..R5-4). Remaining choices (file name, label key spelling, face per status, sleep timeout) are design details recorded under Assumed with their sources. |
| Risks | 20/20 | Every known risk has a mitigation the design carries, and each still-untested host fact becomes a build-time check with a fallback, not an owner question: the character mask fails safe (eyes drawn over the holes); `color-mix()` resolved in the mod (A22); a run-time-written SVG under the app home draws (space-icon's pattern, round 4 S2); `hc run` falling back to process ancestry is moot because the parent is passed explicitly (A11); hook delivery order is moot because the briefing is self-contained (A14); labels survive a core restart (round 4 S4); timer redraw cost retired by R4-2; a theme outside the mods folder placed by the mod itself (this round's facts); Apache-2.0 notice travels with copied art (A18). |
| Criteria | 20/20 | C1–C9 agreed (R5-1); C10 is R5-3's literal answer; C11 dropped (R5-2). Each check names an observable outcome. |
| **Total** | **100/100** | |

### Gap map

- Settled: R1-1, R1-2, R2-1..R2-4, R3-1..R3-4, R4-1..R4-4, R5-1 (the bar), R5-2 (strip out), R5-3 (theme on at install), R5-4 (no automatic tagging; R1-3 closed). R1-3 and R1-4 are superseded by their reopens (R5-4, R2-3).
- Closed this round: G-criteria (R5-1), G-strip (R5-2), G-theme-delivery (R5-3 plus this round's facts), G-binder (R5-4).
- Blocks within the design (build order, not open questions): group (1) blocks (2) and (3); the first task of (2) checks one character drawing through `image()` on this host before the roster is built out.
- Parked by the owner's own words, outside the first cut: letting the main bot create team bots (would reopen R2-3); dsh support ("next"); Codex, Gemini and Kimi briefings ("Claude first"); memory, schedules and respawn (P10).

### Open

Nothing under Open. No question is asked this round.

### Assumed

- A1, A4/A8: Herdr, herdr-core and Automagik are unchanged (R4-1, R5-1 check 9).
- A2 (narrowed), A6 (dsh out), A10, A12, A13, A14, A15, A17, A18 as in round 4; A9 as revised in round 5; A11 as in round 4; A20, A21, A22 as in round 5.
- A7 retired by R5-2. A19 settled by R5-1's text. A16 superseded (round 5).
- A23 (new, R5-3 plus this round's facts). The theme is switched on by the mod itself, once: on its first load it writes `themes/<automagik light>.json` and `themes/<automagik dark>.json` into the app home if absent and selects both halves; it records that it did so and never selects them again, so a theme the owner picks later is never overridden. "Once" is the plain reading of "at install", not a new decision.
- A24 (new, R2-2's picked option "Claude first, the other agents after"). In the first cut every briefing, the main bot's and each team member's, is delivered only to bots running on Claude; a bot on another coding agent still shows in the view but gets no briefing yet. Check 6 is tested on a Claude team member.
- A25 (new, design detail from Automagik's own rule). "Asleep" (check 7) is idle for 10 minutes or more, as Automagik plays its sleep strip; the threshold is a design constant.

### Dispatch this round

No scouts and no council. Every owner decision is answered, the two host facts this round needed (theme placement from a mod, the mask's failure mode) were read directly, and a scout report could not feed a design written in this same run. The council allowance is spent (1 of 1 without asking) and nothing is contested. Mode: crystallize. Expected spend: this lead pass, plus the script's design write and review.

## Round 7 lead notes

The Round 6 "Open" and "Assumed" lists above are kept as history; the lists below supersede them. The standing plain-language rule for questions (Round 2) still applies. Round 6 crystallized; its design (reviewed content digest `9f1b9a43…`) came back FIX-FIRST with findings C1–C13, HIGH-1, HIGH-2, MEDIUM-1..5, LOW-1 and LOW-2, and one owner question (R6-1, the repository's own licence) was raised from reviewer MEDIUM-5. The owner answered it, so this round crystallizes again: no scouts, no council, no new questions.

### How the owner's round-7 answer reads (plain)

- **R6-1, "Apache-2.0".** The repository's own `LICENSE`, for the code written here, is Apache-2.0. It settles only that file: the two upstream licences (`LICENSE-herdr`, `LICENSE-automagik`) and the `NOTICE` naming both projects were already in the design as obligations, not choices. With all three on Apache-2.0, one licence covers the whole pack.

### What the rewrite must carry (from the answer and the review)

- **Stale lines to close.** Design IN item 7 still says the repository `LICENSE` is "the owner's open question; Apache-2.0 recommended", and Decision 14 names only the upstream licences. The rewrite states Apache-2.0 for the pack's own code (R6-1) and drops the "open question" wording; the Risk 7 mitigation names the repository `LICENSE` too.
- **Review findings, traced as far as the evidence allows.** The current DESIGN.md (digest `770b2f24…`, changed since the reviewed `9f1b9a43…`) cites HIGH-1, HIGH-2, MEDIUM-1..5 and LOW-1 against specific lines, and "reviewer round-2 C4" in its source note. The text of LOW-2 and of C1–C13 was not found in this repository, the DRAFT or the scratchpad (searched this round), and the reviewer's C-numbers do not correspond to this DRAFT's acceptance checks C1–C10. The lead therefore claims no coverage for them: the re-review in this run must check LOW-2 and every C-finding against the rewritten design, and the design writer must not read the reviewer's C-numbers as the acceptance checks.
- **Nothing in the review is an owner decision that is still open.** The only finding that needed the owner (MEDIUM-5, the licence) is R6-1. The others the design already answers are build or mechanism details carried under Assumed below, each with its source.

### Council decisions against the owner's answers (update)

No change from round 6. R6-1 touches no council decision.

### Scope

- **Recording the R5-2 drop.** Round 6's notes removed "The Herdr-pets mod added, as the owner asked" on the owner's answer to R5-2 (value `scope-drop:The Herdr-pets mod added, as the owner asked`), but the ledger state still lists it without a drop. This round's returned Scope IN leaves it out, so the ledger records the drop as approved by R5-2. Nothing else changes.
- Kept, ten items, verbatim. The three wordings that lag later answers ("Automagik's own pet assets, animated by the bot's status"; "gets only its parent's and its children's context"; "permanent vs disposable") are read through R4-2, R4-3, R5-1, R3-2 exactly as round 6 recorded.
- Nothing raised this round.

### Size

G stands, as one wish in four ordered groups: (1) bot definitions plus create, start and attach; (2) the bot view with folded helpers and character poses; (3) the Claude per-turn briefing; (4) the Automagik theme switched on at first load. R6-1 adds one file (`LICENSE`) to group 1's skeleton.

### Acceptance criteria (agreed)

Unchanged: C1–C9 are R5-1's nine checks, C10 is R5-3's answer, C11 dropped with the strip (R5-2). R6-1 adds no check: a licence file is an install-time fact the C9 proof can include (the copied pack carries `LICENSE`, `LICENSE-herdr`, `LICENSE-automagik` and `NOTICE`), not a new behaviour.

### WRS

| Dimension | Score | Evidence |
|---|---|---|
| Problem | 20/20 | Unchanged: R1-1 (one permanent main bot per project you talk to, a team under it, attachable to any coding agent), R2-3 (the tree), R3-2 (briefing is curation), R4-1..R4-4 (the Automagik feel), R5-1 check 7 (what must read at a glance). |
| Scope | 20/20 | Ten items in, each sourced; the R5-2 drop is recorded by this round's returned list. Out by the owner: today's team (R2-4), herdr-space-groups (R3-1), the strip (R5-2), automatic tagging (R5-4), Genie (R5-1), dsh ("next", R1-1). |
| Decisions | 20/20 | Every owner decision is answered; the last open one, the repository licence, is R6-1 (Apache-2.0). Remaining choices (label key spelling, file name, face per status, asleep threshold, `--no-parent`) are design details under Assumed with their sources. |
| Risks | 20/20 | Every known risk has a mitigation in the design, and each untested host fact is a build-time check with a fallback (round 6 table, design Risks 1–11). Licence obligations are now fully specified (R6-1 plus Risk 7). The untraced review findings (LOW-2, C1–C13) are named for the re-review in this run rather than claimed covered; none of them can be an owner decision that is still open, because the reviewer's only owner-level finding (MEDIUM-5) became R6-1. |
| Criteria | 20/20 | C1–C9 agreed (R5-1), C10 is R5-3's answer, C11 dropped (R5-2); each names an observable outcome and the design gives each a proof. |
| **Total** | **100/100** | |

### Gap map

- Settled: R1-1, R1-2, R2-1..R2-4, R3-1..R3-4, R4-1..R4-4, R5-1..R5-4, R6-1. R1-3 and R1-4 are superseded by their reopens (R5-4, R2-3).
- Closed this round: G-licence (R6-1).
- For the rewrite in this run (not owner questions): close the two stale licence lines (IN item 7, Decision 14) and Risk 7's wording; keep every other line; the re-review checks LOW-2 and C1–C13.
- Blocks within the design (build order): group (1) blocks (2) and (3); group (4) needs only (1)'s skeleton; the first task of (2) draws one character through `image()` and confirms `terminals()`'s `program.agent` and `status_ms` on this host; the first attach of group (1) proves a running Claude session picks up a hook written mid-session, else the documented `/hooks` step.
- Parked by the owner's own words, outside the first cut: the main bot creating team bots (would reopen R2-3); dsh ("next"); Codex, Gemini and Kimi briefings ("Claude first"); memory, schedules and respawn (P10).

### Open

Nothing under Open. No question is asked this round.

### Assumed

- A1, A2 (narrowed), A4/A8, A6, A9 (revised round 5), A10–A15, A17, A18, A20–A25 as in round 6. A7 retired (R5-2); A16 superseded; A19 settled by R5-1.
- A18 (updated by R6-1). The Apache-2.0 notice travels with copied art and derived sidebar code, and the repository's own code is Apache-2.0 too, so one licence covers the pack.
- A26 (new, design detail from reviewer HIGH-1, recorded so it is not read as a silent decision). Every bot is started with `--no-parent`, and who reports to whom at the bot level is read from the project's definitions file, not from herdr-core's terminal parent; helpers keep herdr-core's default parent under their bot. This does not change what R2-3 approved: the owner still sees main bot → team → helpers in Herdr's existing tree, and helpers are still Herdr's ordinary children. It only keeps that picture right when a main bot gets a new terminal, because hc fixes a parent at launch and cannot change it. A consequence the design states: herdr-core types no lifecycle notes from a team member into the main bot's pane; the main bot hears about its team through the briefing (R2-2).
- A27 (new, design detail from reviewer HIGH-2 and MEDIUM-3). The briefing hook entry is per person, written to each bot project's `.claude/settings.local.json` and kept out of git with `.git/info/exclude`, never into the shared `.claude/settings.json`. This follows R2-1 (bot definitions travel with the project) without making one person's absolute path a team-wide change.

### Dispatch this round

No scouts and no council. The one owner decision the review raised is answered (R6-1), the rest of the work is a rewrite of named lines plus a re-review the script runs in this same run, and a scout report could not feed that design. The council allowance is spent (1 of 1 without asking) and nothing is contested. Mode: crystallize. Expected spend: this lead pass (~150k tokens), plus the script's design write and review.

## Round 8 lead notes

The Round 7 "Open" and "Assumed" lists above are kept as history; the lists below supersede them. The standing plain-language rule for questions (Round 2) still applies. Round 7 crystallized; its design (reviewed digest `98d5a43e…`) came back FIX-FIRST, the one repair in that run fixed what it could in place and turned the two owner-level findings into R7-1 and R7-2. The owner answered both, so this round crystallizes again: no scouts, no council, no new questions.

### How the owner's round-8 answers read (plain)

- **R7-1, "Right away" (reopens R5-1).** When a team member finishes or gets stuck, the main bot hears about it as it happens, by a short note typed into its pane, and it still gets the quiet briefing before every turn. Check 5 of the agreed bar now reads exactly as the question quoted it: "before each turn, a main bot running on Claude quietly learns each team member's status and latest report through the briefing, and a team member's finish or stuck note is also typed into the main bot's pane as it happens". The option the owner picked named the mechanism and its limits: a team member is started under the main bot's terminal (`--parent <main bot> --outlive-parent`) when the main bot is running, and with no parent otherwise; who is on the team is still read only from `.herdr/bots.json`; members already running keep sending to the old terminal if the main bot moves; a member started while the main bot was down sends none.
- **R7-2, "Out, shown only" (reopens R1-1).** R1-1 stands with one addition: in the first version, bots are created, started and attached in this computer's projects and panes; bots of a project on another machine are shown but not created, started or attached there. This settles reviewer MEDIUM-5 and replaces the OUT row's "this round's owner question" wording.

### Round-7 review disposition (from the run's journal, checked against DESIGN.md on disk)

- Repaired in place by round 7's repair, confirmed present on disk this round: HIGH-1 (role and instructions reach Claude through the briefing; other agents deferred in OUT), MEDIUM-2 (`DS Bot` in the NOTICE, 3 mentions), MEDIUM-3 (one terminal plays a bot at a time, Decision 2), MEDIUM-4 (rename-map import named), MEDIUM-6 (remembered projects and the theme flag in the Simplicity Case), LOW-1 (status mapping `blocked`/`error`/`done`/`idle`/null, Decision 7 and Group 2), LOW-2 (hook path from `appHome()`), LOW-3 (clone file list).
- Answered by the owner: MEDIUM-1 → R7-1; MEDIUM-5 → R7-2.
- LOW-4 needed no change: the round-6 findings C1–C13 and LOW-2 were never in the repository, so they remain untraced by id; the re-review in this run covers them through its own criteria, as round 7's reviewer did. The reviewer's C-numbers are review criteria, not this DRAFT's acceptance checks C1–C10.

### What the rewrite must carry (from R7-1 and R7-2)

1. **IN 3 (DESIGN.md line 26) and Decision 5 (line 84).** Replace "a team member is started with no hc parent" and "Every bot is started with `--no-parent`": a team member is started with `--parent <main bot's live terminal> --outlive-parent` when its main bot has a live terminal at Start, and `--no-parent` otherwise; a main bot is always started `--no-parent`. Membership and placement in the view still come from `.herdr/bots.json` by id, never from the hc parent (the rest of Decision 5 and IN 5 stand); a member whose hc parent is the main bot is drawn once, by definition.
2. **Risk 3 (line 101).** The mitigation no longer rests on "every bot `--no-parent`": the main bot is `--no-parent`, a member's parent is always given explicitly, so process-ancestry fallback cannot pick one; membership never reads the parent.
3. **C5 (line 117).** Replace the criterion text with R7-1's quoted wording word for word (it drops "with nothing typed into its pane"). The proof adds: with the main bot live, Start a team member, drive it to `blocked` and to the end of a task, and see each note arrive in the main bot's pane; the briefing part of the proof stays.
4. **Which notes hc types (fact read this round).** `hc --skill` says hc itself types a note into the parent "when a child cannot report (blocked, error, exited)", and asks every agent to report with `hc send <parent>` "when done or stuck". So stuck (`blocked`), failed (`error`) and exit arrive from hc itself; a finished task (`done` while the agent keeps running) arrives as the member's own report to its parent. The team member's briefing names its parent's address (it already carries its parent's context, R2-2) so that report has a target. The design names this split in C5's proof and makes "does hc type a note on `done`" a build-time check of group 3, with the member's own report as the stated path either way.
5. **New Risk row: notes can be switched off on a host.** `notes = false` in `~/.config/herdr-core/config.toml` makes hc type nothing (`hc --help`); `--no-notify` per terminal does the same. This host sets neither (read this round). Start never passes `--no-notify`; the build-time check of C5 runs with the host's config, and the README names the setting.
6. **A26 is revised, not deleted** (Assumed below), and A28 (attached members) is added; the design states both in Decision 5, C5's proof and the new Risk row.
7. **OUT row on remote projects (line 42).** Drop "whether remote bots are in the first cut is this round's owner question"; cite R7-2; state that Create, Start and Attach act on this computer's projects and panes only, and that bots defined in a remote space's project are read and shown. The true reason (a UI cost: a remote folder picker, plus `briefing.mjs` and `node` on that machine) stays.
8. Keep every other line of the repaired design.

### Council decisions against the owner's answers (update)

No council decision is reversed. Council P-decisions on lineage were already read through R2-3 and R5-4; R7-1 adds a push-note edge for started members and leaves bot-level membership on the definitions file.

### Scope

- Ten items in, verbatim, the same list as round 7. "The Herdr-pets mod added, as the owner asked" stays out: R5-2's answer carries the value `scope-drop:The Herdr-pets mod added, as the owner asked`, so the owner agreed to the drop. **Ledger discrepancy, recorded so it stays visible:** the ledger state still lists that item with no `dropped` stamp, although round 7 also returned the list without it. This round returns the list without it again; if the ledger needs the drop approved by a fresh answer, it should say so rather than keep the item silently.
- R7-2 narrows how the "Bot concept and identity" item is delivered (this computer only), not the item itself; no wording changes.
- Nothing raised.

### Size

G stands, one wish in four ordered groups. R7-1 changes one launch rule in group 1 and adds a proof step to group 3; R7-2 removes no group and adds none.

### Acceptance criteria (agreed)

C1–C4 and C6–C9 are R5-1's checks unchanged; C5 is R5-1's check 5 as reopened by R7-1 (quoted above); C10 is R5-3's answer; C11 dropped with the strip (R5-2).

### WRS

| Dimension | Score | Evidence |
|---|---|---|
| Problem | 20/20 | R1-1 as narrowed by R7-2 (a permanent main bot per project you talk to, a team under it, on this computer first); R2-3 the tree; R3-2 the briefing as curation; R7-1 the main bot is woken by its team; R4-1..R4-4 the Automagik feel. |
| Scope | 20/20 | Ten items in, each sourced. Out by the owner: today's team (R2-4), herdr-space-groups (R3-1), the strip (R5-2), automatic tagging (R5-4), Genie (R5-1), remote create/start/attach (R7-2), dsh ("next", R1-1). |
| Decisions | 20/20 | Every owner decision answered; the last two review-raised ones are R7-1 (live notes plus briefing) and R7-2 (remote shown only). Remaining choices are design details under Assumed with sources (A26 revised, A28, A29). |
| Risks | 20/20 | Design Risks 1–11 carry mitigations or build-time checks with fallbacks; this round adds the notes-off risk with its host fact, and the attached-member and moved-main-bot limits are stated rather than hidden (the owner saw the moved and down cases in R7-1's option). |
| Criteria | 20/20 | C1–C10 agreed (C5 reworded by R7-1), C11 dropped; each names an observable outcome, and C5's proof now covers both the typed note and the briefing. |
| **Total** | **100/100** | |

### Gap map

- Settled: R1-1 (narrowed by R7-2), R1-2, R2-1..R2-4, R3-1..R3-4, R4-1..R4-4, R5-1 (check 5 reopened by R7-1), R5-2..R5-4, R6-1, R7-1, R7-2. R1-3 and R1-4 are superseded by their reopens (R5-4, R2-3).
- Closed this round: G-live-reports (R7-1), G-remote (R7-2).
- For the rewrite in this run (not owner questions): items 1–8 above.
- Blocks within the design (build order): group (1) blocks (2) and (3); group (4) needs only (1)'s skeleton; the first task of (2) confirms `terminals()`'s `program.agent`, `status_ms` and how `error` arrives; the first attach of group (1) proves a running Claude session picks up a hook written mid-session, else the `/hooks` step; group (3)'s C5 check confirms which states hc notes on its own.
- Parked by the owner's own words, outside the first cut: the main bot creating team bots (would reopen R2-3); remote bots beyond showing (R7-2); dsh ("next"); Codex, Gemini and Kimi briefings ("Claude first"); memory, schedules and respawn (P10).

### Open

Nothing under Open. No question is asked this round.

### Assumed

- A1, A2 (narrowed), A4/A8, A6, A9 (revised round 5), A10–A15, A17, A18 (updated by R6-1 and reviewer MEDIUM-2: the NOTICE carries DS Bot too), A20–A25 and A27 as in round 7. A7 retired (R5-2); A16 superseded; A19 settled by R5-1.
- **A26 (revised by R7-1).** Who reports to whom at the bot level is read only from the project's `.herdr/bots.json`; the hc parent is set for one purpose, the push notes. The main bot starts `--no-parent`; a team member starts `--parent <main bot's live terminal> --outlive-parent` when the main bot is live, else `--no-parent`; helpers keep hc's default parent under their bot. Because hc fixes a parent at launch, a main bot that moves to a new terminal does not receive notes from members already running until they restart, and a member started while the main bot was down sends none; both limits were in the option the owner picked.
- **A28 (new, design detail; same family as A26's limits).** Attach ties a pane that is already running, so its hc parent is whatever it was launched with and cannot be changed. An attached team member therefore reaches the main bot through the briefing (and through its own `hc send` report, A29), not through hc's automatic notes, unless it was already launched under the main bot's terminal. This follows from the mechanism the owner approved ("members already running send their notes to the old one"); the design states it in C5's proof and the notes Risk row. If the re-review rates it an owner decision, the repair asks it.
- **A29 (new, fact read this round).** hc types notes into a parent on its own for `blocked`, `error` and exit; a finished task is reported by the member itself with `hc send` to its parent, the convention hc teaches every agent. The member's briefing names its parent's address so that report reaches the main bot. Whether hc also types a note on `done` is a build-time check, not a premise.

### Dispatch this round

No scouts and no council. Both owner questions the review raised are answered (R7-1, R7-2); the remaining work is a rewrite of named design lines plus the re-review the script runs in this same run, and the facts it needs (hc's note states, the parent flags, this host's `notes` setting) were read this round with three commands. The council allowance is spent (1 of 1 without asking) and nothing is contested. Mode: crystallize. Expected spend: this lead pass (~120k tokens), plus the script's design write, check and review (~400–600k tokens).
