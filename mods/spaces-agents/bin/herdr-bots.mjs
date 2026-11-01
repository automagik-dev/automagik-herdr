#!/usr/bin/env node
// herdr-bots: the Bots of a project from the command line (A11). The same rules as the
// sidebar (model.js, launchArgs.js, briefingText.mjs, models.js, briefing.mjs' gathering),
// with herdr-core reached through `hc` directly. Plain node (≥ 24): no `herdr` or `gpui`
// import, no Herdr window.
// Install: ln -s ~/.config/herdr-app/mods/spaces-agents/bin/herdr-bots.mjs ~/.local/bin/herdr-bots
// Apache-2.0.

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, constants, existsSync, linkSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync,
  unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { BOT_LABEL, BOTS_PATH, CHARACTERS, COLOURS, KINDS, MAX_INSTRUCTIONS, OMNI_LOOK, applyBotEdit, checkBots,
  PROJECTS_FILE, RANKS, defaultLook, descendantsOf, effectiveLead, listedProjects, mainBotOf, newBotId, newCategoryId,
  parseBots, plannedOf, projectKeyOf, withListedProject } from "../model.js";
import { UNANSWERED, attachRefusal, detachWords, hcName, isClaude, labelMoves, labelWords, paneLabels, paneOf, parentArgs,
  placementFrom, relabelPlan, relabelWords, rowsOf, startArgs, startRefusal, youngPane } from "../launchArgs.js";
import { installHook } from "../briefingText.mjs";
import { gatherBriefing } from "../briefing.mjs";
import { agentKeyOfArgv, defaultModel, knownModels, modelArgs, shownModel, withOverrides } from "../models.js";

/** A refusal or a usage mistake: printed on stderr, exit `code`. */
export class CliError extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}

// ---- files and programs ----

/** A file's text, or null when it isn't there. Any other read failure is a CliError. */
export function readText(path) {
  try { return readFileSync(path, "utf8"); } catch (e) {
    if (e?.code === "ENOENT" || e?.code === "ENOTDIR") return null;
    throw new CliError(`Can't read ${path}: ${e?.message ?? e}`);
  }
}
const exists = async (path) => { try { accessSync(path); return true; } catch { return false; } };
const under = (key, rest) => `${key === "/" ? "" : key}/${rest}`;

// At most this many programs at once: `ls --all` over many bots stays a handful of processes.
const MAX_RUNNING = 8;
let running = 0;
const waiting = [];
async function slot(fn) {
  if (running >= MAX_RUNNING) await new Promise((go) => waiting.push(go));
  running += 1;
  try { return await fn(); } finally { running -= 1; waiting.shift()?.(); }
}

/** Runs a program: { code, stdout, stderr }; code 127 when it isn't there. */
export function runProgram(command, args, { cwd, timeout = 15000 } = {}) {
  return slot(() => new Promise((done) => {
    try {
      execFile(command, args, { cwd, timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (!err) return done({ code: 0, stdout, stderr });
        done({ code: err.code === "ENOENT" ? 127 : (typeof err.code === "number" ? err.code : 1), stdout: stdout ?? "", stderr: stderr || String(err.message) });
      });
    } catch (e) { done({ code: 127, stdout: "", stderr: String(e?.message ?? e) }); }
  }));
}
const git = async (args, cwd) => { const r = await runProgram("git", args, { cwd }); return r.code === 0 ? r.stdout : null; };

/** The project a folder keys to (DESIGN Decision 15). */
export const keyOf = (folder) => projectKeyOf(resolvePath(folder), git, exists);

async function hc(args) {
  const r = await runProgram("hc", args);
  if (r.code === 127) throw new CliError("hc (herdr-core) is not on PATH.");
  return r;
}
const parsed = (r, args) => {
  try { return JSON.parse(r.stdout); } catch { throw new CliError(`hc ${args.join(" ")} printed no JSON: ${r.stdout.slice(0, 200)}`); }
};
/** `hc <args> --json`, parsed. A failed call throws: a failure never reads as "no pane". */
async function hcJson(args) {
  const r = await hc([...args, "--json"]);
  if (r.code !== 0) throw new CliError(`hc ${args.join(" ")} failed: ${(r.stderr || r.stdout).trim()}`);
  return parsed(r, args);
}
/** `hc get <t> --json`, or null when hc says there is no such terminal (hc itself missing still throws). */
async function hcGet(terminal) {
  const r = await hc(["get", terminal, "--json"]);
  return r.code === 0 ? parsed(r, ["get", terminal]) : null;
}
const local = (address) => typeof address === "string" && !address.includes("/");

function appHome(env = process.env) { return (env.HERDR_APP_HOME || `${homedir()}/.config/herdr-app`).replace(/\/+$/, ""); }
const home = () => process.env.HOME || homedir();
const modelIo = () => ({ home: home(), read: (p) => { try { return readText(p); } catch { return null; } } });
/** The agents Herdr can start: its shipped table with the app home's programs.json applied. */
const agentTable = () => withOverrides(readText(`${appHome()}/programs.json`));

function onPath(program) {
  if (program.includes("/")) { try { accessSync(program, constants.X_OK); return true; } catch { return false; } }
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    try { accessSync(`${dir}/${program}`, constants.X_OK); return true; } catch { /* next */ }
  }
  return false;
}

// ---- the definitions file ----

const EMPTY = () => ({ version: 1, categories: [], bots: [] });

/** A project's definitions: { key, text (null: no file), raw, file, warnings }. */
export function loadProject(key) {
  const text = readText(under(key, BOTS_PATH));
  if (text === null) return { key, text, raw: EMPTY(), file: EMPTY(), warnings: [] };
  let parsedFile;
  try { parsedFile = parseBots(text); } catch (e) { throw new CliError(`${under(key, BOTS_PATH)}: ${e?.message ?? e}`); }
  return { key, text, raw: parsedFile.raw, file: parsedFile.file, warnings: parsedFile.warnings };
}

const fsIo = {
  read: readText,
  mkdir: (dir) => mkdirSync(dir, { recursive: true }),
  create: (path, text) => writeFileSync(path, text, { flag: "wx" }),
  replace: (path, text) => {
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, text);
    try { renameSync(tmp, path); } catch (e) { try { unlinkSync(tmp); } catch { /* gone already */ } throw e; }
  },
  remove: (path) => unlinkSync(path),
};

