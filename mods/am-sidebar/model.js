// Bot definitions over plain data: the `.herdr/bots.json` schema, its validation, the
// project key (DESIGN Decision 15), a member's effective lead (A1), bot ids (A9) and the
// default look. Pure: no `herdr`, `gpui-kit`, `gpui-base` or `fs`, so `node --test` runs it.
// Apache-2.0.

import { LEGACY_AGENTS } from "./models.js";

/** The hc label key that ties a terminal to a bot; its value is the bot id (A9). */
export const BOT_LABEL = "bot";
/** The longest `instructions` a bot may carry. */
export const MAX_INSTRUCTIONS = 4000;
/** A project's definitions file, relative to its key folder. */
export const BOTS_PATH = ".herdr/bots.json";
export const KINDS = ["main", "member"];
/**
 * A bot's rank (A16): a closed set, for the pane's `role=` label the event meter reads. The
 * free-text `role` stays for the briefing. Optional. `main` is not a rank: role=main is the
 * main bot's alone, derived from its kind.
 */
export const RANKS = ["captain", "dev", "tester", "reviewer", "fixer", "integrator", "pm", "owner"];
/** A category id: a lowercase slug, as it goes into a pane's `category=` label (A16). */
export const CATEGORY_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Automagik's characters and colours, by name (apps/bots-dsh/src/client/characters.js and
// inks.js). Only the names: the drawing comes with the characters themselves (Group 3).
export const CHARACTERS = ["whale", "octopus", "star", "moon", "wave", "squircle", "zed", "hex", "gumdrop", "peanut",
  "saucer", "bunny", "kitty", "beacon", "plus", "magnet", "acorn", "pebbles", "cushion", "ring", "gem"];
export const COLOURS = ["black", "brown", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "gray",
  "aurora", "deepseek", "charcoal", "graphite", "rose", "sky", "tangerine", "cobalt"];
const DEFAULT_CHARACTERS = ["star", "moon", "gumdrop", "peanut", "bunny", "kitty", "acorn"];
const DEFAULT_COLOURS = ["red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta"];

// RFC 4648 base32, lowercase.
const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
const ID_SHAPE = /^b-[a-z2-7]{10}$/;

/** `b-` plus 10 random lowercase base32 characters. `random` returns [0, 1). */
export function newBotId(random = Math.random) {
  let id = "b-";
  for (let i = 0; i < 10; i += 1) id += BASE32[Math.floor(random() * 32) % 32];
  return id;
}

