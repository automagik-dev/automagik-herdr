// The bot view over plain data: which bots are live (DESIGN Decision 3, counting every
// machine), each bot's pose (Decision 7, A6), the tree of a project (A1 nesting, A2
// categories, A3 planned, helpers from herdr-core's parent field), where each project's tree
// goes in the sidebar (A8), and the rows a fold state leaves showing (A7). Pure: no `herdr`,
// `gpui-kit` or `gpui-base`, so `node --test` runs it. Apache-2.0.

import { BOT_LABEL, RANKS, mainBotOf, effectiveLead } from "./model.js";
import { agentInForeground, rowIsAgent } from "./launchArgs.js";
import { shownModel, defaultModelFrom } from "./models.js";
import { workerBranch, workerTaskId } from "./workers.js";

/** Idle this long is asleep (Automagik's own threshold). */
export const ASLEEP_MS = 10 * 60 * 1000;

/** A project's identity in the view: its machine and key. */
export const projectId = (p) => JSON.stringify([p?.machine ?? null, p?.key ?? null]);

const addressOf = (t) => t?.address ?? t?.id ?? null;
// Decision 3: an agent in front, by the program table, else by the foreground process.
const agentInFront = (t) => rowIsAgent(t) ?? agentInForeground(t);

/**
 * The live map: bot id -> its live pane, from `terminals()` rows. A terminal counts while it
 * is live, carries `bot=<id>` for a bot in `known` (every id when `known` is null) and has an
 * agent in front. On any machine: the view shows remote bots too (launch.js' liveTerminalOf
 * is this computer's only, for Start and Attach). Several holders: the newest by
 * `created_ms` counts, flagged `duplicate`. `argv`: the pane's foreground command line when
 * the row carries it (`foreground.argv`), else null (the view reads it with `hc get`).
 * `parent`: the hc parent of that terminal (null: none), where its click opens a tab.
 */
export function liveFrom(terminals, known = null) {
  const holders = new Map();
  for (const t of terminals ?? []) {
    const id = t?.labels?.[BOT_LABEL];
    if (!id || (known && !known.has(id)) || t.state !== "live" || !addressOf(t) || !agentInFront(t)) continue;
    holders.set(id, [...(holders.get(id) ?? []), t]);
  }
  const live = {};
  for (const [id, rows] of holders) {
    const pick = rows.reduce((a, b) => ((b.created_ms ?? -1) > (a.created_ms ?? -1) ? b : a));
    live[id] = {
      terminal: addressOf(pick), duplicate: rows.length > 1, parent: pick.parent ?? null, status: pick.status ?? null,
      status_ms: typeof pick.status_ms === "number" ? pick.status_ms : null, program: pick.program ?? null,
      argv: Array.isArray(pick.foreground?.argv) ? pick.foreground.argv : null,
    };
  }
  return live;
}

/**
 * A bot's pose from herdr-core's status (Decision 7): working, blocked -> needs you, error ->
 * failed, done, idle -> idle or asleep once its status is ASLEEP_MS old. A live bot with no
 * status yet is idle with no asleep timer; a stopped or planned bot (no live pane) is asleep.
 */
export function poseOf(live, now) {
  if (!live) return "asleep";
  switch (live.status) {
    case "working": return "working";
    case "blocked": return "needs-you";
    case "error": return "failed";
    case "done": return "done";
    case "idle": return typeof live.status_ms === "number" && now - live.status_ms >= ASLEEP_MS ? "asleep" : "idle";
    default: return "idle";
  }
}

/** When the next idle bot turns asleep (ms since the epoch), or null: the view's one wake-up. */
export function nextWake(live, now) {
  let next = null;
  for (const l of Object.values(live ?? {})) {
    if (l?.status !== "idle" || typeof l.status_ms !== "number") continue;
    const at = l.status_ms + ASLEEP_MS;
    if (at > now && (next === null || at < next)) next = at;
  }
  return next;
}

/**
 * A pane's helpers: the live terminals whose hc parent it is, depth first, with their own
 * helpers beneath. A terminal tied to a known bot is never anyone's helper (it shows as that
 * bot, by definition), and what it started stays under it, so it is not followed.
 */
