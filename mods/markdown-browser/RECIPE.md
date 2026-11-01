# markdown-browser

Renders a Markdown file in a pane: front matter hidden, `.mdx` import/export lines dropped, live
reload on save, a **Default app** button, and a right-click menu with *Preview in new pane* / *Open
in Default app*. A fork of `ohneda/herdr-markdown-browser` (MIT): this pack keeps the renderer and
turns the file-list panel off, because `md-menu` is what chooses files here.

## What you see

A header, 32 px, 12 px text: the file name (semibold), its full path in `dim` (`machine:path` for
another machine's file) and, on this machine, a **Default app** button. Below, the rendered
Markdown at 14 px, 20 px side padding, scrollable and selectable; `Loading…` before the first read,
`File not found` when the file is gone. `mod.json` has `place: "none"`, so no panel is docked.

## How it behaves

- Opened with props `{file, on}` (`on` = machine, null here) by `md-menu` or a shell's
  `pane.split {mod: "markdown-browser", props: {file}}`; the panel's own props `{file, on, overlay}`
  show the right-click menu; no props would be the list panel, which this pack leaves unused.
- A preview the panel opened carries a `slot`; shared `markdown-browser.slots` / `.show` let the
  next click swap the file in place, and `markdown-browser.last` remembers the tab's preview.
- Local files are watched (`watchFolder`); another machine's are re-read every 3 s while their tab
  is shown. Reads are numbered so a slower older read never wins.
- **Default app** checks the file first (`sh -c realpath`, refusing folders and `*.md` links to
  programs), then opens it with `open`.

## Built from

`main.js` (preview, menu, slot bookkeeping), `list.js` (where to look and how to list — used only
by the unused panel face), `open.js` (the default-app check), `mod.json` (`place: "none"`,
overlay 220 for the menu), `LICENSE` (MIT, from upstream).

## Watch out

- Fork: upstream changes must be merged by hand. The pack's change is `place: "right"` → `"none"`.
- `.mdx` import/export stripping is line-based, not a parser: a code fence is respected, anything
  stranger is not.
- `open` on Windows and Linux has never been exercised by this pack.
- The panel face (file list) is dead code here; `md-menu` is the way in.

## Done when

`herdr-app check mods/markdown-browser` passes; `md-menu` opens a file into a preview that switches
in place; editing the file updates the pane within a second; **Default app** opens it.