// The same hash Automagik's lookOf() uses for a Bot with no stored look (FNV-1a, then
// mulberry32 for the colour and murmur3's fmix32 for the shape), so a bot id gets the
// same default character and colour here as there.
function fnv1a(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

/** A stable `{ character, colour }` for a bot id. */
export function defaultLook(botId) {
  const id = String(botId);
  const t = (fnv1a(id) + 1831565813) | 0;
  let n = Math.imul(t ^ (t >>> 15), 1 | t);
  n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
  const colour = DEFAULT_COLOURS[Math.floor((((n ^ (n >>> 14)) >>> 0) / 4294967296) * DEFAULT_COLOURS.length)];
  let v = fnv1a(id) | 0;
  v = Math.imul(v ^ (v >>> 16), 73244475);
  v = Math.imul(v ^ (v >>> 13), 3266489909);
  const character = DEFAULT_CHARACTERS[((v ^ (v >>> 16)) >>> 0) % DEFAULT_CHARACTERS.length];
  return { character, colour };
}

const isObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const isText = (x) => typeof x === "string" && x.trim() !== "";
const isWave = (x) => Number.isInteger(x) && x > 0;

/** An hc template name (a file in herdr-core's templates folder): no dash first, no spaces. */
export const TEMPLATE_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** The worker fields a bot may set (`worker: { agent?, model?, effort?, template? }`), each optional text. */
export const WORKER_FIELDS = ["agent", "model", "effort", "template"];

/**
 * Why a bot's `worker` (its workers' defaults) can't be used, or null when it is absent or
 * fine: an object whose agent, model, effort and template, where given, are non-empty text,
 * none starting with a dash, and whose template is an hc template name (TEMPLATE_SHAPE). Other keys
 * in it are kept as they are.
 */
export function workerProblem(worker) {
  if (worker === undefined) return null;
  if (!isObject(worker)) return "worker is not an object";
  const bad = WORKER_FIELDS.filter((k) => worker[k] !== undefined && !isText(worker[k]));
  if (bad.length) return `worker ${bad.join(", ")} not text`;
  const dashed = WORKER_FIELDS.filter((k) => typeof worker[k] === "string" && worker[k].trimStart().startsWith("-"));
  if (dashed.length) return `worker ${dashed.join(", ")} starts with a dash (an agent would read it as an option)`;
  return worker.template !== undefined && !TEMPLATE_SHAPE.test(worker.template)
    ? `worker template "${worker.template}" isn't an hc template name (letters, digits, ".", "_" and "-")` : null;
}

/**
 * Reads a definitions file for showing it. Throws when the text is not a version-1 file
 * at all (not JSON, no `bots` array, another version). Inside it, an entry with no usable
 * id or name, a repeated id or an unknown kind is left out; anything else is kept and
 * named in `warnings` (a long instructions text, a missing agent, an unknown look name,
 * a second main bot: the first one counts). A retired agent (models.js LEGACY_AGENTS, as
 * `gemini`) is read as its replacement, with a warning; a model pin made for it (the bot's
 * `model`, or `worker.model` when its workers ran it) is dropped, since the replacement
 * doesn't take it. `raw` is the file exactly as read, a separate
 * copy: edit that one to write the file back (bots.js writeBots), so entries left out of
 * `file` survive.
 */
export function parseBots(text) {
  const raw = JSON.parse(text);
  if (!isObject(raw)) throw new Error("bots.json: not an object");
  if (raw.version !== 1) throw new Error(`bots.json: version ${JSON.stringify(raw.version)}, expected 1`);
  if (!Array.isArray(raw.bots)) throw new Error("bots.json: no bots list");
  const warnings = [];
  const categories = [];
  for (const c of Array.isArray(raw.categories) ? raw.categories : []) {
    if (!isObject(c) || !isText(c.id) || typeof c.title !== "string") { warnings.push("a category with no id or title is left out"); continue; }
    if (categories.some((k) => k.id === c.id)) { warnings.push(`category ${c.id} is listed twice; the first counts`); continue; }
    if (!CATEGORY_ID.test(c.id)) warnings.push(`category ${JSON.stringify(c.id)}: an id is a lowercase slug (a-z, 0-9, single dashes); it gets no pane label`);
    const cat = { ...c };
    if (cat.sub !== undefined && typeof cat.sub !== "string") delete cat.sub;
    categories.push(cat);
  }
  const bots = [];
  raw.bots.forEach((b, i) => {
    const where = isObject(b) && isText(b.id) ? b.id : `entry ${i + 1}`;
    if (!isObject(b) || !isText(b.id)) return warnings.push(`${where}: no id, left out`);
    if (bots.some((k) => k.id === b.id)) return warnings.push(`${where}: id used twice, left out`);
    if (!isText(b.name)) return warnings.push(`${where}: no name, left out`);
    if (!KINDS.includes(b.kind)) return warnings.push(`${where}: unknown kind ${JSON.stringify(b.kind)}, left out`);
    const bot = { ...b };
    if (!ID_SHAPE.test(bot.id)) warnings.push(`${where}: id is not b- plus 10 base32 characters`);
    if (typeof bot.role !== "string") { if (bot.role !== undefined) warnings.push(`${where}: role is not text`); bot.role = ""; }
    if (typeof bot.instructions !== "string") { if (bot.instructions !== undefined) warnings.push(`${where}: instructions are not text`); bot.instructions = ""; }
    if (bot.instructions.length > MAX_INSTRUCTIONS) warnings.push(`${where}: instructions longer than ${MAX_INSTRUCTIONS} characters`);
    if (!isObject(bot.look) || typeof bot.look.character !== "string" || typeof bot.look.colour !== "string") {
      warnings.push(`${where}: no look, the default is used`);
      bot.look = defaultLook(bot.id);
    } else {
      if (!CHARACTERS.includes(bot.look.character)) warnings.push(`${where}: unknown character ${bot.look.character}`);
      if (!COLOURS.includes(bot.look.colour)) warnings.push(`${where}: unknown colour ${bot.look.colour}`);
    }
    if (bot.planned !== undefined && (!isObject(bot.planned) || !isWave(bot.planned.wave))) {
      warnings.push(`${where}: planned needs a positive whole wave; ignored`);
      delete bot.planned;
    }
    if (bot.agent !== undefined && !isText(bot.agent)) delete bot.agent;
    if (!bot.agent && !bot.planned) warnings.push(`${where}: no coding agent`);
    if (bot.model !== undefined && typeof bot.model !== "string") delete bot.model;
    const workerWhy = workerProblem(bot.worker);
    if (workerWhy) { warnings.push(`${where}: ${workerWhy}; ignored`); delete bot.worker; }
    const retired = (k) => (typeof k === "string" && Object.hasOwn(LEGACY_AGENTS, k) ? k : null);
    const seatOld = retired(bot.agent);
    const workerOld = isObject(bot.worker) ? retired(bot.worker.agent) ?? (bot.worker.agent ? null : seatOld) : null;
    const old = seatOld ?? workerOld;
    if (old) {
      const dropped = [];
      if (seatOld) {
        bot.agent = LEGACY_AGENTS[seatOld];
        if (bot.model) { dropped.push(`model pin ${bot.model}`); delete bot.model; }
      }
      if (workerOld) {
        const w = { ...bot.worker };
        if (w.agent) w.agent = LEGACY_AGENTS[w.agent];
        if (w.model) { dropped.push(`worker model ${w.model}`); delete w.model; }
        bot.worker = w;
      }
      const tail = dropped.length ? ` (${dropped.join(" and ")} dropped)` : "";
      warnings.push(`${where}: agent ${old} is retired; it runs on ${LEGACY_AGENTS[old]}${tail}`);
    }
    if (bot.rank !== undefined && !RANKS.includes(bot.rank)) {
      warnings.push(`${where}: unknown rank ${JSON.stringify(bot.rank)}; ignored (one of ${RANKS.join(", ")})`);
      delete bot.rank;
    }
    if (bot.kind === "main" && bot.lead !== undefined) { warnings.push(`${where}: a main bot has no lead; ignored`); delete bot.lead; }
    if (bot.lead !== undefined && !isText(bot.lead)) delete bot.lead;
    if (bot.category !== undefined && !categories.some((c) => c.id === bot.category)) warnings.push(`${where}: unknown category ${bot.category}`);
    bots.push(bot);
  });
  const mains = bots.filter((b) => b.kind === "main");
  if (mains.length === 0) warnings.push("no main bot");
  if (mains.length > 1) warnings.push(`${mains.length} main bots; ${mains[0].id} counts`);
  const file = { ...raw, version: 1, categories, bots };
  for (const b of bots) {
    if (b.kind !== "member") continue;
    const { warning } = effectiveLead(file, b.id);
    if (warning) warnings.push(`${b.id}: ${warning}`);
  }
  return { file, warnings, raw: JSON.parse(text) };
}

/** The project's main bot: the first `kind: "main"` entry, or null. */
export function mainBotOf(file) {
  return file.bots.find((b) => b.kind === "main") ?? null;
}

/**
 * Whom a bot reports to (A1): its `lead`, else the main bot. A lead that is missing,
 * planned, not a counting bot, or that leads back to this bot falls back to the main bot
 * with a warning. The main bot itself, an unknown id, or a file with no main bot: "".
 */
export function effectiveLead(file, botId) {
  const main = mainBotOf(file);
  const bot = file.bots.find((b) => b.id === botId);
  if (!bot) return { lead: "", warning: `no bot ${botId}` };
  if (!main) return { lead: "", warning: "no main bot" };
  if (bot === main) return { lead: "" };
  const byId = new Map(file.bots.map((b) => [b.id, b]));
  const leadOf = (b) => b.lead ?? main.id;
  const first = leadOf(bot);
  const fallback = (why) => ({ lead: main.id, warning: `lead ${first} ${why}; reports to the main bot` });
  if (first === main.id) return { lead: main.id };
  const target = byId.get(first);
  if (!target) return fallback("is missing");
  if (target.planned) return fallback("is planned");
  if (target.kind === "main") return fallback("is not the counting main bot");
  // Follow the chain up: back to this bot is a cycle. A chain that breaks further up
  // (missing, planned, a cycle not through this bot) ends at the main bot there instead.
  const seen = new Set([bot.id]);
  for (let cur = target; cur && cur !== main && cur.kind !== "main" && !cur.planned;) {
    if (seen.has(cur.id)) return cur.id === bot.id ? fallback("leads back to this bot") : { lead: first };
    seen.add(cur.id);
    cur = byId.get(leadOf(cur));
  }
  return { lead: first };
}

/**
 * Every reason a file must not be written as it is (empty: fine). Stricter than parseBots.
 * A category id that isn't a slug is refused only when it is new: one `before` (the file the
 * edit started from, its text or object; null: none) already lists stays writable, so a
 * hand-written file is never locked; it just gets no category= label (effectiveCategory).
 */
export function checkBots(file, before = null) {
  let had = before;
  if (typeof had === "string") { try { had = JSON.parse(had); } catch { had = null; } }
  const oldIds = new Set((Array.isArray(had?.categories) ? had.categories : []).map((c) => c?.id).filter(isText));
  const errors = [];
  if (!isObject(file) || file.version !== 1 || !Array.isArray(file.bots)) return ["not a version-1 bots file"];
  const cats = Array.isArray(file.categories) ? file.categories : [];
  if (!Array.isArray(file.categories)) errors.push("no categories list");
  const catIds = new Set();
  for (const c of cats) {
    if (!isObject(c) || !isText(c.id) || typeof c.title !== "string") errors.push("a category has no id or title");
    else if (catIds.has(c.id)) errors.push(`category ${c.id} is listed twice`);
    else if (!CATEGORY_ID.test(c.id) && !oldIds.has(c.id)) { errors.push(`category ${JSON.stringify(c.id)}: a new id is a lowercase slug (a-z, 0-9, single dashes)`); catIds.add(c.id); }
    else catIds.add(c.id);
  }
  const ids = new Set();
  for (const b of file.bots) {
    if (!isObject(b) || !ID_SHAPE.test(b.id ?? "")) { errors.push(`${b?.id ?? "a bot"}: id is not b- plus 10 base32 characters`); continue; }
    const at = b.id;
    if (ids.has(at)) errors.push(`${at}: id used twice`);
    ids.add(at);
    if (!isText(b.name)) errors.push(`${at}: no name`);
    if (!KINDS.includes(b.kind)) errors.push(`${at}: unknown kind`);
    if (!isObject(b.look) || !isText(b.look.character) || !isText(b.look.colour)) errors.push(`${at}: no look`);
    if (typeof b.role !== "string") errors.push(`${at}: no role`);
    if (typeof b.instructions !== "string") errors.push(`${at}: no instructions`);
    else if (b.instructions.length > MAX_INSTRUCTIONS) errors.push(`${at}: instructions longer than ${MAX_INSTRUCTIONS} characters`);
    if (b.planned !== undefined && (!isObject(b.planned) || !isWave(b.planned.wave))) errors.push(`${at}: planned needs a positive whole wave`);
    if (!b.planned && !isText(b.agent)) errors.push(`${at}: no coding agent`);
    if (b.kind === "main" && b.lead !== undefined) errors.push(`${at}: a main bot has no lead`);
    if (b.category !== undefined && !catIds.has(b.category)) errors.push(`${at}: unknown category ${b.category}`);
    if (b.rank !== undefined && !RANKS.includes(b.rank)) errors.push(`${at}: unknown rank ${JSON.stringify(b.rank)}`);
  }
  const mains = file.bots.filter((b) => b?.kind === "main").length;
  if (mains !== 1) errors.push(`${mains} main bots; a project has exactly one`);
  else if (!errors.length) {
    for (const b of file.bots) {
      if (b.kind !== "member") continue;
      const { warning } = effectiveLead(file, b.id);
      if (warning) errors.push(`${b.id}: ${warning}`);
    }
  }
  return errors;
}

// POSIX path helpers: the folders come from spaces and git, on this machine or another.
const trimSlash = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
const parentOf = (p) => { const i = p.lastIndexOf("/"); return i <= 0 ? "/" : p.slice(0, i); };
const baseOf = (p) => p.slice(p.lastIndexOf("/") + 1);

/**
 * The project a folder belongs to (DESIGN Decision 15), two ways: `{ key, own }`.
 * In git both are its main checkout, the parent of
 * `git rev-parse --path-format=absolute --git-common-dir` (for a common dir not named
 * `.git`, a bare repo or a submodule, the folder's own top level). Outside git, or where git
 * is missing or fails: `key` is the nearest folder at or above it holding
 * `.herdr/bots.json`, else the folder itself (the walk-up, for a folder seen in passing: a
 * pane's or a space's); `own` is the folder itself (for a folder someone picked or named
 * as the project: never keyed to a parent project without asking).
 * `git(args, cwd)` resolves with git's stdout, or null when git failed or is missing;
 * `exists(path)` with whether that file is there. Either rejecting means the folder's
 * machine can't be asked now: projectOf rejects too, never guessing "not in git".
 */
export async function projectOf(folder, git, exists) {
  const start = trimSlash(folder);
  const ask = async (args) => (await git(args, start))?.trim() || null;
  const common = await ask(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (common) {
    const dir = trimSlash(common);
    if (baseOf(dir) === ".git") { const main = parentOf(dir); return { key: main, own: main }; }
    const top = await ask(["rev-parse", "--show-toplevel"]);
    if (top) return { key: trimSlash(top), own: trimSlash(top) };
  }
  for (let dir = start; ; dir = parentOf(dir)) {
    if (await exists(`${dir === "/" ? "" : dir}/${BOTS_PATH}`)) return { key: dir, own: start };
    if (dir === "/" || !dir.includes("/")) break;
  }
  return { key: start, own: start };
}

/** The walk-up key of a folder seen in passing (projectOf's `key`). */
export async function projectKeyOf(folder, git, exists) {
  return (await projectOf(folder, git, exists)).key;
}

/** The bots under `botId` at any depth (by effective lead): none of them can be its lead. */
export function descendantsOf(file, botId) {
  const out = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const b of file.bots) {
      if (out.has(b.id) || b.id === botId || b.kind !== "member") continue;
      const { lead } = effectiveLead(file, b.id);
      if (lead === botId || out.has(lead)) { out.add(b.id); grew = true; }
    }
  }
  return out;
}

