# am-footer

The sidebar's footer as a rail of tabs instead of a stack of rows — robot **Bots** (first), puzzle
**Mods**, clock **Automations**, gear **Settings**, plus **Add machine** — and the brand bar above it. Derived from
Herdr's shipped `workspace-chrome` 0.1.11.

## What you see

A 42 px strip at the bottom of the sidebar, `chrome` background with a top border: four 28 × 28
icon buttons, `selected` when their view is open, `muted` otherwise, hover filling them. Collapsed
into the rail, the same icons; Herdr's update dot still rides the gear. Above, the unchanged brand
row (Herdr mark, search, sidebar toggle) with the traffic-light padding macOS needs.

## How it behaves

- **Bots** (tab id `bots`, first in the rail): shown while `<app home>/mods/am-sidebar/mod.json`
  exists (looked up with Pocket Link's, every 30 s). It opens a popup (this mod, props
  `{botsMenu: true}`; Esc closes it) with **New bot** and **Bot settings**: `openOverlay` of
  `am-sidebar` as a modal dialog with `props.form` `"create"` (1000 × 840) or `"pick"` (560 ×
  0.85). While the sidebar's shared `bots.defined` is `false` (no bot on this computer) the popup
  shows only New bot. No bot code lives here: the forms are the sidebar mod's own.
- **Mods**: focuses the tab already showing the mod manager (`panes()` → `mod === "am-mods"`),
  else `tab.new {name: "Mods", mod: "am-mods"}`.
- **Automations**: `layout.toggle {id: "automations-panel"}` — the panel lives in the left sidebar
  column; the tab shows `selected` while it is not hidden.
- **Settings** / **Add machine**: `app.settings`, `mod.open:machine-add`.
- **Other mods' buttons** (`contributions.js`): a mod's `mod.json` can declare
  `automagik.footer` entries (`id`, `label`, `command`, optional `args`, `icon`, `badge`; README,
  "Add a sidebar button from your mod"). The footer lists `<app home>/mods` with `find` (as
  am-mods does), reads each `mod.json`, keeps at most 4 valid entries in mod-name order and draws
  them after Quota and Pocket Link, before the rule, in their own group that shrinks and clips
  first (`min_w(0)`, `overflow_hidden`): same tab, same hover name, `run(command, args)`
  on press, and a count while `shared(badge)` is a number above 0. A missing or invalid icon draws
  `circle.svg`. Rescanned on the 30 s look and on a `watchFolder` batch that touches a `mod.json`, a
  mod folder or an SVG; Pocket Link's folder is never read by this scan.
- **Rail**: follows the sidebar's width (`layout()`'s `sidebar.size.px < 160`), not a flag; labels
  are tooltips, so a fifth tab costs no height.

## Built from

`mods/am-footer/main.js`, `mod.json` (`place: none`; the lineage is this file's, not a `cloned_from`), `puzzle.svg`
(Lucide's puzzle, `stroke-width 2`, `currentColor`), Herdr's other icons reused from
`mods/workspace-chrome/`. Herdr API: `theme`, `run`, `props`, `window`, `layout`, `panes`,
`updates`, `shared`, `setShared`, `readTextFile`, `appHome`, `exec`, `watchFolder`, `openOverlay`,
`closeOverlay`. `circle.svg` is Lucide's circle, the contributed buttons' fallback glyph.
`bot.svg` is Lucide's bot, as Herdr ships it in `frame/welcome/`. Layout: the `sidebar-footer` block's `content.mod` is
`am-footer` with `props: {footer: true}`, and its `size.px` is 42.

## Watch out

- **Clone, not extension**: Herdr's updates to `workspace-chrome` don't reach it; only the footer
  copy is replaced by this mod — the brand block still uses Herdr's own.
- The footer's height is part of the layout (`size.px: 42`); a fifth tab still fits, a bigger row
  would not. Width too: every built-in tab plus 4 contributed ones (about 340 px) is wider than the
  268 px sidebar; the contributed group clips, the built-in tabs keep their place.
- `Automations` needs the `am-automations` mod and a block with id `automations-panel` in the layout;
  without them the toggle does nothing visible.

## Done when

`herdr-app check mods/am-footer` passes; the footer shows Bots first, then the other tabs, in one row; Bots' popup opens the
Create form and the bot list, and with no bot defined offers New bot alone; Mods opens
or focuses the Mods tab; the clock toggles the Automations panel in the sidebar.
