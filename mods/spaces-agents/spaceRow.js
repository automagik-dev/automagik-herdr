// The Space Row's view models (docs/space-row-rendering.md): the `herdr-meter` doc's `space` key
// and a project path in, line 2's chips, the five hover cards and a bot's stats card out, every
// number formatted by the shared rules. Herdr Pocket renders the same feed by the same rules ("we
// are one"): nothing here computes a statistic; it formats feed fields, picks the arrow and
// lays out pies. Pure (no `herdr`, no gpui), so `node --test` runs it. Apache-2.0.

/** The only `space.version` this file renders; any other renders nothing. */
export const SPACE_VERSION = 1;
/** The "–" of the rules: null or missing, never 0. */
export const DASH = "–";
export const UP = "▲";
export const DOWN = "▼";

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : null);
const arr = (x) => (Array.isArray(x) ? x : []);
const text = (x) => (typeof x === "string" && x ? x : null);
const round = (x) => Math.floor(x + 0.5);
const fixed = (x, d) => (round(x * 10 ** d) / 10 ** d).toFixed(d);
const signed = (x, f) => (x < 0 ? `-${f(-x)}` : f(x));

// ---- formats (rules, section 3)

export const fmtCount = (x) => (num(x) === null ? DASH : signed(x, (v) => String(round(v))));

export const fmtMinutes = (x) => num(x) === null ? DASH : signed(x, (v) => {
  const m = round(v);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m - 60 * h;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
});

export const fmtShare = (x) => num(x) === null ? DASH : signed(x, (v) => {
  if (v === 0) return "0%";
  const p = v * 100;
  return p < 1 ? "<1%" : `${round(p)}%`;
});

export const fmtUsd = (x) => num(x) === null ? DASH : signed(x, (v) => {
  if (v === 0) return "$0.00";
  if (v < 0.01) return "<$0.01";
  if (v < 10) return `$${fixed(v, 2)}`;
  if (v < 1000) return `$${round(v)}`;
  return `$${fixed(v / 1000, 1)}k`;
});

export const fmtTokens = (x) => num(x) === null ? DASH : signed(x, (v) => {
  if (v < 1e3) return String(round(v));
  if (v < 1e5) return `${fixed(v / 1e3, 1)}k`;
  if (v < 1e6) return `${round(v / 1e3)}k`;
  if (v < 1e8) return `${fixed(v / 1e6, 1)}M`;
  if (v < 1e9) return `${round(v / 1e6)}M`;
  return `${fixed(v / 1e9, 1)}B`;
});