/**
 * The category a bot shows under (A2): a direct report of the main bot carries its own;
 * a deeper member is under its lead's chain, so it takes the category of the direct report
 * that chain ends at. Null for the main bot, an unknown bot, a category not in the file, or
 * an id that isn't a slug (free text never reaches a pane label).
 */
export function effectiveCategory(file, botId) {
  const main = mainBotOf(file);
  const byId = new Map(file.bots.map((b) => [b.id, b]));
  let bot = byId.get(botId);
  for (let steps = 0; bot && main && bot !== main && steps <= file.bots.length; steps += 1) {
    const { lead } = effectiveLead(file, bot.id);
    if (lead === main.id) {
      const known = (file.categories ?? []).some((c) => c?.id === bot.category);
      return known && CATEGORY_ID.test(bot.category) ? bot.category : null;
    }
    bot = byId.get(lead);
  }
  return null;
}

/** `planned` from the form: wave and note from it, the stored object's other keys kept. */
export function plannedOf(stored, wave, note) {
  const out = { ...(stored ?? {}), wave };
  if (note) out.note = note; else delete out.note;
  return out;
}

/** Automagik's Omni look: the octopus in deepseek. */
export const OMNI_LOOK = Object.freeze({ character: "octopus", colour: "deepseek" });

/** A category id for a new title, unique among `categories`. */
export function newCategoryId(title, categories = []) {
  const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "category";
  const taken = new Set(categories.map((c) => c?.id));
  let id = slug;
  for (let n = 2; taken.has(id); n += 1) id = `${slug}-${n}`;
  return id;
}

