# Space Row: rendering rules (desktop sidebar and Herdr Pocket)

One feed, one design: "we are one". The desktop sidebar (`mods/am-sidebar`) and Herdr Pocket draw
the same rows and cards from the same doc, by these rules. Neither client computes, derives or rounds
anything beyond the formats defined here. The visual spec is the owner-approved mock "Herdr Space
Row" v38; where this file and the mock differ on data, this file wins (the mock computed its numbers
itself, from local logs).

## 1. Where the data comes from

- The herdr-core doc `herdr-meter` (`schema_version` 2), key `space`. Desktop reads it with
  `hc doc get herdr-meter` (on a core without that verb: `doc.get` over `hc connect`), at most once
  a minute. The feed changes at most every 10 minutes.
- `space.version` must be `1`. Any other value, a missing `space` key, or a doc that doesn't parse:
  render nothing at all (no line 2, no stats button). Never crash, never show stale numbers as new.
- A project is keyed by its main checkout's path (`space.projects["/abs/path"]`): the real path
  (symlinks resolved) of the parent of git's common dir, as `git rev-parse --path-format=absolute
  --git-common-dir` prints it, with no trailing slash. A space maps to the project its folder's repo
  is keyed by; a worktree space maps to its main checkout's project. On the desktop, a worktree row
  nested under its repo's row gets no line 2 (the repo's row has it). Spaces on other machines:
  nothing (the feed is this machine's).
- A space whose project is not in `space.projects`: no line 2. Its bot rows still get the stats
  button, and their cards show "–" everywhere.
- Unknown keys anywhere are ignored. Every key is optional: a missing key is the same as `null`.

## 2. The "–" rule

- `null` or missing shows as "–" (U+2013 EN DASH), in the dim colour. Never `0`, never blank.
- `0` (or `0.0`) is a real value and shows formatted: `0`, `0m`, `0%`, `$0.00`.
- A null value has no arrow. A card whose whole section is null or missing (`merges`, `time`,
  `first_pass`, `spent` or `tokens` itself) shows its header (icon, title, "–" as the big number)
  and nothing else: no `was`, no subtitle, no pie, no cells, no footer.

## 3. Number formats

`round(x)` means `floor(x + 0.5)` on the IEEE double as given (JavaScript `Math.round`, Kotlin
`Math.floor(x + 0.5)`). `fixed(x, d)` means `round(x * 10^d) / 10^d`, printed with exactly `d`
decimals. The branch is chosen on the raw value, before rounding, except for minutes, which round
first (`m = round(x)`) and branch on `m`.

| Kind | Rule | Examples |
|---|---|---|
| count | `round(x)` as an integer | `7` |
| minutes | `m = round(x)`; `m < 60` → `"{m}m"`; else `h = floor(m / 60)`, `r = m - 60h`; `r == 0` → `"{h}h"`, else `"{h}h {r}m"` | `9m`, `38m`, `1h`, `1h 5m`, `4h`, `26h 40m` |
| share (0..1) | `x == 0` → `0%`; `0 < x*100 < 1` → `<1%`; else `round(x*100)` + `%` | `0.57` → `57%`, `0.09` → `9%`, `0.004` → `<1%` |
| dollars | `x == 0` → `$0.00`; `0 < x < 0.01` → `<$0.01`; `x < 10` → `"$" + fixed(x, 2)`; `x < 1000` → `"$" + round(x)`; else `"$" + fixed(x/1000, 1) + "k"` | `$2.60`, `$18`, `$105`, `$1.2k` |
| tokens | `x < 1e3` → `round(x)`; `x < 1e5` → `fixed(x/1e3, 1) + "k"`; `x < 1e6` → `round(x/1e3) + "k"`; `x < 1e8` → `fixed(x/1e6, 1) + "M"`; `x < 1e9` → `round(x/1e6) + "M"`; else `fixed(x/1e9, 1) + "B"` | `310`, `90.0k`, `120k`, `10.3M`, `150M`, `1.2B` |
| as of | the doc's top-level `generated_at` in the device's local time, 24 h: `"as of HH:MM"` | `as of 18:30` |

Negative numbers are not expected; if one arrives, format its absolute value and prefix `-`.
Trailing zeros stay (`90.0k`, `$2.60`): both clients print the same characters.

## 4. Arrows (▲ U+25B2, ▼ U+25BC)

- An arrow compares two feed fields with plain `>` / `<` on the raw values. Equal, or either side
  null: no arrow, and nothing in its place.
- Direction is the way the number moved (▲ higher, ▼ lower). Colour says good or bad for that chip:
  good = green (`ansi2`), bad = red (`ansi1`).
- On line 2 the arrow is small (8 px), right after the value, with no number. Cards show the prior
  value as text (`was 55m`), never a difference: nobody subtracts.

| Chip | Value | Arrow compares | Up is |
|---|---|---|---|
| merges | `merges.n` | `merges.n` vs `merges.prev_n` | good |
| time | `time.median_min` | `time.median_min` vs `time.prev_median_min` | bad |
| first pass | `first_pass.share` | `first_pass.share` vs `first_pass.prev_share` | good |
| spent | `spent.codex_week_share` | `spent.real_usd` vs `spent.prev_real_usd` (the feed has no prior share) | bad |
| tokens | `tokens.total` | `tokens.total` vs `tokens.prev_total` | bad |

## 5. Colours

From Herdr's theme, by token name. Desktop reads `theme()`; Pocket has no `theme()` and uses the
hex below, so both clients print the same colours. The values are what Herdr's `themes()` reports
for the Automagik themes (read with `herdr-app check` in a scratch app home), dark and light. No rings,
no progress bars.

| Role | Token |
|---|---|
| good (arrow, fastest) | `ansi2` |
| bad (arrow, slowest) | `ansi1` |
| text, line 2 values | `foreground` |
| secondary text, legend labels, `was …` | `muted` |
| "–", empty slices, "other", footer | `dim` |
| card surface | `popover` |

| Token | Automagik dark | Automagik light |
|---|---|---|
| `ansi1` | `#e64d5d` | `#c7303f` |
| `ansi2` | `#009957` | `#007d47` |
| `ansi3` | `#ff9800` | `#8f621f` |
| `ansi4` | `#2b85e4` | `#1f6cbc` |
| `ansi5` | `#e44496` | `#b3427c` |
| `ansi6` | `#00a592` | `#11796d` |
| `ansi8` | `#959595` | `#898989` |
| `ansi9` | `#ff5a7a` | `#cb285c` |
| `ansi10` | `#00c972` | `#007d47` |
| `ansi11` | `#ff8a2e` | `#b34a00` |
| `ansi12` | `#5c78ff` | `#082dff` |
| `ansi13` | `#976ee6` | `#7a5bb7` |
| `ansi14` | `#2ee6e0` | `#077696` |
| `foreground` | `#eeeeef` | `#1b1b1e` |
| `muted` | `#9b999d` | `#656361` |
| `dim` | `#6d6a71` | `#918d88` |
| `popover` | `#2c2730` | `#f6eee2` |