export function helpersOf(terminals, address, known = new Set(), depth = 0, seen = new Set([address])) {
  const kids = (terminals ?? []).filter((t) => t?.parent === address && t.state === "live" && !seen.has(addressOf(t))
    && !known.has(t.labels?.[BOT_LABEL]));
  return kids.flatMap((t) => {
    const terminal = addressOf(t);
    seen.add(terminal);
    // A bot's worker (automagik-herdr worker) names its template, or model and effort, in its labels.
    const row = { terminal, name: t.name || t.template || t.program?.name || terminal, agent: t.program?.key ?? null,
      program: t.program ?? null, status: t.status ?? null, depth,
      model: t.labels?.["worker.model"] || null, effort: t.labels?.["worker.effort"] || null,
      template: t.labels?.["worker.template"] || null,
      // The branch label, else the task label of a worker started before the task contract.
      branch: workerBranch(t.labels), task: workerTaskId(t.labels) };
    return [row, ...helpersOf(terminals, terminal, known, depth + 1, seen)];
  });
}

/**
 * Every project's bot tree. `projects`: discoverProjects()' entries ({ key, machine?, file,
 * warnings? }); one tree per machine and key however often it is listed (worktree spaces).
 * `live`: liveFrom()'s map. `terminals`: terminals() rows, for helpers only. A member nests
 * under its effective lead (A1, by definition only, never by hc parent); the main bot's
 * direct reports group by `category` in file order, then the uncategorised; a planned bot
 * is never live and has no members (a planned lead falls back to the main bot).
 */
export function buildTree({ projects, live = {}, terminals = [], now = Date.now() }) {
  const known = knownBots(projects);
  const done = new Set();
  const trees = [];
  for (const p of projects ?? []) {
    const pid = projectId(p);
    if (done.has(pid)) continue;
    done.add(pid);
    const file = p.file ?? { version: 1, categories: [], bots: [] };
    const main = mainBotOf(file);
    const warnings = [...(p.warnings ?? [])];
    const leads = new Map(file.bots.map((b) => [b.id, b === main ? { lead: "" } : effectiveLead(file, b.id)]));
    const placed = new Set();
    const node = (bot) => {
      placed.add(bot.id);
      const planned = Boolean(bot.planned);
      const l = planned ? null : live[bot.id] ?? null;
      const members = planned ? [] : file.bots.filter((b) => !placed.has(b.id) && b !== main && leads.get(b.id)?.lead === bot.id).map(node);
      const n = {
        bot, planned, pose: poseOf(l, now), members,
        live: l ? { terminal: l.terminal, duplicate: l.duplicate, parent: l.parent ?? null } : null,
        status: l?.status ?? null, program: l?.program ?? null, argv: l?.argv ?? null,
        helpers: l ? helpersOf(terminals, l.terminal, known) : [],
      };
      const warning = leads.get(bot.id)?.warning;
      if (warning && bot !== main) n.warning = warning;
      return n;
    };
    if (!main) {
      // No main bot (or a file that did not parse): every bot at the top, nothing nested.
      if (!warnings.includes("no main bot") && file.bots.length) warnings.unshift("no main bot");
      trees.push({ key: p.key, machine: p.machine ?? null, spaces: p.spaces ?? [], main: null, categories: [],
        uncategorised: file.bots.map((b) => ({ ...node(b), members: [] })), warnings });
      continue;
    }
    placed.add(main.id);
    const direct = file.bots.filter((b) => b !== main && leads.get(b.id)?.lead === main.id);
    const categories = file.categories
      .map((c) => ({ id: c.id, title: c.title, ...(c.sub ? { sub: c.sub } : {}), bots: direct.filter((b) => b.category === c.id && !placed.has(b.id)).map(node) }))
      .filter((c) => c.bots.length);
    const uncategorised = direct.filter((b) => !placed.has(b.id)).map(node);
    const mainNode = node(main);
    // main's own `members` are its direct reports, already grouped above.
    mainNode.members = [];
    trees.push({ key: p.key, machine: p.machine ?? null, spaces: p.spaces ?? [], main: mainNode, categories, uncategorised, warnings });
  }
  return trees;
}

/**
 * Where each project's tree is drawn (A8): after the first space row, in sidebar order, that
 * belongs to it (a project lists its spaces' ids); other spaces of the project draw none.
 * Returns { at: Map<space id, project id>, rest: project ids with no space shown }.
 */