/**
 * Writes a project's definitions by bots.js writeBots' rule: the whole raw file must pass
 * checkBots, and the file must still hold `expected`, the text the edit started from (null:
 * no file yet), else nothing is written. A new file gets its `.herdr/` folder first and is
 * created exclusively; an existing one is replaced whole (written beside, then renamed).
 * `raw === null` deletes the file (the project's last bot removed).
 */
export function writeBotsFile(key, raw, expected, io = fsIo) {
  if (expected === undefined) throw new Error("writeBotsFile: pass the text the edit started from (null for a new file)");
  const path = under(key, BOTS_PATH);
  if (raw !== null) {
    const errors = checkBots(raw);
    if (errors.length) throw new CliError(`Not saved: ${errors.join("; ")}`);
  }
  let now;
  try { now = io.read(path); } catch (e) { throw new CliError(`Not saved: can't read ${path} again: ${e?.message ?? e}`); }
  if (now !== expected) throw new CliError(`Not saved: ${path} changed since it was read (another edit landed first). Run the command again.`);
  try {
    if (raw === null) return io.remove(path);
    const text = `${JSON.stringify(raw, null, 2)}\n`;
    if (expected === null) { io.mkdir(under(key, ".herdr")); io.create(path, text); } else io.replace(path, text);
  } catch (e) {
    if (e?.code === "EEXIST") throw new CliError(`Not saved: ${path} appeared since it was read. Run the command again.`);
    throw new CliError(`Not saved: ${e?.message ?? e}`);
  }
}

// A lock beside the project list: made exclusively (wx) holding its holder's pid and a token,
// so one CLI at a time edits the list, and a holder removes only its own lock. Waited for up
// to LOCK_WAIT ms; one older than LOCK_STALE ms (a CLI killed mid-write) is taken over.
// Without it, two CLIs that read the list at once each write their own copy.
const LOCK_WAIT = 3000;
const LOCK_STALE = 10_000;
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const stale = (path) => { try { return Date.now() - statSync(path).mtimeMs > LOCK_STALE; } catch { return false; } };

// A stale lock is moved aside first, so of two waiters only one takes it. Aside, it is checked
// again: a lock made fresh in between goes back (by link, which never replaces a newer one).
function takeOverStale(lock) {
  if (!stale(lock)) return;
  const aside = `${lock}.${process.pid}`;
  try { renameSync(lock, aside); } catch { return; } // another waiter moved it first
  if (!stale(aside)) { try { linkSync(aside, lock); } catch { /* a newer lock is there */ } }
  try { unlinkSync(aside); } catch { /* gone already */ }
}

function withLock(lock, fn) {
  const token = `${process.pid} ${randomUUID()}`;
  const until = Date.now() + LOCK_WAIT;
  for (;;) {
    try { writeFileSync(lock, token, { flag: "wx" }); break; } catch (e) {
      if (e?.code !== "EEXIST") throw e;
      takeOverStale(lock);
      if (Date.now() > until) throw new Error(`${lock} is held by another herdr-bots`);
      pause(5 + Math.floor(Math.random() * 20));
    }
  }
  try { return fn(); } finally {
    try { if (readFileSync(lock, "utf8") === token) unlinkSync(lock); } catch { /* gone already */ }
  }
}

/**
 * Adds a project to the list the sidebar reads beside its own remembered projects
 * (model.js PROJECTS_FILE, in the app home outside mods/, so the write reloads nothing), so a
 * project managed from here shows in the sidebar with no space open on it. Under a lock:
 * read, add, write beside, rename, read again; tried three times until the key is there.
 * No app home (Herdr isn't set up here): nothing is written. A failure only warns: the
 * command's own work is done.
 */
export function listProject(key, dir = appHome()) {
  const path = `${dir}/${PROJECTS_FILE}`;
  const read = () => { try { return readFileSync(path, "utf8"); } catch (e) { if (e?.code === "ENOENT") return null; throw e; } };
  let why = "it was still missing after three writes";
  if (!existsSync(dir)) return false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      withLock(`${path}.lock`, () => {
        const text = read();
        const next = withListedProject(text, key);
        if (next !== text) fsIo.replace(path, next);
      });
      if (listedProjects(read()).includes(key)) return true;
    } catch (e) { why = e?.message ?? String(e); }
  }
  process.stderr.write(`herdr-bots: couldn't list ${key} in ${path}, so the sidebar shows it only once a space is open on it: ${why}\n`);
  return false;
}

/** A bot by id, else by its name (exact, then ignoring case), unique in the project. */
export function findBot(file, ref) {
  if (!ref) throw new CliError("Name a bot (its id or its name).", 2);
  const byId = file.bots.find((b) => b.id === ref);
  if (byId) return byId;
  for (const same of [(b) => b.name === ref, (b) => b.name.toLowerCase() === String(ref).toLowerCase()]) {
    const hits = file.bots.filter(same);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) throw new CliError(`${hits.length} bots are named "${ref}" (${hits.map((b) => b.id).join(", ")}); use the id.`);
  }
  throw new CliError(`No bot "${ref}" in this project.`);
}

function findCategory(file, ref) {
  const hit = file.categories.find((c) => c.id === ref) ?? file.categories.find((c) => c.title.toLowerCase() === String(ref).toLowerCase());
  if (!hit) throw new CliError(`No category "${ref}" in this project; add it first: herdr-bots category add --title "${ref}".`);
  return hit;
}

// ---- live panes (DESIGN Decision 3, through launchArgs.js paneOf) ----

/**
 * The panes carrying `bot=<id>` by the shared live rule: { live (hc get of the live one, or
 * null), duplicate, holders (every address carrying the label), gets }. A failed hc call
 * throws. Deliberate differences: Start, Attach and Detach pass `localOnly` (they act on this
 * computer only, as launch.js does); ls, show and brief look at every machine hc reaches.
 */
export async function panesOf(botId, { localOnly = false } = {}) {
  const p = await paneOf(botId, hcJson, { localOnly });
  return { live: p.get, duplicate: p.duplicate, holders: p.addresses, gets: p.gets };
}

