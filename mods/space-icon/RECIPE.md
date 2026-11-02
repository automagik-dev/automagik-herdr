# space-icon

The dialog behind a space's icon: an **emoji** picked from a searchable grid of everything the
system's Unicode tables name, an **image** (PNG, SVG, or ICO converted to PNG), or the space's
**colour** including transparent. Kept per space and drawn by the sidebar.

## What you see

A 440 × 520 dialog, `popover` background, three tabs — **Emoji**, **Image**, **Colour** — a header
with the current icon (drawn on the space's colour) and its name, an error line when something is
refused, and `Use letter` / `Cancel` at the bottom.

- **Emoji**: a search field, a grid of clickable 28 px cells (12 per row, 7 rows, 84 per page) over
  **1,741 emoji**, `‹ page n/21 ›`, and a field for an emoji typed or pasted by hand, plus
  `Paste` (reads the clipboard through `osascript`). Clicking a cell applies it and closes.
- **Image**: a dashed drop zone (drop anywhere in the dialog), a path field and `Use image`.
- **Colour**: six palette swatches, `none` for transparent, a hex field and `Use`; it applies live
  and keeps the dialog open.

## How it behaves

- **Emoji** are validated as one emoji: no spaces, no ASCII, at most twelve code points — so a flag
  and a joined family pass while a word does not. They don't need a file.
- **Images**: `.png` keeps the header check (square, 16–2048 px, ≤5 MB); `.svg` must be a whole
  `<svg>…</svg>`; `.ico` is converted with `sips` and then checked as a PNG, because the sidebar
  draws PNG/SVG only. Kept under `space-icons/<space>-<time>.<ext>` in the app home; the file it
  replaces is deleted.
- **State**: shared `"spaces-agents.icons"` maps a full space id to `{kind: "emoji", char}` or
  `{kind: "image", file}` (an older bare path still reads as an image); `"space.colors"` holds the
  palette name or hex the sidebar fills the tile with.
- Opened by the sidebar's space avatar (props `{space, overlay}`), which is also what closes it.

## Built from

`mods/space-icon/main.js` (tabs, apply/paste/reset), `icon.js` (kinds, PNG/SVG/emoji validation,
kept-file naming), `emoji-data.js` (generated from `unicodedata`: the emoji blocks, with U+FE0F on
the text-presentation ones), `mod.json` (`place: none`). Herdr API: `props`, `closeOverlay`,
`theme`, `spaces`, `shared`, `setShared`, `appHome`, `home`, `exec`; `fs/promises`;
`InputState`/`Input`. Programs: `sips`, `osascript`.

## Watch out

- Other apps' pickers: this one is ours — the OS Emoji & Symbols panel can be summoned with
  `⌃⌘Space` but not opened from code (the palette process starts with no window), so the grid is the
  clickable route and `Paste` is the way in from anywhere else.
- Search is by Unicode name, so "grinning" finds 👤 and "happy" does not; flags (letter pairs) are
  not listed — paste one.
- ICO conversion depends on `sips` (macOS); elsewhere `.ico` is refused with a message.
- The tile colour only shows behind an emoji or a letter; an image covers it.

## Done when

`herdr-app check mods/space-icon` passes; clicking a space's avatar opens it; a grid cell sets the
emoji; a dropped SVG becomes the icon; `none` leaves the tile transparent.