export function placeTrees(orderedSpaceIds, trees) {
  const at = new Map();
  const placed = new Set();
  for (const sid of orderedSpaceIds) {
    const t = trees.find((x) => !placed.has(projectId(x)) && x.spaces.includes(sid));
    if (!t) continue;
    placed.add(projectId(t));
    at.set(sid, projectId(t));
  }
  return { at, rest: trees.map(projectId).filter((id) => !placed.has(id)) };
}

/**
 * Where each placed project's tree is (`at` from placeTrees) as an index into the same space
 * list: the place withSpaceless puts the project back at once its last space closes.
 */
export function placesOf(orderedSpaceIds, at) {
  const out = new Map();
  orderedSpaceIds.forEach((sid, i) => { if (at.has(sid)) out.set(at.get(sid), i); });
  return out;
}

/**
 * One sidebar list with its spaceless projects in it (A8): each where its space last was
 * (`last`: Map<project id, index> from placesOf), else right after the open spaces. Returns
 * the drawing order as { space: id } and { project: id } items.
 */
export function withSpaceless(orderedSpaceIds, spaceless, last = new Map()) {
  const n = orderedSpaceIds.length;
  // Two at one place keep their remembered order, then the order they came in.
  const pending = spaceless.map((id, i) => ({ id, i, was: last.get(id) ?? Infinity, at: Math.min(last.get(id) ?? n, n) }))
    .sort((a, b) => a.at - b.at || (a.was === b.was ? 0 : a.was < b.was ? -1 : 1) || a.i - b.i);
  const out = [];
  let k = 0;
  for (let s = 0; s <= n; s += 1) {
    while (k < pending.length && pending[k].at === s) out.push({ project: pending[k++].id });
    if (s < n) out.push({ space: orderedSpaceIds[s] });
  }
  return out;
}

/** The fold id of a bot row, or of a project's category. */
export const botFold = (botId) => `b:${botId}`;
export const categoryFold = (tree, categoryId) => `c:${projectId(tree)}:${categoryId}`;

/**
 * The rows a tree shows under a fold state (A7). `open`: Map<fold id, boolean> of the
 * person's folds this session; anything not in it takes the default: the main bot open,
 * every category open, every other bot folded. Each row: { kind: "main" | "category" | "bot"
 * | "planned" | "helper" | "notice", id, guides, foldable, open, ... } where `guides` lists
 * the lines on its left, outermost first: "main" (inside the main bot), "member" (inside a
 * bot's team), "helper" (a dashed helper group).
 */
export function visibleRows(tree, open = new Map()) {
  const rows = [];
  const isOpen = (id, dflt) => (open.has(id) ? open.get(id) : dflt);
  const helperRows = (owner, helpers, guides) => helpers.map((h) => ({
    kind: "helper", id: `h:${h.terminal}`, owner: owner.bot.id, ownerTerminal: owner.live?.terminal ?? null, helper: h,
    foldable: false, open: false,
    guides: [...guides, ...Array(h.depth + 1).fill("helper")],
  }));
  const botRows = (n, guides) => {
    const id = botFold(n.bot.id);
    if (n.planned) { rows.push({ kind: "planned", id, node: n, guides, foldable: false, open: false }); return; }
    const foldable = n.members.length + n.helpers.length > 0;
    const o = foldable && isOpen(id, false);
    rows.push({ kind: "bot", id, node: n, guides, foldable, open: o });
    if (!o) return;
    for (const m of n.members) botRows(m, [...guides, "member"]);
    rows.push(...helperRows(n, n.helpers, [...guides, "member"]));
  };
  if (!tree.main) {
    if (tree.warnings.length) rows.push({ kind: "notice", id: `n:${projectId(tree)}`, text: tree.warnings[0], guides: [], foldable: false, open: false });
    for (const n of tree.uncategorised) botRows(n, []);
    return rows;
  }
  const mainId = botFold(tree.main.bot.id);
  const foldable = tree.categories.length + tree.uncategorised.length + tree.main.helpers.length > 0;
  const mainOpen = foldable && isOpen(mainId, true);
  rows.push({ kind: "main", id: mainId, node: tree.main, guides: [], foldable, open: mainOpen });
  if (!mainOpen) return rows;
  for (const c of tree.categories) {
    const id = categoryFold(tree, c.id);
    const o = isOpen(id, true);
    rows.push({ kind: "category", id, category: c, guides: ["main"], foldable: true, open: o });
    if (o) for (const n of c.bots) botRows(n, ["main"]);
  }
  for (const n of tree.uncategorised) botRows(n, ["main"]);
  rows.push(...helperRows(tree.main, tree.main.helpers, ["main"]));
  return rows;
}