/** One bot as ls and show print it. With hc failing, the bot is still shown, its pane unknown. */
async function describe(project, bot) {
  const { file } = project;
  let panes = { live: null, duplicate: false, holders: [] };
  let hcError = null;
  if (!bot.planned) {
    try { panes = await panesOf(bot.id); } catch (e) { if (!(e instanceof CliError)) throw e; hcError = e.message; }
  }
  const live = panes.live;
  const lead = bot.kind === "member" ? effectiveLead(file, bot.id) : { lead: "" };
  const fallback = bot.agent ? defaultModel(bot.agent, modelIo()) : null;
  const shown = shownModel({ argv: live?.foreground?.argv, agentKey: bot.agent, pinned: bot.model, fallback });
  let status = "not running";
  if (bot.planned) status = "planned";
  else if (hcError) status = "hc unavailable";
  else if (live) status = live.status?.state ?? "running";
  const out = {
    id: bot.id, name: bot.name, kind: bot.kind, project: project.key,
    lead: lead.lead || null, leadName: file.bots.find((b) => b.id === lead.lead)?.name ?? null,
    category: bot.kind === "member" && lead.lead === mainBotOf(file)?.id ? (bot.category ?? null) : null,
    planned: bot.planned ?? null, agent: bot.agent ?? null,
    model: shown.model, modelSource: shown.source, pinnedModel: bot.model ?? null,
    terminal: live?.address ?? null, status, duplicate: panes.duplicate,
    role: bot.role, rank: bot.rank ?? null, look: bot.look,
  };
  if (lead.warning) out.warning = lead.warning;
  if (hcError) out.hcError = hcError;
  return out;
}

// ---- the briefing hook (briefingText.mjs installHook, as launch.js afterBind uses it) ----

const hookIo = {
  git: (args, cwd) => runProgram("git", args, { cwd }),
  read: async (path) => readText(path),
  write: async (path, text, before) => {
    if (readText(path) !== before) throw new Error(`${path} changed while being edited`);
    fsIo.replace(path, text);
  },
  mkdir: async (dir) => { mkdirSync(dir, { recursive: true }); },
};

/** Merges the per-turn briefing hook for a Claude bot; never throws: { written, warnings }. */
export function writeBriefingHook(bot, folder, appHomeDir = appHome()) {
  return installHook(bot.name, folder, appHomeDir, hookIo);
}

// ---- arguments ----

const OPTIONS = {
  json: { type: "boolean" }, all: { type: "boolean" }, help: { type: "boolean", short: "h" },
  project: { type: "string" }, name: { type: "string" }, agent: { type: "string" }, kind: { type: "string" },
  role: { type: "string" }, instructions: { type: "string" }, "instructions-file": { type: "string" },
  lead: { type: "string" }, category: { type: "string" }, "no-category": { type: "boolean" },
  character: { type: "string" }, colour: { type: "string" }, color: { type: "string" }, omni: { type: "boolean" },
  model: { type: "string" }, "no-model": { type: "boolean" }, rank: { type: "string" },
  "planned-wave": { type: "string" }, "planned-note": { type: "string" }, unplanned: { type: "boolean" },
  space: { type: "string" }, tab: { type: "string" },
  title: { type: "string" }, sub: { type: "string" }, id: { type: "string" },
};

export const USAGE = `herdr-bots: a project's Bots from the command line

Usage: herdr-bots <command> [options]      (every command takes --json and --project <folder>)

  ls [--all]                    bots with kind, lead, category, rank, planned, agent, model, pane, status
  show <bot>                    one bot in full
  create --name N --agent A [--kind main|member] [--role R]
         [--instructions TEXT | --instructions-file F|-] [--lead BOT] [--category ID]
         [--character C --colour K | --omni] [--model M] [--rank R]
         [--planned-wave N [--planned-note T]]          prints the new bot's id
  edit <bot> [the create options] [--unplanned] [--no-model] [--no-category] [--rank '']
  rm <bot>
  category ls | add --title T [--sub S] [--id ID] | edit <id> [--title T] [--sub S]
           | rm <id> | order <id>...
  start <bot> [--space ID] [--tab ID]   a new pane on this computer (prints its terminal)
  attach <bot> <terminal>       tie a running pane to the bot
  detach <bot>                  take the bot's label off its panes (a removed bot: by its id)
  brief <bot>                   print the bot's per-turn briefing as it would be now

--rank R sets the pane's role= label, one of: ${RANKS.join(", ")}.
The main bot's pane is role=main, and a bot that leads others is role=captain, whatever their
rank. Start, attach, detach and an edit keep the panes' bot, role, category and squad labels
in step on this computer.

A bot is its id or its name in the project. The project is the one the current folder
keys to (its git main checkout), or --project's.`;

function readInstructions(opts) {
  if (opts.instructions !== undefined && opts["instructions-file"] !== undefined) throw new CliError("Give --instructions or --instructions-file, not both.", 2);
  let text = opts.instructions;
  if (opts["instructions-file"] !== undefined) {
    const f = opts["instructions-file"];
    try { text = readFileSync(f === "-" ? 0 : f, "utf8"); } catch (e) { throw new CliError(`Can't read ${f}: ${e?.message ?? e}`); }
    text = text.replace(/\n$/, "");
  }
  if (text !== undefined && text.length > MAX_INSTRUCTIONS) {
    throw new CliError(`Instructions are ${text.length} characters; the limit is ${MAX_INSTRUCTIONS}. Nothing was saved.`);
  }
  return text;
}

function checkModel(agent, model) {
  if (!agent) throw new CliError("A model pin needs a coding agent (--agent).", 2);
  const list = knownModels(agent, modelIo());
  if (!list.includes(model)) {
    throw new CliError(list.length ? `${model} isn't a known ${agent} model. Pick one of: ${list.join(", ")}.`
      : `There is no list of ${agent} models to pin from; leave the model unpinned (the running one is detected).`);
  }
}

/**
 * The entry create or edit writes: `base` (the stored raw entry, or a new one) with the
 * options given applied and checked against the project. Throws a CliError on a refusal.
 */
