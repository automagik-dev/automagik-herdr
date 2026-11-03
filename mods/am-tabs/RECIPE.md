# am-tabs

The window's tab bar: one pill per tab of the shown space, named from what runs in it, with a close
✕ on hover and on middle press, the side-panel buttons and the window buttons. Derived from Herdr's
shipped `tabs`; the naming engine is this project's.

## What you see

A 42 px bar, `chrome` background with a bottom border. Per tab a 29 px pill — `raised` with a border
when active, `chrome` otherwise, `hover` under the pointer — holding the program's icon (tinted `svg`
for glyph icons, `image` for pictures), the tab's name (`max_w 280`, truncating; an unnamed tab reads
its program's name, else "Terminal"), `Z` when the tab is zoomed, a spinner while the tab's agent is
`working`, a small **Needs you** chip when it is `blocked` (the sidebar's language, in `blocked` on a
13% tint) or a 6 px dot when it is `done`, and a close ✕. The ✕ is on the active tab always and on
any other tab while the pointer is over it — it is drawn absolutely inside 22 px of right padding
the pill always reserves, so showing it never changes the pill's size. When the space has settled tabs, one dim `N settled`
pill sits before `+`.
Right of the tabs: `+` (opens the pack's `am-new-menu`, in place of Herdr's stock `new-menu`), the `Files` and `Changes` buttons when the space's panel
list allows them, and on platforms that draw no window buttons, `−`, `□`, `✕` for the window.

## How it behaves

- **Naming** (`names.js`, on load and every 3 s): per tab, the agent pane's title if it has one —
  `π` prefix, state separator (`> ! : - | /`, braille frames, moon phases), leading Nerd Font glyph
  and leading category code (`AB12: `) stripped — else the program's display name when it isn't a
  shell, else the folder's name with `/Users/<you>` shown as `~`. A name the person set with
  `tab.rename` is left alone: the mod keeps what it assigned in shared `tab-titles.set` and only
  rewrites a tab whose name still equals its own or the agent's default, pruning closed tabs.
- **Presses**: press+release selects; press on one pill and release on another calls `tab.move`
  (reorder inside the space) — the dragged tab travels by **id**, and the drop index is read from
  the tab list as it is at release, so a tab closed or reordered mid-drag can never move a
  stranger; double press starts `tab.rename`; right press opens the shipped `menu` popup for the
  tab; a middle press closes the tab at once; the ✕ closes without selecting.
- **Nothing but choosing switches**: the wheel over the bar scrolls the strip (`overflow_x_scroll`,
  which paints no bar) and never calls `tab.prev`/`tab.next`; a terminal changes when its tab is clicked,
  or by a key the person bound. No chevrons: they would step tabs without choosing one.
- **Settled tabs** (`tab.settle`) are left out of the strip and counted in the `N settled` pill;
  clicking it opens a popup of them, and choosing one calls `tab.unsettle` + `tab.select` so it
  returns to the bar. A settled tab that needs you is brought back by Herdr itself.
- **Panel memory**: the space's chosen side panel (`null` for closed) is kept in
  `localStorage["panels"]`, restored on a space switch with a one-second guard so the restore isn't
  recorded as a choice; `shared("workspace.panels")` is the allow-list of panels.
- **macOS**: the bar reserves room for the traffic lights (minus the sidebar's width, divided by
  zoom) so the first tab never sits under the buttons.

## Built from

`mods/am-tabs/main.js` (bar, pills, presses, panel memory), `names.js` (title parsing and naming),
`mod.json` (`place: none`). Herdr API: `spaces`, `panes`, `run`, `openOverlay`, `theme`, `window`,
`shared`, `layout`, `settings`, `setShared`. Layout: the `tabs` block's `content.mod` is `am-tabs`,
`size.px` 42. Programs opened: `am-new-menu` (the `+` popup) and `menu` (right press).

## Watch out

- **Close on hover costs a redraw per pointer change**: `on_hover` notifies only when the hovered
  tab actually changes, but moving across the bar redraws twice per pill.
- **Middle press on a space's last tab** closes the tab and so closes the space — Herdr asks first,
  the same as the ✕.
- **Scrolling does not change tabs** by design, and the strip paints no scrollbar; the only in-bar
  way to change tab is clicking one (or its right-press menu).
- **Folding settled tabs hides them from the strip**: if a landed `tab.settle` choice matters, the
  count pill is the only way back.
- Names come from a 3 s poll — Herdr has no title-change event — so a renamed agent pane can lag by
  up to three seconds.
- It replaces Herdr's `tabs`; Herdr's later changes don't reach it.

## Done when

`herdr-app check mods/am-tabs` passes; tabs carry their agent's name; hovering any tab shows its
✕ and middle-pressing closes it; dragging reorders; the panel buttons open and close the side panel
per space.