Chip icon tints: forge `dim` (GitLab: `ansi3`); merges `ansi2`; time `dim`; first pass `ansi2`;
spent `ansi3`; tokens `ansi5`. Values on line 2 are `foreground`; "–" is `dim`.

### The cost scale (green to red)

For anything ordered from good to bad: time bands and first-pass fixes. Anchors: `ansi2` at 0,
`ansi3` at 0.5, `ansi1` at 1. A stop at `k` mixes the two neighbouring anchors linearly per sRGB
channel, each channel `round()`ed. `n` items take `k = i / (n - 1)`.

| Items | k | Automagik dark | Automagik light |
|---|---|---|---|
| 4 (first-pass fixes 0, 1, 2, 3+) | 0, 1/3, 2/3, 1 | `#009957 #aa981d #f77f1f #e64d5d` | `#007d47 #5f6b2c #a2512a #c7303f` |
| 6 (time bands, `<15m` … `>6h`) | 0, .2, .4, .6, .8, 1 | `#009957 #669934 #cc9811 #fa8913 #f06b38 #e64d5d` | `#007d47 #397237 #726727 #9a5825 #b14432 #c7303f` |

### Categorical colours

- Merge types: `feat` `ansi13`, `fix` `ansi11`, `test` `ansi14`, `docs` `ansi12`, `refactor` `ansi5`,
  `perf` `ansi10`, `ci` `ansi4`, `build` `ansi6`, `chore` `ansi8`, `style` `ansi9`, `revert` `ansi1`;
  any other type `dim`. Slices and legend go in that order, then unknown types A–Z.