export function entryFrom(opts, base, project, { creating }) {
  const { file } = project;
  const entry = JSON.parse(JSON.stringify(base));
  if (opts.name !== undefined) {
    if (!opts.name.trim()) throw new CliError("A bot needs a name.", 2);
    entry.name = opts.name.trim();
  }
  if (!entry.name) throw new CliError("A bot needs a name (--name).", 2);
  const twin = file.bots.find((b) => b.id !== entry.id && b.name.toLowerCase() === entry.name.toLowerCase());
  if (twin) throw new CliError(`${twin.id} is already named "${twin.name}" in this project; names pick bots, so pick another.`);
  if (opts.kind !== undefined) {
    if (!KINDS.includes(opts.kind)) throw new CliError(`--kind is main or member, not "${opts.kind}".`, 2);
    entry.kind = opts.kind;
  }
  const main = mainBotOf(file);
  if (creating && !main && entry.kind !== "main") throw new CliError("The first bot in a project must be its main bot (--kind main).");
  if (entry.kind === "main" && main && main.id !== entry.id) throw new CliError(`This project already has a main bot, ${main.name} (${main.id}).`);
  if (opts.role !== undefined) entry.role = opts.role;
  entry.role ??= "";
  // Rank (A16): one of RANKS, for the pane's role= label; --rank '' clears it (kept empty so
  // applyBotEdit removes the stored one).
  if (opts.rank !== undefined) {
    if (opts.rank !== "" && !RANKS.includes(opts.rank)) throw new CliError(`--rank is one of ${RANKS.join(", ")} (or '' to clear), not "${opts.rank}".`, 2);
    entry.rank = opts.rank;
  }
  const instructions = readInstructions(opts);
  if (instructions !== undefined) entry.instructions = instructions;
  entry.instructions ??= "";
  if (opts.agent !== undefined) {
    const agents = agentTable();
    if (!agents[opts.agent]) throw new CliError(`"${opts.agent}" isn't a coding agent Herdr knows. Known: ${Object.keys(agents).join(", ")}.`);
    entry.agent = opts.agent;
  }
  // Planned (A3): a wave and an optional note; --unplanned clears it.
  if (opts.unplanned && opts["planned-wave"] !== undefined) throw new CliError("Give --planned-wave or --unplanned, not both.", 2);
  if (opts.unplanned) delete entry.planned;
  if (opts["planned-wave"] !== undefined) {
    const wave = Number(opts["planned-wave"]);
    if (!Number.isInteger(wave) || wave < 1) throw new CliError("--planned-wave is a positive whole number.", 2);
    entry.planned = plannedOf(entry.planned, wave, opts["planned-note"] ?? entry.planned?.note);
  } else if (opts["planned-note"] !== undefined) {
    if (!entry.planned) throw new CliError("--planned-note goes with --planned-wave.", 2);
    entry.planned = plannedOf(entry.planned, entry.planned.wave, opts["planned-note"]);
  }
  if (!entry.agent && !entry.planned) throw new CliError("A bot needs a coding agent (--agent), unless it is planned.", 2);
  // Model pin (A12): from the agent's list, never free text.
  if (opts.model !== undefined && opts["no-model"]) throw new CliError("Give --model or --no-model, not both.", 2);
  if (opts["no-model"]) delete entry.model;
  if (opts.model !== undefined) { checkModel(entry.agent, opts.model); entry.model = opts.model; }
  else if (entry.model && opts.agent !== undefined && !knownModels(entry.agent, modelIo()).includes(entry.model)) {
    throw new CliError(`${entry.name} is pinned to ${entry.model}, which ${entry.agent} doesn't list; pass --model or --no-model.`);
  }
  // Lead (A1): the main bot or another non-planned member, never itself or one of its own.
  if (opts.lead !== undefined) {
    if (entry.kind === "main") throw new CliError("A main bot has no lead.", 2);
    const lead = findBot(file, opts.lead);
    if (lead.id === entry.id) throw new CliError(`${entry.name} can't lead itself.`);
    if (lead.planned) throw new CliError(`${lead.name} is planned, so it can't lead a bot yet.`);
    if (!creating && descendantsOf(file, entry.id).has(lead.id)) throw new CliError(`${lead.name} reports to ${entry.name}, so it can't be its lead.`);
    entry.lead = lead.id;
  }
  if (entry.kind === "main") delete entry.lead;
  // Category (A2): only for a bot whose lead is the main bot.
  if (opts.category !== undefined && opts["no-category"]) throw new CliError("Give --category or --no-category, not both.", 2);
  if (opts["no-category"]) delete entry.category;
  if (opts.category !== undefined) {
    const leadsToMain = entry.kind === "member" && (!entry.lead || entry.lead === main?.id);
    if (!leadsToMain) throw new CliError("A category goes only on a member that reports to the main bot.", 2);
    entry.category = findCategory(file, opts.category).id;
  }
  // Look: --omni, or a character and colour (one left out keeps the stored or default one).
  const colour = opts.colour ?? opts.color;
  if (opts.omni && (opts.character !== undefined || colour !== undefined)) throw new CliError("Give --omni or --character/--colour, not both.", 2);
  if (opts.character !== undefined && !CHARACTERS.includes(opts.character)) throw new CliError(`Unknown character "${opts.character}". Characters: ${CHARACTERS.join(", ")}.`, 2);
  if (colour !== undefined && !COLOURS.includes(colour)) throw new CliError(`Unknown colour "${colour}". Colours: ${COLOURS.join(", ")}.`, 2);
  const look = entry.look && typeof entry.look === "object" ? entry.look : defaultLook(entry.id);
  if (opts.omni) entry.look = { ...OMNI_LOOK };
  else entry.look = { character: opts.character ?? look.character, colour: colour ?? look.colour };
  return entry;
}

// ---- commands ----

async function projectFor(opts) { return loadProject(await keyOf(opts.project ?? process.cwd())); }

