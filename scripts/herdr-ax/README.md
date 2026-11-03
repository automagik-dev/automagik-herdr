# herdr-ax

An accessibility tree for the Herdr window. Herdr draws with GPUI and exposes no macOS
accessibility (AX) tree, so a GUI agent cannot ask it what is on screen or press a control by
name. herdr-ax reads the window's own frame with OCR (Apple Vision) and gives every text line
back with its box in screen points; `click` then presses a line through cua-driver by pixel.

macOS only. Needs Node 22.7 or later, `herdr-app`, `cua-driver` with its daemon running (and
its Accessibility and Screen Recording grants), and `swiftc` (Xcode or the Command Line Tools).
No npm dependencies.

```
node scripts/herdr-ax/herdr-ax.mjs tree                     every text line, top to bottom
node scripts/herdr-ax/herdr-ax.mjs find <text> [--nth N]    the Nth matching line
node scripts/herdr-ax/herdr-ax.mjs click <text> [--nth N] [--dx N] [--dy N]
node scripts/herdr-ax/herdr-ax.mjs expect <text> [--gone] [--timeout S]
```

- `tree` prints `[{text, x, y, w, h}]`: screen points, origin at the top left of the main
  display, sorted top to bottom (lines on one row read left to right).
- `find` matches case-insensitively: exact lines first, then lines that contain the text, each
  in reading order. `--nth 2` takes the second match. Exit 1 when nothing matches.
- `click` clicks the centre of the matched line, moved by `--dx`/`--dy` points (a bot's face
  sits left of its name: `--dx -40`). It prints the line, the point and the pixel it clicked.
  A pixel click has no read-back: check the result with `expect`, `herdr-app status` or
  `herdr-app ls`.
- `expect` reads again until the text shows (or, with `--gone`, until it no longer shows), for
  up to 5 seconds (`--timeout S`). Exit 1 on timeout.

## How it works

1. `cua-driver call list_windows {"app":"Herdr"}` gives Herdr's pid, window id and bounds in
   points (the frontmost on-screen window).
2. `herdr-app shot <temp>.png` saves the window's last frame. It covers the window bounds at the
   display scale (2× on a retina display); the scale is measured from the image, and a shot that
   does not match the bounds is refused.
3. `ocrbox` (`ocrbox.swift`, Apple Vision `VNRecognizeTextRequest`, accurate, pt-BR and en-US)
   prints every text line with its box in pixels; herdr-ax divides by the scale and adds the
   window origin.
4. For `click`, a fresh `get_window_state` (screenshot only, no AX tree) gives cua-driver's own
   frame: window-local and downscaled to `max_image_dimension` (1366 by default), so a 1728-point
   wide window is 1365 pixels wide there. The point is scaled into that frame and sent with
   `click {pid, window_id, x, y, capture_id, session}`, in the background (no window is brought
   forward). A capture lives in its cua-driver session, and each `cua-driver call` is a session
   of its own unless named, so both calls carry the same `session` label.

`ocrbox` is compiled on first use into the system temp folder (`herdr-ax-<source hash>/ocrbox`)
and recompiled when `ocrbox.swift` changes; `HERDR_AX_OCRBOX` points at a binary of your own.
Screenshots go to a temp folder that is removed after each command; nothing is written to the
repository.

## Example: open a bot's space by clicking its face

A running bot's face in the sidebar opens its pane, and so its space. The face sits left of the
name, so click the name moved 40 points left. In the General Orchestrator space the space header
and the main bot carry the same name, and the header comes first in reading order, so the bot's
row is the second match:

```
herdr-app status | grep '"space"'          # remember the space you are on
node scripts/herdr-ax/herdr-ax.mjs find "General Orchestrator" --nth 2
# { "text": "General Orchestrator", "x": 68, "y": 181, "w": 135.5, "h": 13 }
node scripts/herdr-ax/herdr-ax.mjs click "General Orchestrator" --nth 2 --dx -40
herdr-app status | grep '"space"'          # now the General Orchestrator space
herdr-app do space.select --id <the space you were on>
```

A stopped bot's face folds its row instead of opening anything. The run verified on this Mac
(2026-11-03) clicked Omni Orchestrator, since General Orchestrator's space was the one on screen
and its bot was stopped:

```
$ herdr-app status -> sp9d7f2575f71a6dbb5b4f6c790c55476b pane=pfc1f299… agent=t2mz  (Brain)
$ node scripts/herdr-ax/herdr-ax.mjs click "Omni Orchestrator" --dx -40
{
  "clicked": { "text": "Omni Orchestrator", "x": 65.5, "y": 362, "w": 120.5, "h": 15 },
  "at": { "x": 85.75, "y": 369.5 },
  "pixel": { "x": 68, "y": 266 },
  "pid": 672,
  "window_id": 116
}
$ herdr-app status -> spb9ce4e08fb6697e48f73446db3ce837a pane=p60d115e… agent=t201  (Omni)
$ herdr-app do space.select --id sp9d7f2575f71a6dbb5b4f6c790c55476b
{ "ok": true }
$ herdr-app status -> sp9d7f2575f71a6dbb5b4f6c790c55476b pane=pfc1f299… agent=t2mz  (Brain again)
```

`pixel` is in cua-driver's 1365-pixel frame of the 1728-point window: 85.75 × 1365 / 1728 = 68.

## Limits

- Only text is seen: icons, faces and colours are found by their offset from a label.
- Only what is on screen: a sidebar scrolled past a row hides it; nothing here scrolls.
- OCR can misread small or dim text; prefer `find` with a distinctive substring.
- A pixel click needs the window on screen (not minimised, on the current Space).
- `expect` reads the window's last frame, which Herdr redraws on change; each read takes about a
  second (OCR on a 3456×2040 frame), so a 5-second wait reads it a few times.