/**
 * A copy of `raw` (parseBots' raw file, or a new one) with one bot created or edited, the
 * Create form's write-back. `entry` holds every field the form edits; an optional one it
 * leaves out or empty is removed (planned, lead, category, agent, model); other keys the
 * stored entry had are kept. `rank` (A16) and `worker` are removed only when `entry` names
 * them empty, so a front end that doesn't edit them (the form has no worker fields) keeps the
 * stored ones; a `worker` with none of its fields left is removed too.
 * A lead equal to the main bot is stored as no lead; a category goes only with the main bot
 * as lead; `newCategory` ({ title, sub }) is added to the categories and used.
 */
export function applyBotEdit(raw, entry, newCategory = null) {
  const out = JSON.parse(JSON.stringify(raw ?? { version: 1, categories: [], bots: [] }));
  out.version ??= 1;
  if (!Array.isArray(out.categories)) out.categories = [];
  if (!Array.isArray(out.bots)) out.bots = [];
  const bot = { ...entry };
  if (newCategory?.title?.trim()) {
    const cat = { id: newCategoryId(newCategory.title, out.categories), title: newCategory.title.trim() };
    if (newCategory.sub?.trim()) cat.sub = newCategory.sub.trim();
    out.categories.push(cat);
    bot.category = cat.id;
  }
  const main = out.bots.find((b) => b?.kind === "main" && b.id !== bot.id);
  if (bot.kind === "main" || (main && bot.lead === main.id)) delete bot.lead;
  if (bot.kind === "main" || bot.lead) delete bot.category;
  const i = out.bots.findIndex((b) => b?.id === bot.id);
  const merged = i >= 0 ? { ...out.bots[i], ...bot } : bot;
  for (const k of ["planned", "lead", "category", "agent", "model"]) {
    if (!(k in bot) || bot[k] === undefined || bot[k] === null || bot[k] === "") delete merged[k];
  }
  if ("rank" in bot && (bot.rank === undefined || bot.rank === null || bot.rank === "")) delete merged.rank;
  if ("worker" in bot && (!isObject(bot.worker) || Object.keys(bot.worker).length === 0)) delete merged.worker;
  if (i >= 0) out.bots[i] = merged; else out.bots.push(merged);
  return out;
}

/**
 * The projects the command line touched (it creates, edits, starts or attaches bots in them),
 * so the sidebar shows them with no open space: a JSON array of project keys on this
 * computer, `PROJECTS_FILE` in the app home (outside mods/, so writing it reloads nothing).
 * Only the CLI writes it; the sidebar reads it beside its own remembered list.
 */
export const PROJECTS_FILE = "am-sidebar-projects.json";
export const MAX_LISTED_PROJECTS = 200;

/** The keys in a PROJECTS_FILE text (null, unparsable or the wrong shape: none). */
export function listedProjects(text) {
  let list;
  try { list = typeof text === "string" && text ? JSON.parse(text) : []; } catch { return []; }
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((k) => typeof k === "string" && k.startsWith("/")))];
}

/** A PROJECTS_FILE text with `key` last (the most recent), once, keeping the newest `max`. */
export function withListedProject(text, key, max = MAX_LISTED_PROJECTS) {
  const keys = [...listedProjects(text).filter((k) => k !== key), key].slice(-max);
  return `${JSON.stringify(keys, null, 2)}\n`;
}