// The projects the sidebar shows with no space open: its remembered list, then this CLI's.
function rememberedKeys() {
  let keys = [];
  try {
    const list = JSON.parse(readText(`${appHome()}/shared.json`) ?? "{}")?.["spaces-agents.projects"];
    keys = Array.isArray(list) ? list.filter((p) => typeof p?.key === "string" && !p.machine).map((p) => p.key) : [];
  } catch { /* unreadable: none */ }
  let listed = [];
  try { listed = listedProjects(readText(`${appHome()}/${PROJECTS_FILE}`)); } catch { /* unreadable: none */ }
  return [...new Set([...keys, ...listed])];
}

async function cmdLs(opts) {
  const keys = [await keyOf(opts.project ?? process.cwd())];
  if (opts.all) for (const k of rememberedKeys()) if (!keys.includes(k)) keys.push(k);
  const projects = [];
  for (const key of keys) {
    let project;
    try { project = loadProject(key); } catch (e) { projects.push({ project: key, error: e.message, categories: [], bots: [], warnings: [] }); continue; }
    if (project.text === null && opts.all && key !== keys[0]) continue; // a remembered project whose file is gone
    const bots = await Promise.all(project.file.bots.map((b) => describe(project, b)));
    projects.push({ project: key, categories: project.file.categories, warnings: project.warnings, bots });
  }
  if (opts.json) return { projects };
  const lines = [];
  for (const p of projects) {
    lines.push(`${p.project}${p.error ? `  (${p.error})` : ""}`);
    if (!p.bots.length && !p.error) lines.push("  no bots");
    for (const b of p.bots) {
      const where = b.kind === "main" ? "main" : `→ ${b.leadName ?? "?"}${b.category ? ` [${b.category}]` : ""}`;
      const model = b.model ? `${b.model} (${b.modelSource})` : "-";
      const status = b.planned ? `planned, wave ${b.planned.wave}` : b.terminal ? `${b.status} in ${b.terminal}${b.duplicate ? " (duplicate label)" : ""}` : b.status;
      lines.push(`  ${b.id}  ${b.name}${b.rank ? ` (${b.rank})` : ""}  ${where}  ${b.agent ?? "-"}  ${model}  ${status}${b.warning ? `  ! ${b.warning}` : ""}`);
    }
    for (const w of p.warnings ?? []) lines.push(`  ! ${w}`);
    const hcError = p.bots.find((b) => b.hcError)?.hcError;
    if (hcError) lines.push(`  ! panes unknown: ${hcError}`);
  }
  return lines.join("\n");
}

async function cmdShow(opts, [ref]) {
  const project = await projectFor(opts);
  const bot = findBot(project.file, ref);
  const info = { ...(await describe(project, bot)), instructions: bot.instructions };
  if (opts.json) return info;
  return [
    `${info.name} (${info.id})`, `  project      ${info.project}`, `  kind         ${info.kind}`,
    ...(info.lead ? [`  lead         ${info.leadName} (${info.lead})`] : []),
    ...(info.category ? [`  category     ${info.category}`] : []),
    ...(info.planned ? [`  planned      wave ${info.planned.wave}${info.planned.note ? ` · ${info.planned.note}` : ""}`] : []),
    `  agent        ${info.agent ?? "-"}`, `  model        ${info.model ? `${info.model} (${info.modelSource})` : "-"}${info.pinnedModel && info.modelSource !== "pinned" ? `, pinned ${info.pinnedModel}` : ""}`,
    `  status       ${info.status}${info.terminal ? ` in ${info.terminal}` : ""}${info.duplicate ? " (duplicate label)" : ""}`,
    `  look         ${info.look.character} in ${info.look.colour}`, `  role         ${info.role || "-"}`,
    `  rank         ${info.rank ?? "-"}`,
    ...(info.warning ? [`  warning      ${info.warning}`] : []),
    "  instructions", ...(info.instructions ? info.instructions.split("\n").map((l) => `    ${l}`) : ["    -"]),
  ].join("\n");
}

// ---- A16 pane labels (launchArgs.js paneLabels): this computer's panes only ----

/** The labels of a bot's live pane on this computer (for the squad it passes on), or null. */
async function leadLabelsOf(file, botId) {
  const bot = file.bots.find((b) => b.id === botId);
  const lead = bot?.kind === "member" ? effectiveLead(file, botId).lead : "";
  if (!lead) return null;
  return (await panesOf(lead, { localOnly: true })).live?.labels ?? null;
}

/**
 * After a write, the live local panes of every bot whose labels the edit changed (rank,
 * lead or category, and a lead's captain status) get them rewritten. The file is saved
 * already, so a failing hc only warns. Resolves with the terminals relabelled.
 */
async function relabelAfter(beforeFile, afterRaw) {
  let afterFile;
  try { afterFile = parseBots(JSON.stringify(afterRaw)).file; } catch { return []; }
  const done = [];
  for (const item of relabelPlan(beforeFile, afterFile)) {
    try {
      const { gets } = await panesOf(item.id, { localOnly: true });
      for (const get of gets.filter((g) => g?.state === "live" && g.address)) {
        const have = get.labels ?? {};
        const lead = have.squad ? null : await leadLabelsOf(afterFile, item.id);
        const words = relabelWords(item.before, paneLabels(afterFile, item.id, have, lead), have);
        if (!words.length) continue;
        const r = await hc(["label", get.address, ...words]);
        if (r.code !== 0) throw new CliError(`hc label ${get.address} failed: ${(r.stderr || r.stdout).trim()}`);
        done.push(get.address);
      }
    } catch (e) {
      if (!(e instanceof CliError)) throw e;
      report([`${item.id}'s pane labels weren't updated: ${e.message}`]);
    }
  }
  return done;
}

async function cmdCreate(opts) {
  const project = await projectFor(opts);
  const id = newBotId();
  const entry = entryFrom(opts, { id, kind: mainBotOf(project.file) ? "member" : "main" }, project, { creating: true });
  const raw = applyBotEdit(project.raw, entry);
  writeBotsFile(project.key, raw, project.text);
  listProject(project.key);
  const relabelled = await relabelAfter(project.file, raw); // a lead that becomes a captain
  return opts.json ? { id, project: project.key, bot: entry, relabelled } : id;
}