- Models (spent and tokens cards): sort every model id in that project's `spent.by_model` and
  `tokens.by_model` together, by UTF-16 code unit (JavaScript's default sort; Kotlin's
  `String.compareTo`); the i-th takes `ansi4, ansi6, ansi3, ansi5, ansi2,
  ansi12, ansi13, ansi14` at `i mod 8`. The same model has the same colour in both cards.
- Bot card parts: the i-th entry of `parts` (feed order) takes the same 8-colour list at `i mod 8`;
  the key `other` is always `dim`.

## 6. Line 2 of a space row

One line, never two, at any sidebar width: chips sit left to right with a 9 px gap, none shrinks, and
the line clips at the right edge rather than wrapping. It starts under the space's name (after the
avatar). Each chip is its icon (12 px), then its value (monospace, 11.5 px, tabular figures), then
its arrow, if any. Null value: icon then "–", no arrow.

1. **Forge**: icon only, from `merges.items[0].forge` (`github` or `gitlab`, newest item first).
   Anything else or no items: no forge chip.
2. **Merges** (merge icon): `merges.n` as a count.
3. **Time** (clock): `time.median_min` as minutes.
4. **First pass** (check in a circle): `first_pass.share` as a share.
5. **Spent** (coin stack): `spent.codex_week_share` as a share.
6. **Tokens** (cube): `tokens.total` as tokens.

Nothing else on the line: no labels, no deltas, no bars.

## 7. Cards

Desktop opens a chip's card under the chip when the pointer rests on it for 260 ms; it stays open
while the pointer is on the chip or the card, and closes 350 ms after it leaves both. Pocket opens
the same card as a bottom sheet on tap. Every non-empty card (an empty one is its header only,
section 2): a header row (icon, title, the big number on
the right in monospace, and under it `was {prior}` in `muted` when the prior field is non-null),
the body, then a footer in `dim`: `as of HH:MM`, plus `· lists trimmed to fit` when
`space.truncated` is `true`.

- **Merges**: big `merges.n` (count), `was {prev_n}`. A pie of `merges.by_type` (slice = count,
  label inside = the count). Under it, `merges.items` of the hovered/tapped type, in feed order: task
  id (links to `url`), then `lead_min` as minutes; "–" for a null `lead_min`. At most 9 items
  are listed; when there are more, a last line `+N` (N = the ones not listed) in `dim`.
- **Time** ("Worktree → merge"): big `median_min`, `was {prev_median_min}`. A pie of `time.bands`
  with `time.bands_labels` (a missing, null or empty label is `band N`, N counting from 1),
  coloured by the 6-stop scale; label inside = the count; detail =
  `{label}: {count}`. Then three cells: fastest (`fastest.min`, green, task id linking to
  `fastest.url`), average (`avg_min`), slowest (`slowest.min`, red, task id linking to
  `slowest.url`).
- **First pass**: big `share`, `was {prev_share}`. A pie of `fixes` (labels `first try`, `1 fix`,
  `2 fixes`, `3+ fixes`), 4-stop scale; label inside and detail = the count.
- **Spent** ("Spent, 24 h"): big `real_usd` (dollars), `was {prev_real_usd}`. Under the header:
  `{codex_week_share} of a Codex week`. A pie of `spent.by_model` (non-null values only); legend:
  every model, its raw id, then its dollars ("–" for null; a null model draws no slice).