const folderName = (key) => String(key ?? "").replace(/\/+$/, "").split("/").pop();

/**
 * A bot row's second line (A4, A12). Planned: its note. Main bot: `Main bot · model ·
 * project`, stopped `Main bot · not running · project`. Member: `role · model`, stopped
 * `not running · role`. The model is models.js shownModel's for the live pane: the model its
 * foreground command line names, else the agent's own configured default (`texts`:
 * configPaths' files read by the caller). Never typed text: a stopped bot's line keeps A4's
 * shape with no model, and a live pane whose command line isn't known yet shows none rather
 * than a guess. `argvOf(terminal)`: the command line the caller read with `hc get` for a
 * row that didn't carry it.
 */
export function secondLine(r, tree, { texts = {}, argvOf = () => null } = {}) {
  const n = r.node, b = n.bot;
  if (r.kind === "planned") return b.planned?.note || "planned";
  let model = null;
  if (n.live) {
    const argv = n.argv ?? argvOf(n.live.terminal) ?? null;
    if (argv) model = shownModel({ argv, agentKey: b.agent, pinned: b.model, fallback: defaultModelFrom(b.agent, texts) }).model;
  }
  if (r.kind === "main") return ["Main bot", n.live ? model : "not running", folderName(tree.key)].filter(Boolean).join(" · ");
  return (n.live ? [b.role, model] : ["not running", b.role]).filter(Boolean).join(" · ");
}

/**
 * Which bot panes' command lines to read with `hc get` (A12), from `terminals()` rows:
 * live, labelled with a `known` bot, and not carrying `foreground.argv`. A pane already in
 * `cached` (address -> argvEntry) with the same `created_ms` and its agent in front is
 * skipped: a bot pane runs the command it was started with. One read while still in its
 * `sh -c` wrapper is asked again. At most `max` per call; the rest wait for the next.
 * Returns { ask: addresses, gone: cached addresses no longer wanted }.
 */
export function argvToAsk(terminals, known, cached = new Map(), max = 3) {
  const rows = (terminals ?? []).filter((k) => k?.address && k.state === "live" && known.has(k.labels?.[BOT_LABEL])
    && !Array.isArray(k.foreground?.argv));
  const wanted = new Set(rows.map((k) => k.address));
  const ask = rows.filter((k) => {
    const hit = cached.get(k.address);
    return !hit?.settled || hit.created !== (k.created_ms ?? null);
  }).map((k) => k.address).slice(0, max);
  return { ask, gone: [...cached.keys()].filter((a) => !wanted.has(a)) };
}

/**
 * What the view keeps of a pane's `hc get` answer: its foreground argv (null: none), the
 * pane's `created_ms`, and whether that argv is final (an agent in front, not a shell or
 * the `sh -c` wrapper an agent starts in), so argvToAsk asks again until it is.
 */
export function argvEntry(get, created) {
  const argv = Array.isArray(get?.foreground?.argv) ? get.foreground.argv : null;
  return { argv, created: created ?? null, settled: Boolean(argv) && agentInForeground(get) };
}

/** The ids of every bot the projects define: a terminal labelled with one is drawn as that bot. */
export function knownBots(projects) {
  return new Set((projects ?? []).flatMap((p) => p.file?.bots?.map((b) => b.id) ?? []));
}

/** Every terminal a tree holds: each live bot's pane and every bot's helpers, folded or not. */
function treeTerminals(tree) {
  const out = new Set();
  const walk = (n) => {
    if (!n) return;
    if (n.live?.terminal) out.add(n.live.terminal);
    for (const h of n.helpers ?? []) out.add(h.terminal);
    for (const m of n.members ?? []) walk(m);
  };
  walk(tree?.main);
  for (const c of tree?.categories ?? []) for (const n of c.bots) walk(n);
  for (const n of tree?.uncategorised ?? []) walk(n);
  return out;
}

