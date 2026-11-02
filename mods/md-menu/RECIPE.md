# md-menu

Right-click in a terminal and, under Herdr's own items, the Markdown files that terminal's text
talks about: click one and it opens in a preview pane beside the chat, the way a click in the
Markdown panel used to. Derived from Herdr's shipped `menu`.

## What you see

Herdr's terminal menu, unchanged (split, zoom, right-click routing, park, close), followed by a
divider, the label **Markdown in this terminal**, and up to twelve rows: a file icon, the path
relative to the terminal's folder, and `machine` for another machine's file. A popup 380 × 460,
`popover` background, 12.8 px text, `selected` on the row under the pointer, ↑/↓ + Enter working
over both sections.

## How it behaves

- **Finding paths**: `hc read <terminal> --lines 600`, then one regex over the text
  (`.../.md|.mdx|.markdown`), newest first. Each match is resolved against the terminal's live
  folder and then the repo's root (`git rev-parse --show-toplevel`); `~/` and absolute paths as
  they are.
- **Keeping only real files**: one `sh -c 'for f do [ -f "$f" ] …'` over every candidate, so a
  fabricated path in prose never becomes a row. Doubles are dropped, twelve kept.
- **Clicking one** shows it in the tab's preview: the tab's existing Markdown preview switches in
  place through shared `markdown-browser.slots` / `.show` (the panel's own bookkeeping), else a new
  pane splits to the right of the clicked pane and is recorded as its slot; a preview opened any
  other way (a shell's `pane.split`) is replaced by opening beside it, focusing, swapping left and
  closing it. A popup closes only once the work has started.
- **Offered where**: a right-click on a terminal (props `{tab: "pane", target}`) or opened by a key
  (`mod.open:md-menu`, which falls back to the focused terminal, else the tab's first terminal).

## Built from

`mods/md-menu/main.js` (menu + Markdown rows + preview bookkeeping), `marks.js` (regex, resolution,
labels — no Herdr import, so `node` can run it), `mod.json` (`place: none`, popup 380 × 460).
Herdr API: `props`, `run`, `panes`, `focused`, `terminals`, `hc`, `exec`, `home`, `shared`,
`setShared`, `notify`, `closeOverlay`, `openOverlay`, `theme`, `keys`, `spaces`, `layout`.
Layout: the shown layout's root needs `"terminal_menu": "md-menu"`.

## Watch out

- **It replaces the terminal menu, it does not extend it** — a clone of the shipped one, so Herdr's
  later changes to `menu` don't reach it. Re-clone when that matters.
- It needs the `markdown-browser` mod for the preview pane; without it the row click opens a pane
  of an unknown mod and the app says so.
- Paths with spaces are missed (the regex stops at whitespace); a fragment that still exists on disk
  is matched, anything else is dropped.
- `exec` has a time limit; `hc read` of 600 lines and one `sh` per open are cheap but not free.
- Only rows the terminal printed are offered: it is not a file browser.

## Done when

`herdr-app check mods/md-menu` passes; right-clicking a terminal that printed a `.md` path lists it;
clicking it opens (or switches) the preview in the tab.