async function cmdEdit(opts, [ref]) {
  const project = await projectFor(opts);
  const bot = findBot(project.file, ref);
  const stored = project.raw.bots.find((b) => b?.id === bot.id);
  const entry = entryFrom(opts, stored, project, { creating: false });
  const raw = applyBotEdit(project.raw, entry);
  writeBotsFile(project.key, raw, project.text);
  listProject(project.key);
  const relabelled = await relabelAfter(project.file, raw);
  return opts.json ? { id: bot.id, project: project.key, bot: entry, relabelled } : `${entry.name} (${bot.id}) saved.`;
}

async function cmdRm(opts, [ref]) {
  const project = await projectFor(opts);
  const { file } = project;
  const bot = findBot(file, ref);
  // Every other entry as stored, those parseBots left out included: they are still bots.
  const others = project.raw.bots.filter((b) => b?.id !== bot.id);
  if (bot.kind === "main" && others.length) {
    throw new CliError(`${bot.name} is the main bot and its project still has ${others.length} other bot${others.length > 1 ? "s" : ""}; remove them first.`);
  }
  const team = [...descendantsOf(file, bot.id)].map((id) => file.bots.find((b) => b.id === id)?.name ?? id);
  const leads = others.filter((b) => b?.lead === bot.id).map((b) => b.name ?? b.id);
  if (team.length || leads.length) throw new CliError(`${bot.name} leads ${[...new Set([...leads, ...team])].join(", ")}; give them another lead first (herdr-bots edit <bot> --lead …).`);
  const raw = JSON.parse(JSON.stringify(project.raw));
  raw.bots = raw.bots.filter((b) => b?.id !== bot.id);
  // Only an empty list deletes the file; anything else must pass checkBots (a file left
  // with members and no main bot is refused, never deleted).
  const last = raw.bots.length === 0;
  writeBotsFile(project.key, last ? null : raw, project.text);
  if (!last) await relabelAfter(file, raw); // its lead may stop being a captain
  const notes = [];
  if (last) notes.push(`${bot.name} was the project's last bot: ${under(project.key, BOTS_PATH)} was deleted.`);
  // The file is written already: hc missing or failing only drops the label note.
  let holders = [];
  if (!bot.planned) { try { ({ holders } = await panesOf(bot.id, { localOnly: true })); } catch { holders = []; } }
  if (holders.length) notes.push(`${holders.join(", ")} still carr${holders.length > 1 ? "y" : "ies"} its label; take it off with: herdr-bots detach ${bot.id}`);
  for (const n of notes) process.stderr.write(`herdr-bots: ${n}\n`);
  return opts.json ? { removed: bot.id, project: project.key, deletedFile: last, labelledTerminals: holders } : `${bot.name} (${bot.id}) removed.`;
}

async function cmdCategory(opts, [verb, ...rest]) {
  const project = await projectFor(opts);
  const raw = JSON.parse(JSON.stringify(project.raw));
  raw.categories = Array.isArray(raw.categories) ? raw.categories : [];
  const save = () => {
    if (project.text === null) throw new CliError("This project has no bots yet; create its main bot first.");
    writeBotsFile(project.key, raw, project.text);
    listProject(project.key);
  };
  const find = (ref) => {
    const hit = findCategory(project.file, ref);
    return raw.categories.find((c) => c?.id === hit.id);
  };
  if (verb === "ls" || verb === undefined) {
    const list = project.file.categories.map((c) => ({ ...c, bots: project.file.bots.filter((b) => b.category === c.id).map((b) => b.id) }));
    return opts.json ? { project: project.key, categories: list } : list.map((c) => `${c.id}  ${c.title}${c.sub ? ` · ${c.sub}` : ""}  (${c.bots.length} bot${c.bots.length === 1 ? "" : "s"})`).join("\n") || "no categories";
  }
  if (verb === "add") {
    if (!opts.title?.trim()) throw new CliError("A category needs a title (--title).", 2);
    const id = opts.id ?? newCategoryId(opts.title, raw.categories);
    if (raw.categories.some((c) => c?.id === id)) throw new CliError(`Category ${id} is there already.`);
    const cat = { id, title: opts.title.trim() };
    if (opts.sub?.trim()) cat.sub = opts.sub.trim();
    raw.categories.push(cat);
    save();
    return opts.json ? { project: project.key, category: cat } : id;
  }
  if (verb === "edit") {
    const cat = find(rest[0]);
    if (opts.title !== undefined) { if (!opts.title.trim()) throw new CliError("A category's title can't be empty.", 2); cat.title = opts.title.trim(); }
    if (opts.sub !== undefined) { if (opts.sub.trim()) cat.sub = opts.sub.trim(); else delete cat.sub; }
    save();
    return opts.json ? { project: project.key, category: cat } : `${cat.id} saved.`;
  }
  if (verb === "rm") {
    const cat = find(rest[0]);
    const users = project.file.bots.filter((b) => b.category === cat.id).map((b) => b.name);
    if (users.length) throw new CliError(`${users.join(", ")} ${users.length > 1 ? "are" : "is"} in ${cat.id}; move them first (herdr-bots edit <bot> --category … or --no-category).`);
    raw.categories = raw.categories.filter((c) => c?.id !== cat.id);
    save();
    return opts.json ? { project: project.key, removed: cat.id } : `${cat.id} removed.`;
  }
  if (verb === "order") {
    if (!rest.length) throw new CliError("Name the categories in their new order.", 2);
    const ids = rest.map((r) => find(r).id);
    if (new Set(ids).size !== ids.length) throw new CliError("A category is named twice.", 2);
    raw.categories = [...ids.map((id) => raw.categories.find((c) => c?.id === id)), ...raw.categories.filter((c) => !ids.includes(c?.id))];
    save();
    return opts.json ? { project: project.key, categories: raw.categories.map((c) => c.id) } : raw.categories.map((c) => c.id).join(" ");
  }
  throw new CliError(`category ${verb}: unknown; use ls, add, edit, rm or order.`, 2);
}

const report = (warnings) => { for (const w of warnings) process.stderr.write(`herdr-bots: ${w}\n`); };

/**
 * Where Herdr shows a bot started here (DESIGN: the space whose folder keys to the project):
 * the `herdr.space` / `herdr.tab` labels of a live terminal on this computer whose folder
 * keys to the project. Null when none does; the pane then has no place in Herdr's window.
 */
