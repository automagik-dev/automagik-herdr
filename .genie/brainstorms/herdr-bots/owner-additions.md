# Owner additions after the SHIP review (2026-11-01)

Approved on the sidebar mockup (https://claude.ai/artifact/GNt9hy4rSCwrQN5yxF5eDP, version 8).
DESIGN.md is stamped and unchanged; fold these into the wish.

1. Categories: a main bot's team is grouped under named categories a person reads first
   (Shared, then product groups such as Knowledge, Platform, Engineering, Quality, Access).
   Planned squads show as dimmed, dashed rows with their wave.
2. Collapsible: the main bot, every category and every bot with members or helpers can fold.
   The fold arrow shows only on hover (or keyboard focus); nothing else marks a fold.
   Default view is minimal: categories open, each bot's members and helpers folded.

## Mockup approved (2026-11-01)
The owner approved the sidebar mockup as the visual spec: https://claude.ai/artifact/GNt9hy4rSCwrQN5yxF5eDP, version 9.
It is generated from live `hc ls` by `gen-sidebar.mjs` (copy at `mockup/gen-sidebar.mjs` in this repo):
main bot at the root; categories (Shared, Knowledge, Platform, Engineering, Quality, Access); one row per bot
with its Automagik pet (pose per status: focus while working, happy when done, asleep when planned/stopped),
role and model, the coding agent's own Herdr icon and Herdr's status ring or spinner; members and helpers
nested under the bot that started them; planned squads as dimmed dashed rows with their wave; everything
with children folds, the fold arrow shows only on hover or focus, and the default view is minimal
(categories open, each bot's team folded).
