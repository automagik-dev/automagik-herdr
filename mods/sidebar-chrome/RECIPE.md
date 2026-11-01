# sidebar-chrome

The sidebar's footer as a rail of tabs instead of a stack of rows — puzzle **Mods**, clock
**Automations**, gear **Settings**, plus **Add machine** — and the brand bar above it. Derived from
Herdr's shipped `workspace-chrome`.

## What you see

A 42 px strip at the bottom of the sidebar, `chrome` background with a top border: four 28 × 28
icon buttons, `selected` when their view is open, `muted` otherwise, hover filling them. Collapsed
into the rail, the same icons; Herdr's update dot still rides the gear. Above, the unchanged brand
row (Herdr mark, search, sidebar toggle) with the traffic-light padding macOS needs.

## How it behaves

- **Mods**: focuses the tab already showing the mod manager (`panes()` → `mod === "mod-manager"`),
  else `tab.new {name: "Mods", mod: "mod-manager"}`.
- **Automations**: `layout.toggle {id: "automations-panel"}` — the panel lives in the left sidebar
  column; the tab shows `selected` while it is not hidden.
- **Settings** / **Add machine**: `app.settings`, `mod.open:machine-add`.
- **Rail**: follows the sidebar's width (`layout()`'s `sidebar.size.px < 160`), not a flag; labels
  are tooltips, so a fifth tab costs no height.

## Built from

`mods/sidebar-chrome/main.js`, `mod.json` (`place: none`, `cloned_from` recorded), `puzzle.svg`
(Lucide's puzzle, `stroke-width 2`, `currentColor`), Herdr's other icons reused from
`mods/workspace-chrome/`. Herdr API: `theme`, `run`, `props`, `window`, `layout`, `panes`,
`updates`, `shared`, `setShared`. Layout: the `sidebar-footer` block's `content.mod` is
`sidebar-chrome` with `props: {footer: true}`, and its `size.px` is 42.

## Watch out

- **Clone, not extension**: Herdr's updates to `workspace-chrome` don't reach it; only the footer
  copy is replaced by this mod — the brand block still uses Herdr's own.
- The footer's height is part of the layout (`size.px: 42`); a fifth tab still fits, a bigger row
  would not.
- `Automations` needs the `automations` mod and a block with id `automations-panel` in the layout;
  without them the toggle does nothing visible.

## Done when

`herdr-app check mods/sidebar-chrome` passes; the footer shows the four tabs in one row; Mods opens
or focuses the Mods tab; the clock toggles the Automations panel in the sidebar.