- **Tokens**: big `total`, `was {prev_total}`, then `cache hit {tokens.cache_hit}` as a share. A
  pie of `tokens.by_model`; a slice's size is that model's `input + output + cache_read` (nulls count
  as nothing; it sizes the slice and is never printed). Detail for a model: input, output,
  cache read (tokens), turns (count), reasoning (share), cache hit (share).

### Pies: the "pizza" style

Slices start at 12 o'clock and go clockwise, in the order given above; a zero slice draws nothing but
keeps its legend entry (dim). Slices are separated by a thin line in the card's surface colour. A
slice's count is written inside it only when the slice is at least 7% of the pie. Hovering (desktop)
or tapping (Pocket) a slice or its legend entry pulls that slice 4 px out along its middle angle,
dims the others to 35%, and shows its detail under the pie. Nothing is pulled out by default.

## 8. The bot card

On the desktop a bot row gets a three-bars button, visible only while the row is hovered; the card
opens only from that button (hover intent 260 ms, close 350 ms), never from the row. Pocket: the same
button, the card as a bottom sheet. Data: `space.projects[path].bots[botId]`; a missing project or
bot means every field is null.

- Title: the bot's name.
- Three cells: `$ / task` (`usd_per_task`, dollars), `time / task` (`min_per_task`, minutes),
  `24 h` (`usd_24h`, dollars).
- One bar, 8 px high, rounded 3 px: one segment per entry of `parts` with a non-null `usd` above 0,
  width `usd / (sum of those usd)`, in feed order. No such entry: no bar.
- The legend under it: each entry of `parts`, its colour, its label, its `usd` in dollars ("–" for
  null). Labels by `parts_kind`: `member` → that bot's name from the project's `.herdr/bots.json`
  (its id when not found); `model` → the raw model id; `category` → the category's title from
  `.herdr/bots.json` (its id when not found). The key `other` is labelled `other`.
- Empty `parts`: no bar, and the legend says `no breakdown yet` in `dim`.

Both clients read `.herdr/bots.json` for these names the same way (the desktop's `model.js`
`parseBots`):

- The file is read only when it is JSON, an object, with `version` exactly `1` and a `bots` list.
  Any other file gives no names: every label is its id. A client that read a good copy of the file
  earlier keeps using that copy while later reads are refused.
- A bot counts only with a non-blank string `id`, a non-blank string `name` and a `kind` of
  `main` or `member`; a repeated id: the first one counts. A bot left out is labelled by its id.
- A category counts only with a non-blank string `id` and a string `title`; a repeated id: the
  first one counts. An empty `title`, or a category left out, is labelled by its id.

## 9. Changes

### From t16r

Requests from Pocket that don't contradict the mock are taken and recorded here, each with its date.

- 2026-11-02, taken: a hex table for every token the rules use (section 5), Automagik dark and
  light, because the phone has no `theme()`.
- 2026-11-03, taken: section 8 says how both clients read `.herdr/bots.json` for names. A file
  whose `version` isn't 1 gives no names (labels fall back to ids), as on the desktop.
- 2026-11-02, noted (no rule change): Pocket gets bot and category names from Pocket Link, since the
  phone can't read `.herdr/bots.json`. The labels in section 8 are the same either way.

### From review (t22n, PR #55)

- 2026-11-02: a card whose whole section is null shows only its "–" header (section 2); the desktop
  had still drawn the subtitle and the time cells.
- 2026-11-02: the merges detail lists at most 9 items, then `+N` (section 7).
- 2026-11-02: a missing band label is `band N` (section 7).
- 2026-11-02: minutes branch on `round(x)` (section 3); models sort by UTF-16 code unit (section 5);
  the project key is the real path of the parent of git's common dir, no trailing slash, and nested
  worktree rows get no line 2 (section 1).
- 2026-11-02: section 7 says the header-body-footer layout is for every non-empty card (an empty
  card has its header only, section 2).