async function placementOf(key) {
  const rows = rowsOf(await hcJson(["ls"])).filter((r) => local(r?.address) && r.state === "live" && typeof r.cwd === "string");
  const keys = new Map();
  await Promise.all([...new Set(rows.map((r) => r.cwd))].map(async (cwd) => {
    try { keys.set(cwd, await keyOf(cwd)); } catch { /* a folder gone: not this project */ }
  }));
  const mine = rows.filter((r) => keys.get(r.cwd) === key);
  for (const r of mine) {
    const place = placementFrom([await hcGet(r.address)].filter(Boolean));
    if (place) return place;
  }
  return null;
}

async function cmdStart(opts, [ref]) {
  if (opts.tab && !opts.space) throw new CliError("--tab needs --space (the space that tab is in).", 2);
  const project = await projectFor(opts);
  const { file, key } = project;
  if (project.text === null) throw new CliError(`No ${BOTS_PATH} in ${key}.`);
  const bot = findBot(file, ref);
  const why = startRefusal(file, bot.id);
  if (why) throw new CliError(why);
  // launch.js checks the folder Start launches in against the project (attachRefusal on
  // keyOf(projectKey)). Here that folder is `key`, which keyOf already returned, and a key
  // keys to itself, so the check can't refuse: it is left out, not forgotten.
  // One terminal plays a bot: a live one is reported, never a second start. So is a pane
  // started under a minute ago whose agent may not be in front yet (launch.js' grace).
  const mine = await panesOf(bot.id, { localOnly: true });
  const running = mine.live ?? youngPane(mine.gets, Date.now());
  if (running) return opts.json ? { id: bot.id, running: running.address } : `${bot.name} is already running in ${running.address}.`;
  // A12: a pin that isn't one of the agent's listed models (an old free-text model) is refused.
  if (bot.model && !knownModels(bot.agent, modelIo()).includes(bot.model)) {
    throw new CliError(`${bot.name} is pinned to "${bot.model}", which isn't a ${bot.agent} model this computer lists. `
      + `Pick one with herdr-bots edit ${bot.id} --model <model> (the error lists them), or clear it with --no-model.`);
  }
  const agent = agentTable()[bot.agent];
  if (!agent?.run?.length) throw new CliError(`${bot.name}'s coding agent "${bot.agent}" isn't one Herdr can start.`);
  if (!onPath(agent.run[0])) throw new CliError(`${agent.name} (${agent.run[0]}) isn't installed on this computer.`);
  // A1: the effective lead's live terminal as parent, outliving it; the main bot has none.
  const lead = bot.kind === "member" ? effectiveLead(file, bot.id).lead : "";
  const leadGet = lead ? (await panesOf(lead, { localOnly: true })).live : null;
  const leadLive = leadGet?.address ?? null;
  const parent = parentArgs(file, bot.id, (id) => (id === lead ? leadLive : null));
  const labels = paneLabels(file, bot.id, {}, leadGet?.labels ?? null); // A16
  const taken = new Set(rowsOf(await hcJson(["ls"])).map((r) => r?.name).filter(Boolean));
  const argv = [...agent.run, ...modelArgs(bot.agent, bot.model)];
  const place = opts.space ? { space: opts.space, tab: opts.tab ?? null, from: null } : await placementOf(key);
  const args = startArgs({ botId: bot.id, name: hcName(bot.name, bot.id, taken), cwd: key, space: place?.space, tab: place?.tab, parent, argv, labels });
  // The hook goes in before the session starts, so Claude Code reads it at startup.
  const hook = bot.agent === "claude" ? await writeBriefingHook(bot, key) : { written: false, warnings: [] };
  report(hook.warnings);
  const r = await hc(args);
  if (r.code !== 0) throw new CliError(`hc run failed: ${(r.stderr || r.stdout).trim()}`);
  let terminal = null;
  try { terminal = JSON.parse(r.stdout).address ?? null; } catch { terminal = null; }
  if (!terminal) throw new CliError(`hc run gave no terminal address: ${r.stdout.trim()}`);
  listProject(key);
  if (!place) {
    hook.warnings.push(`No open Herdr space shows ${key}, so Herdr gives ${terminal} no pane: it runs, unseen. `
      + `Watch it with hc attach ${terminal}. To give the next start a pane, open a space on ${key} first, or pass --space <id> (herdr-app ls lists the ids).`);
    report(hook.warnings.slice(-1));
  }
  return opts.json ? { id: bot.id, terminal, parent: parent[0] === "--parent" ? parent[1] : null, argv, labels, space: place?.space ?? null, tab: place?.tab ?? null,
    hookWritten: hook.written, warnings: hook.warnings } : terminal;
}