// R3's place of a bot among its siblings: captains (by rank, or a bot with no rank that leads
// others) first, then by rank in RANKS order, then the unranked; file order within each.
const rankOf = (n) => (n.bot.rank ? RANKS.indexOf(n.bot.rank) : n.members.length ? 0 : RANKS.length);
const byRank = (nodes) => nodes.map((n, i) => [n, i]).sort(([a, i], [b, j]) => rankOf(a) - rankOf(b) || i - j)
  .map(([n]) => ({ ...n, members: byRank(n.members) }));

/** A tree with every bot's siblings in R3 order (byRank); categories keep bots.json order. */
export function rankedTree(tree) {
  if (!tree) return tree;
  return { ...tree, main: tree.main ? { ...tree.main, members: byRank(tree.main.members) } : null,
    categories: tree.categories.map((c) => ({ ...c, bots: byRank(c.bots) })), uncategorised: byRank(tree.uncategorised) };
}

/**
 * R3 (sidebar-rules D2): one space's rows, in the order the sidebar draws them. First the
 * project's bot tree when placeTrees put it in this space (visibleRows under `open` over
 * rankedTree: the main bot; categories in bots.json order, each with its captains, then its
 * members by rank; each bot's helpers beneath it), then
 * the plain agents not tied to a bot, each followed by its sub-agents, then shells. A bot is
 * never drawn below a plain agent, and a terminal the tree holds (a bot's pane, or a helper
 * of any bot, folded or not) is not listed again as an agent or a shell; nor is what such an
 * agent started. `agents`: [{ terminal, subs?: [{ terminal, depth }] }] in the caller's
 * order; `shells`: [{ terminal }]. Each descriptor: { kind: "main" | "category" | "bot" |
 * "helper" | "notice" | "agent" | "shell", id, depth, terminal (null when none) } plus what
 * it was made from: `row` (visibleRows' row), `agent` and `sub`, or `shell`.
 */
export function spaceRowOrder({ tree = null, agents = [], shells = [], open = new Map() } = {}) {
  const out = [];
  const seen = tree ? treeTerminals(tree) : new Set();
  if (tree) {
    for (const r of visibleRows(rankedTree(tree), open)) {
      const terminal = r.kind === "helper" ? r.helper.terminal : r.node?.live?.terminal ?? null;
      out.push({ kind: r.kind === "planned" ? "bot" : r.kind, id: r.id, depth: r.guides.length, terminal, row: r });
    }
  }
  for (const a of agents ?? []) {
    if (!a?.terminal || seen.has(a.terminal)) continue;
    seen.add(a.terminal);
    out.push({ kind: "agent", id: `a:${a.terminal}`, depth: 0, terminal: a.terminal, agent: a });
    for (const s of a.subs ?? []) {
      if (!s?.terminal || seen.has(s.terminal)) continue;
      seen.add(s.terminal);
      out.push({ kind: "agent", id: `a:${s.terminal}`, depth: (s.depth ?? 0) + 1, terminal: s.terminal, agent: a, sub: s });
    }
  }
  for (const s of shells ?? []) {
    if (!s?.terminal || seen.has(s.terminal)) continue;
    seen.add(s.terminal);
    out.push({ kind: "shell", id: `s:${s.terminal}`, depth: 0, terminal: s.terminal, shell: s });
  }
  return out;
}

/**
 * What a click on a terminal's row runs. A pane shows it: agent.focus. None does (a parked
 * seat: running, no pane): terminal.peek, which peeks over the tab with keep-as-tab and close,
 * so the person sees it and chooses to keep it; never terminal.keep on their behalf. The same
 * on any machine (`box/t4`). A bot's helper row goes through workerTab.js instead: it opens as
 * a tab after its bot's tab (the owner's ruling, 2026-11-02). `panes`: panes() rows, read at click time.
 */
export function clickActionOf(terminal, panes) {
  const shown = (panes ?? []).some((p) => p?.terminal === terminal);
  return { command: shown ? "agent.focus" : "terminal.peek", args: { terminal } };
}