/** "as of HH:MM" in local time; `clock(date)` gives [hours, minutes] (tests pass a fixed zone). */
export function fmtAsOf(iso, clock = (d) => [d.getHours(), d.getMinutes()]) {
  const ms = typeof iso === "string" ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return null;
  const [h, m] = clock(new Date(ms));
  return `as of ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---- arrows (section 4)

/** `{ dir: "up" | "down", good }`, or null when equal or either side is null. */
export function arrowOf(now, prev, upIsGood) {
  const a = num(now), b = num(prev);
  if (a === null || b === null || a === b) return null;
  const up = a > b;
  return { dir: up ? "up" : "down", glyph: up ? UP : DOWN, good: up === upIsGood };
}

// ---- colours (section 5): token names; the UI looks them up in theme()

export const GOOD = "ansi2";
export const BAD = "ansi1";
const TYPE_TOKENS = [["feat", "ansi13"], ["fix", "ansi11"], ["test", "ansi14"], ["docs", "ansi12"], ["refactor", "ansi5"],
  ["perf", "ansi10"], ["ci", "ansi4"], ["build", "ansi6"], ["chore", "ansi8"], ["style", "ansi9"], ["revert", "ansi1"]];
export const CATEGORICAL = Object.freeze(["ansi4", "ansi6", "ansi3", "ansi5", "ansi2", "ansi12", "ansi13", "ansi14"]);

const rgb = (hex) => {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(hex ?? "").trim());
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null;
};
const toHex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const mix = (a, b, f) => a.map((v, i) => round(v + (b[i] - v) * f));

/** The cost scale's colour at k (0 good .. 1 bad), from the theme's ansi2, ansi3 and ansi1. */
export function scaleColor(k, t) {
  const g = rgb(t?.ansi2), y = rgb(t?.ansi3), r = rgb(t?.ansi1);
  if (!g || !y || !r) return t?.dim ?? "#888888";
  return toHex(k <= 0.5 ? mix(g, y, k / 0.5) : mix(y, r, (k - 0.5) / 0.5));
}
/** k for the i-th of n ordered items. */
export const scaleK = (i, n) => (n > 1 ? i / (n - 1) : 0);

/** A view model's colour, `{ token }` or `{ k }`, as a theme colour. */
export const colorOf = (c, t) => (c?.k !== undefined ? scaleColor(c.k, t) : t?.[c?.token] ?? t?.dim ?? "#888888");

// ---- the feed

/**
 * The `space` key of a `herdr-meter` doc, from whatever reading it gave: `hc doc get`'s output
 * (`{ value, version }`), a JSON-RPC reply (`{ result: { value } }`), the doc itself, as text or
 * parsed. Null when it doesn't parse, has no `space`, or `space.version` isn't SPACE_VERSION.
 * Resolves `{ space, generatedAt, truncated }`.
 */
export function readFeed(input) {
  let v = input;
  if (typeof v === "string") {
    const line = v.trim();
    if (!line) return null;
    try { v = JSON.parse(line); } catch {
      // `hc connect` prints one reply per line; the first one is ours.
      try { v = JSON.parse(line.split("\n")[0]); } catch { return null; }
    }
  }
  if (obj(v)?.result !== undefined) v = obj(v.result);
  if (obj(v) && !("space" in v) && "value" in v) v = v.value;
  const doc = obj(v);
  const space = obj(doc?.space);
  if (!space || space.version !== SPACE_VERSION) return null;
  return { space, generatedAt: text(doc.generated_at), truncated: space.truncated === true };
}

/** How often the sidebar reads the feed; the feed itself changes at most every 10 minutes. */
export const FEED_EVERY_MS = 60_000;
/** The herdr-core doc the feed is in. */
export const FEED_DOC = "herdr-meter";
const RPC = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "doc.get", params: { name: FEED_DOC } });

/**
 * The feed's text, or null. `hc doc get herdr-meter --json` first; a core whose `hc` has no
 * `doc` verb (0.1.x) answers it over `hc connect` instead (JSON-RPC `doc.get`, one reply line;
 * `hc connect` ends at the end of its input). `hc` and `exec` are Herdr's; never throws.
 */
export async function fetchFeed({ hc, exec }) {
  try {
    const r = await hc(["doc", "get", FEED_DOC, "--json"]);
    if (r?.code === 0 && r.stdout.trim()) return r.stdout;
  } catch {}
  try {
    const script = `h=$(command -v hc || echo "$HOME/.local/bin/hc"); printf '%s\\n' '${RPC}' | "$h" connect | head -n 1`;
    const r = await exec("sh", ["-c", script]);
    return r?.code === 0 && r.stdout.trim() ? r.stdout : null;
  } catch { return null; }
}

/** The project of an absolute main-checkout path, or null. */
export function projectOf(feed, path) {
  if (!feed || typeof path !== "string") return null;
  const projects = obj(feed.space.projects);
  if (!projects) return null;
  const key = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return obj(projects[key]) ?? obj(projects[`${key}/`]);
}

/**
 * The sidebar's projects, indexed once per discovery (bots.js discoverProjects' list, which
 * changes only when a bots.json or the open spaces do): `space` maps a space id to its project
 * key (the first project listing it), `file` a project key to its parsed bots.json. This
 * computer's projects only: the feed is this machine's.
 */
export function projectIndex(projects) {
  const space = new Map(), file = new Map();
  for (const p of arr(projects)) {
    if (p?.machine || typeof p?.key !== "string") continue;
    if (!file.has(p.key)) file.set(p.key, p.file ?? null);
    for (const id of arr(p.spaces)) if (!space.has(id)) space.set(id, p.key);
  }
  return { space, file };
}

/**
 * A repo's main checkout from the sidebar's git look (`g.repo`: JSON `[machine, common dir]`,
 * the common dir from `git rev-parse --path-format=absolute --git-common-dir`, which git gives
 * as a real path): the parent of a common dir named `.git`, no trailing slash. Null for another
 * machine, a bare repo or a submodule (those are keyed by the bots.json projects only).
 */
export function repoMain(repo) {
  if (mains.has(repo)) return mains.get(repo);
  let on, dir, main = null;
  try { [on, dir] = JSON.parse(repo); } catch {}
  if (!on && typeof dir === "string") {
    const d = dir.replace(/\/+$/, "");
    if (d.endsWith("/.git")) main = d.slice(0, -5) || "/";
  }
  // One entry per repo the sidebar has looked at: a render parses nothing.
  mains.set(repo, main);
  return main;
}
const mains = new Map();

/**
 * The feed's project path for a space row, or null (no line 2): never for a worktree row nested
 * under its repo's (`nested`) or a space on another machine; else the project a bots.json lists
 * the space under (`index`: projectIndex), else its repo's main checkout (`repo`: g.repo).
 */
export function spaceProject({ space, nested = false, repo = null, index }) {
  if (!space || nested || space.machine) return null;
  return index?.space.get(space.id) ?? (repo ? repoMain(repo) : null);
}

/** Ids to names for the bot card, from a project's bots.json (model.js' parsed file). */
export function namesOf(file) {
  const bot = new Map(), category = new Map();
  for (const b of arr(file?.bots)) if (text(b?.id)) bot.set(b.id, text(b.name) ?? b.id);
  for (const c of arr(file?.categories)) if (text(c?.id)) category.set(c.id, text(c.title) ?? c.id);
  return { bot, category };
}

// ---- line 2 (section 6)

const chip = (key, icon, value, fmt, arrow) => ({ key, icon, value: fmt(value), na: num(value) === null, arrow: num(value) === null ? null : arrow });

function forgeOf(p) {
  const f = obj(arr(obj(p.merges)?.items)[0])?.forge;
  return f === "github" || f === "gitlab" ? f : null;
}

/** The chips of line 2 for a project, in order; null when the project isn't in the feed. */
export function lineTwo(feed, path) {
  const p = projectOf(feed, path);
  if (!p) return null;
  const m = obj(p.merges) ?? {}, t = obj(p.time) ?? {}, fp = obj(p.first_pass) ?? {}, s = obj(p.spent) ?? {}, k = obj(p.tokens) ?? {};
  const forge = forgeOf(p);
  return [
    ...(forge ? [{ key: "forge", icon: forge, value: null, na: false, arrow: null }] : []),
    chip("merges", "merge", m.n, fmtCount, arrowOf(m.n, m.prev_n, true)),
    chip("time", "clock", t.median_min, fmtMinutes, arrowOf(t.median_min, t.prev_median_min, false)),
    chip("first_pass", "first", fp.share, fmtShare, arrowOf(fp.share, fp.prev_share, true)),
    chip("spent", "spent", s.codex_week_share, fmtShare, arrowOf(s.real_usd, s.prev_real_usd, false)),
    chip("tokens", "tokens", k.total, fmtTokens, arrowOf(k.total, k.prev_total, false)),
  ];
}

// ---- cards (section 7)

const head = (title, big, was) => ({ title, big, was: was === DASH ? null : `was ${was}` });
/** A card whose whole section is null or missing: its header with "–", nothing else. */
const emptyCard = (key, icon, title) => ({ key, icon, title, big: DASH, was: null, empty: true, pie: [], foot: null });
const footOf = (feed) => [fmtAsOf(feed.generatedAt), feed.truncated ? "lists trimmed to fit" : null].filter(Boolean).join(" · ");

function typeOrder(byType) {
  const keys = Object.keys(byType);
  const known = TYPE_TOKENS.filter(([k]) => keys.includes(k));
  const rest = keys.filter((k) => !TYPE_TOKENS.some(([t]) => t === k)).sort();
  return [...known, ...rest.map((k) => [k, "dim"])];
}

function modelTokens(p) {
  const ids = new Set([...Object.keys(obj(obj(p.spent)?.by_model) ?? {}), ...Object.keys(obj(obj(p.tokens)?.by_model) ?? {})]);
  const sorted = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return new Map(sorted.map((id, i) => [id, CATEGORICAL[i % CATEGORICAL.length]]));
}

const link = (x) => ({ task: text(obj(x)?.task) ?? DASH, url: text(obj(x)?.url) });
/** A pie detail lists at most this many items, then "+N" for the rest. */
export const DETAIL_ROWS = 9;

function mergesCard(p, feed) {
  if (!obj(p.merges)) return emptyCard("merges", "merge", "Merged");
  const m = p.merges;
  const byType = obj(m.by_type) ?? {};
  const items = arr(m.items).map(obj).filter(Boolean);
  const slices = typeOrder(byType).map(([key, token]) => {
    const n = num(byType[key]);
    return {
      key, label: key, value: n ?? 0, inside: fmtCount(n), legend: fmtCount(n), color: { token },
      detail: { title: `${fmtCount(n)} ${key}`, rows: items.filter((i) => i.type === key).map((i) => ({ ...link(i), value: fmtMinutes(i.lead_min) })) },
    };
  });
  return { key: "merges", icon: "merge", ...head("Merged", fmtCount(m.n), fmtCount(m.prev_n)), pie: slices, foot: footOf(feed) };
}

const TIME_TITLE = "Worktree \u2192 merge";
/** A band's label: `bands_labels[i]` when it is a non-empty string, else "band {i + 1}". */
export const bandLabel = (labels, i) => text(arr(labels)[i]) ?? `band ${i + 1}`;

function timeCard(p, feed) {
  if (!obj(p.time)) return emptyCard("time", "clock", TIME_TITLE);
  const t = p.time;
  const bands = arr(t.bands);
  const slices = bands.map((b, i) => ({
    key: String(i), label: bandLabel(t.bands_labels, i), value: num(b) ?? 0, inside: fmtCount(b), legend: fmtCount(b),
    color: { k: scaleK(i, bands.length) }, detail: { title: `${bandLabel(t.bands_labels, i)}: ${fmtCount(b)}`, rows: [] },
  }));
  const ex = (x) => ({ ...link(x), value: fmtMinutes(obj(x)?.min) });
  return {
    key: "time", icon: "clock", ...head(TIME_TITLE, fmtMinutes(t.median_min), fmtMinutes(t.prev_median_min)), pie: slices,
    stats: [
      { label: "fastest", ...ex(t.fastest), color: { token: GOOD } },
      { label: "average", task: null, url: null, value: fmtMinutes(t.avg_min), color: null },
      { label: "slowest", ...ex(t.slowest), color: { token: BAD } },
    ],
    foot: footOf(feed),
  };
}

const FIX_LABELS = ["first try", "1 fix", "2 fixes", "3+ fixes"];

function firstPassCard(p, feed) {
  if (!obj(p.first_pass)) return emptyCard("first_pass", "first", "First pass");
  const fp = p.first_pass;
  const fixes = arr(fp.fixes).slice(0, 4);
  const slices = fixes.map((n, i) => ({
    key: String(i), label: FIX_LABELS[i], value: num(n) ?? 0, inside: fmtCount(n), legend: fmtCount(n),
    color: { k: scaleK(i, 4) }, detail: { title: `${FIX_LABELS[i]}: ${fmtCount(n)}`, rows: [] },
  }));
  return { key: "first_pass", icon: "first", ...head("First pass", fmtShare(fp.share), fmtShare(fp.prev_share)), pie: slices, foot: footOf(feed) };
}

function spentCard(p, feed, colours) {
  if (!obj(p.spent)) return emptyCard("spent", "spent", "Spent, 24 h");
  const s = p.spent;
  const byModel = obj(s.by_model) ?? {};
  const slices = Object.entries(byModel).map(([id, usd]) => ({
    key: id, label: id, value: num(usd) ?? 0, inside: null, legend: fmtUsd(usd), color: { token: colours.get(id) },
    detail: { title: `${id}: ${fmtUsd(usd)}`, rows: [] },
  }));
  return {
    key: "spent", icon: "spent", ...head("Spent, 24 h", fmtUsd(s.real_usd), fmtUsd(s.prev_real_usd)),
    sub: `${fmtShare(s.codex_week_share)} of a Codex week`, pie: slices, foot: footOf(feed),
  };
}

function tokensCard(p, feed, colours) {
  if (!obj(p.tokens)) return emptyCard("tokens", "tokens", "Tokens");
  const k = p.tokens;
  const byModel = obj(k.by_model) ?? {};
  const slices = Object.entries(byModel).map(([id, raw]) => {
    const x = obj(raw) ?? {};
    const size = (num(x.input) ?? 0) + (num(x.output) ?? 0) + (num(x.cache_read) ?? 0);
    return {
      key: id, label: id, value: size, inside: null, legend: null, color: { token: colours.get(id) },
      detail: {
        title: id, rows: [],
        cells: [["input", fmtTokens(x.input)], ["output", fmtTokens(x.output)], ["cache read", fmtTokens(x.cache_read)],
          ["turns", fmtCount(x.turns)], ["reasoning", fmtShare(x.reasoning_share)], ["cache hit", fmtShare(x.cache_hit)]],
      },
    };
  });
  return {
    key: "tokens", icon: "tokens", ...head("Tokens", fmtTokens(k.total), fmtTokens(k.prev_total)),
    sub: `cache hit ${fmtShare(k.cache_hit)}`, pie: slices, foot: footOf(feed),
  };
}

/** The five cards of a project, by chip key; null when the project isn't in the feed. */
export function cardsOf(feed, path) {
  const p = projectOf(feed, path);
  if (!p) return null;
  const colours = modelTokens(p);
  return {
    merges: mergesCard(p, feed), time: timeCard(p, feed), first_pass: firstPassCard(p, feed),
    spent: spentCard(p, feed, colours), tokens: tokensCard(p, feed, colours),
  };
}

// ---- the bot card (section 8)

/**
 * A bot's stats card. `names`: namesOf(bots.json). A missing project or bot gives every field
 * "–" and no bar. Null only when there is no readable feed (the button isn't shown then).
 */
export function botCard(feed, path, botId, names = namesOf(null), botName = null) {
  if (!feed) return null;
  const b = obj(obj(projectOf(feed, path)?.bots)?.[botId]) ?? {};
  const kind = b.parts_kind;
  const labelOf = (key) => key === "other" ? "other"
    : kind === "member" ? names.bot.get(key) ?? key
      : kind === "category" ? names.category.get(key) ?? key
        : key;
  const parts = arr(b.parts).map(obj).filter(Boolean).map((x, i) => ({
    key: String(x.key ?? i), label: labelOf(String(x.key ?? "")), usd: num(x.usd), value: fmtUsd(x.usd),
    color: { token: x.key === "other" ? "dim" : CATEGORICAL[i % CATEGORICAL.length] },
  }));
  const shown = parts.filter((x) => x.usd !== null && x.usd > 0);
  const sum = shown.reduce((a, x) => a + x.usd, 0);
  return {
    title: botName ?? names.bot.get(botId) ?? botId,
    cells: [["$ / task", fmtUsd(b.usd_per_task)], ["time / task", fmtMinutes(b.min_per_task)], ["24 h", fmtUsd(b.usd_24h)]],
    bar: sum > 0 ? shown.map((x) => ({ key: x.key, share: x.usd / sum, color: x.color })) : [],
    legend: parts,
    empty: parts.length === 0,
    foot: footOf(feed),
  };
}

// ---- pies (section 7, "pizza")

const TAU = Math.PI * 2;

/**
 * Angles for slices of `values`, from 12 o'clock clockwise (radians, 0 = 12 o'clock). A zero
 * slice gets no arc (`start === end`). `show`: whether its count goes inside (>= 7%).
 */
export function pieAngles(values) {
  const vals = values.map((v) => (num(v) !== null && v > 0 ? v : 0));
  const total = vals.reduce((a, v) => a + v, 0);
  let at = 0;
  return vals.map((v) => {
    const f = total > 0 ? v / total : 0;
    const start = at, end = at + f * TAU;
    at = end;
    return { start, end, mid: (start + end) / 2, share: f, show: f >= 0.07 };
  });
}

/** A point at angle a (0 = 12 o'clock, clockwise) and radius r around (cx, cy). */
export const polar = (cx, cy, r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];

/** The slice index under (x, y) in a pie of radius r centred at (cx, cy), or -1. */
export function sliceAt(angles, x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy;
  if (dx * dx + dy * dy > r * r) return -1;
  let a = Math.atan2(dx, -dy);
  if (a < 0) a += TAU;
  return angles.findIndex((s) => s.end > s.start && a >= s.start && a < s.end);
}

/** How far a pulled-out slice moves (px), along its middle angle. */
export const PULL = 4;