async function cmdAttach(opts, [ref, terminal]) {
  if (!terminal) throw new CliError("attach needs a bot and a terminal: herdr-bots attach <bot> <terminal>.", 2);
  if (terminal.startsWith("-")) throw new CliError(`"${terminal}" isn't a terminal; name one like t7.`, 2);
  if (!local(terminal)) throw new CliError(`Attach works on this computer's panes only; ${terminal} is on another machine.`);
  const project = await projectFor(opts);
  const { file, key } = project;
  const bot = findBot(file, ref);
  if (bot.planned) throw new CliError(`${bot.name} is planned (wave ${bot.planned.wave}); clear "planned" before attaching it.`);
  const get = await hcGet(terminal);
  if (!get || get.state !== "live") throw new CliError(`${terminal} isn't a live terminal.`);
  const address = get.address ?? terminal;
  const other = get.labels?.[BOT_LABEL];
  if (other && other !== bot.id) {
    const name = file.bots.find((b) => b.id === other)?.name;
    throw new CliError(`${address} already plays ${name ? `${name} (${other})` : `bot ${other}`}; nothing was attached. Attach that bot elsewhere, or detach it, first.`);
  }
  // Claude by its report, its foreground, or a wrapper whose argv runs claude (models.js).
  const claude = isClaude({ report: { app: get.status?.app } }, get) || agentKeyOfArgv(get.foreground?.argv) === "claude";
  let sessionFolder = get.foreground?.cwd ?? get.cwd ?? null;
  if (claude) {
    if (!get.foreground?.cwd) throw new CliError(`Can't read where ${address}'s Claude session runs (hc get ${address}); nothing was attached.`);
    sessionFolder = get.foreground.cwd;
    const sessionKey = await keyOf(sessionFolder);
    const refusal = attachRefusal({ botName: bot.name, projectKey: key, sessionFolder, sessionKey });
    if (refusal) throw new CliError(refusal);
  }
  const { holders, gets: holderGets } = await panesOf(bot.id, { localOnly: true });
  const moves = labelMoves(holders, address, bot.id, (t) => holderGets.find((g) => g?.address === t)?.labels);
  for (const [i, args] of moves.entries()) {
    const r = await hc(args);
    if (r.code === 0) continue;
    const why = (r.stderr || r.stdout).trim();
    const lost = i === moves.length - 1 && moves.length > 1;
    throw new CliError(lost ? `${bot.name} has no pane now (its label came off ${holders.filter((h) => h !== address).join(", ")}); attach again. hc said: ${why}`
      : `hc ${args.join(" ")} failed: ${why}`);
  }
  // A16: role, category and a squad copied from the lead, beside the bot label. The pane
  // plays the bot already, so a failure here only warns.
  const have = { ...(get.labels ?? {}), [BOT_LABEL]: bot.id };
  const words = labelWords(paneLabels(file, bot.id, have, await leadLabelsOf(file, bot.id).catch(() => null)), have);
  const labelWarnings = [];
  if (words.length) {
    const r = await hc(["label", address, ...words]);
    if (r.code !== 0) labelWarnings.push(`${address} plays ${bot.name}, but its labels ${words.join(" ")} weren't set: ${(r.stderr || r.stdout).trim()}`);
  }
  const hook = claude ? await writeBriefingHook(bot, sessionFolder) : { written: false, warnings: [] };
  hook.warnings.unshift(...labelWarnings);
  if (hook.written) hook.warnings.push(`${bot.name}'s briefing hook was added while its Claude session was running. If its next prompt brings no briefing, open /hooks once in that session to load it.`);
  report(hook.warnings);
  listProject(key);
  const movedFrom = holders.filter((h) => h !== address);
  return opts.json ? { id: bot.id, terminal: address, movedFrom, hookWritten: hook.written, warnings: hook.warnings }
    : `${bot.name} is now ${address}${movedFrom.length ? ` (label moved from ${movedFrom.join(", ")})` : ""}.`;
}

async function cmdDetach(opts, [ref]) {
  // A bare id needs no definition: a bot removed with rm can still have its label taken off.
  const bareId = /^b-[a-z2-7]{10}$/.test(ref ?? "");
  let bot = null;
  try { bot = findBot((await projectFor(opts)).file, ref); } catch (e) { if (!bareId || !(e instanceof CliError)) throw e; }
  const id = bot?.id ?? ref;
  const name = bot?.name ?? `bot ${id}`;
  const { holders, gets } = await panesOf(id, { localOnly: true });
  for (const t of holders) {
    // A16: role= and category= go with bot=; squad= only when this pack copied it there.
    const words = detachWords(gets.find((g) => g?.address === t)?.labels ?? {});
    const r = await hc(["label", t, ...words]);
    if (r.code !== 0) throw new CliError(`hc label ${t} ${words.join(" ")} failed: ${(r.stderr || r.stdout).trim()}`);
  }
  return opts.json ? { id, defined: Boolean(bot), detached: holders }
    : holders.length ? `${name} detached from ${holders.join(", ")}.` : `${name} has no pane on this computer.`;
}

async function cmdBrief(opts, [ref]) {
  const project = await projectFor(opts);
  const bot = findBot(project.file, ref);
  if (bot.planned) {
    if (opts.json) return { id: bot.id, briefing: null, reason: "planned bots get no briefing" };
    process.stderr.write(`herdr-bots: ${bot.name} is planned; planned bots get no briefing.\n`);
    return "";
  }
  // briefing.mjs' own gathering; a failed hc call reads as "no answer" (unreachable), as
  // it does in the hook, so the briefing still prints.
  const ask = async (args) => { try { return await hcJson(args); } catch (e) { if (e instanceof CliError) return UNANSWERED; throw e; } };
  const self = await paneOf(bot.id, ask);
  const text = await gatherBriefing({ file: project.file, bot, address: self.get?.address ?? null, ask });
  return opts.json ? { id: bot.id, briefing: text } : text;
}

const COMMANDS = { ls: cmdLs, show: cmdShow, create: cmdCreate, edit: cmdEdit, rm: cmdRm, category: cmdCategory,
  start: cmdStart, attach: cmdAttach, detach: cmdDetach, brief: cmdBrief };
const NEEDS_BOT = new Set(["show", "edit", "rm", "start", "attach", "detach", "brief"]);

/** Runs one command line; resolves with the exit code. Output goes to stdout, problems to stderr. */
export async function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (e) {
    process.stderr.write(`herdr-bots: ${e.message}\n\n${USAGE}\n`);
    return 2;
  }
  const { values: opts, positionals } = parsed;
  const [command, ...rest] = positionals;
  if (opts.help || !command || command === "help") { process.stdout.write(`${USAGE}\n`); return command || opts.help ? 0 : 2; }
  const run = COMMANDS[command];
  if (!run) { process.stderr.write(`herdr-bots: unknown command "${command}"\n\n${USAGE}\n`); return 2; }
  try {
    if (NEEDS_BOT.has(command) && !rest[0]) throw new CliError(`${command} needs a bot (its id or name).`, 2);
    const out = await run(opts, rest);
    if (opts.json) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    else if (out) process.stdout.write(`${out}\n`);
    return 0;
  } catch (e) {
    const message = e instanceof CliError ? e.message : `${e?.stack ?? e}`;
    process.stderr.write(`herdr-bots: ${message}\n`);
    return e instanceof CliError ? e.code : 1;
  }
}

// Run as a program (also through the ~/.local/bin symlink, hence the realpath), not on import.
const invoked = (() => { try { return pathToFileURL(realpathSync(process.argv[1])).href; } catch { return null; } })();
if (import.meta.url === invoked) process.exitCode = await main();
