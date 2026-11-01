// Start and Attach on this computer (DESIGN Approach, Decisions 1-3 and 5, A1): a bot's live
// pane is the terminal carrying `bot=<id>` with an agent in front. The argument building
// and messages live in launchArgs.js. Apache-2.0.

import { hc, terminals, spaces, focused, run, knownAgents, readTextFile } from "herdr";
import { BOT_LABEL, BOTS_PATH, parseBots, effectiveLead } from "./model.js";
import { keyOf, rememberProject } from "./bots.js";
import { hcName, parentArgs, startRefusal, startArgs, agentInForeground, rowIsAgent, isClaude, newest, labelMoves, attachRefusal } from "./launchArgs.js";

const local = (address) => typeof address === "string" && !address.includes("/");

async function hcGet(address) {
  try {
    const r = await hc(["get", address, "--json"]);
    return r.code === 0 ? JSON.parse(r.stdout) : null;
  } catch { return null; }
}

async function readProject(projectKey) {
  const text = await readTextFile(`${projectKey}/${BOTS_PATH}`);
  if (text === null) return null;
  return parseBots(text).file;
}

/**
 * A bot's live pane (Decision 3): a terminal of this computer carrying its label with an
 * agent in front, by `terminals()`' `program.agent`, else `hc get`'s foreground. When several
 * do, the newest by created_ms (read with `hc get` for those only), flagged `duplicate`.
 * Only this computer's terminals count: Start and Attach work here only, and Attach could
 * not take a label off another machine's terminal.
 */
export async function liveTerminalOf(botId) {
  const rows = terminals().filter((t) => t?.labels?.[BOT_LABEL] === botId && t.state === "live" && local(t.address));
  const live = [];
  for (const row of rows) {
    const says = rowIsAgent(row);
    if (says === true) live.push(row.address);
    else if (says === null && agentInForeground(await hcGet(row.address))) live.push(row.address);
  }
  if (live.length === 0) return null;
  if (live.length === 1) return { terminal: live[0], duplicate: false };
  const gets = (await Promise.all(live.map(hcGet))).filter(Boolean);
  const pick = newest(gets);
  return { terminal: pick?.address ?? live[0], duplicate: true };
}

/** Called after a pane is tied to a bot, with the folder its session runs in. Group 4 fills it. */
export async function afterBind(_bot, _sessionFolder) {}

// Where a started bot opens: the first space of this computer whose folder keys to the
// project, else the shown space; in that space's active tab.
async function placeFor(projectKey) {
  const mine = spaces().filter((s) => !s.machine);
  let space = null;
  for (const s of mine) {
    try { if (s.folder && (await keyOf(s.folder)) === projectKey) { space = s; break; } } catch {}
  }
  space ??= mine.find((s) => s.id === focused()?.space) ?? mine.find((s) => s.active) ?? null;
  const tab = space?.tabs?.find((t) => t.active) ?? null;
  return { space: space?.id ?? null, tab: tab?.id ?? null };
}

// Bots being started now, and the terminal each got lately: its agent may not be in front
// yet, so a second Start right after would pass the live check and open a twin.
const starting = new Set();
const started = new Map(); // bot id -> { terminal, at }
const STARTED_GRACE = 60_000;

/**
 * Starts a bot as a new pane on this computer, or focuses its live pane. Refuses a planned
 * bot, one with no agent, a project folder that doesn't key to itself, and a bot already
 * being started.
 */
export async function startBot(projectKey, botId) {
  if (starting.has(botId)) return { refused: `${botId} is already starting.` };
  starting.add(botId);
  try { return await startOnce(projectKey, botId); } finally { starting.delete(botId); }
}

async function startOnce(projectKey, botId) {
  let file;
  try { file = await readProject(projectKey); } catch (e) { return { refused: `Can't read ${projectKey}/${BOTS_PATH}: ${e?.message ?? e}` }; }
  if (!file) return { refused: `No ${BOTS_PATH} in ${projectKey}.` };
  const why = startRefusal(file, botId);
  if (why) return { refused: why };
  const bot = file.bots.find((b) => b.id === botId);
  const recent = started.get(botId);
  const fresh = recent && Date.now() - recent.at < STARTED_GRACE
    && terminals().some((t) => t?.address === recent.terminal && t.state === "live" && t.labels?.[BOT_LABEL] === botId);
  const live = (await liveTerminalOf(botId))?.terminal ?? (fresh ? recent.terminal : null);
  if (live) {
    run("agent.focus", { terminal: live });
    return { focused: live };
  }
  // The same check as Attach, on the folder Start launches in.
  let key;
  try { key = await keyOf(projectKey); } catch (e) { return { refused: `Can't read the project of ${projectKey}: ${e?.message ?? e}` }; }
  const refusal = attachRefusal({ botName: bot.name, projectKey, sessionFolder: projectKey, sessionKey: key });
  if (refusal) return { refused: refusal };
  let agents = [];
  try { agents = await knownAgents(); } catch {}
  const agent = agents.find((a) => a.key === bot.agent);
  if (!agent?.run?.length) return { refused: `${bot.name}'s coding agent "${bot.agent}" isn't one Herdr can start here.` };
  if (agent.installed === false) return { refused: `${agent.name ?? bot.agent} isn't installed on this computer.` };
  // The effective lead's live terminal (A1), looked up first: parentArgs is synchronous.
  const lead = bot.kind === "member" ? effectiveLead(file, botId).lead : "";
  const leadLive = lead ? (await liveTerminalOf(lead))?.terminal ?? null : null;
  const parent = parentArgs(file, botId, (id) => (id === lead ? leadLive : null));
  const taken = new Set(terminals().map((t) => t?.name).filter(Boolean));
  const { space, tab } = await placeFor(projectKey);
  const args = startArgs({ botId, name: hcName(bot.name, botId, taken), cwd: projectKey, space, tab, parent, argv: agent.run });
  let r;
  try { r = await hc(args); } catch (e) { return { refused: `hc run failed: ${e?.message ?? e}` }; }
  if (r.code !== 0) return { refused: `hc run failed: ${(r.stderr || r.stdout).trim()}` };
  let terminal = null;
  try { terminal = JSON.parse(r.stdout).address ?? null; } catch {}
  if (!terminal) return { refused: `hc run gave no terminal address: ${r.stdout.trim()}` };
  started.set(botId, { terminal, at: Date.now() });
  rememberProject(projectKey);
  await afterBind(bot, projectKey);
  return { terminal };
}

/**
 * Ties a running pane on this computer to a bot: for a Claude pane, first the folder check
 * (refused, nothing written, both folders named); then the label off any other terminal
 * holding it, and onto this one. The pane keeps the hc parent it was launched with.
 */
export async function attachBot(projectKey, botId, terminal) {
  if (!local(terminal)) return { refused: `Attach works on this computer's panes only; ${terminal} is on another machine.` };
  let file;
  try { file = await readProject(projectKey); } catch (e) { return { refused: `Can't read ${projectKey}/${BOTS_PATH}: ${e?.message ?? e}` }; }
  const bot = file?.bots.find((b) => b.id === botId);
  if (!bot) return { refused: `No bot ${botId} in ${projectKey}.` };
  if (bot.planned) return { refused: `${bot.name} is planned (wave ${bot.planned.wave}); clear "planned" before attaching it.` };
  const row = terminals().find((t) => t?.address === terminal);
  if (!row || row.state !== "live") return { refused: `${terminal} isn't a live terminal.` };
  const other = row.labels?.[BOT_LABEL];
  if (other && other !== botId) {
    const name = file.bots.find((b) => b.id === other)?.name;
    return { refused: `${terminal} already plays ${name ? `${name} (${other})` : `bot ${other}`}; nothing was attached. Attach that bot elsewhere, or remove its label, first.` };
  }
  const get = await hcGet(terminal);
  let sessionFolder = get?.foreground?.cwd ?? row.cwd ?? null;
  if (isClaude(row, get)) {
    if (!get?.foreground?.cwd) return { refused: `Can't read where ${terminal}'s Claude session runs (hc get ${terminal}); nothing was attached.` };
    sessionFolder = get.foreground.cwd;
    let sessionKey;
    try { sessionKey = await keyOf(sessionFolder); } catch (e) { return { refused: `Can't read the project of ${sessionFolder}: ${e?.message ?? e}` }; }
    const refusal = attachRefusal({ botName: bot.name, projectKey, sessionFolder, sessionKey });
    if (refusal) return { refused: refusal };
  }
  const holders = terminals().filter((t) => t?.labels?.[BOT_LABEL] === botId && local(t.address)).map((t) => t.address);
  const moves = labelMoves(holders, terminal, botId);
  for (const [i, args] of moves.entries()) {
    let why = null;
    try {
      const r = await hc(args);
      if (r.code !== 0) why = (r.stderr || r.stdout).trim();
    } catch (e) { why = String(e?.message ?? e); }
    if (why === null) continue;
    // The label already came off its old pane: say so, rather than a bare hc error.
    const lost = i === moves.length - 1 && moves.length > 1;
    return { refused: lost ? `${bot.name} has no pane now (its label came off ${holders.filter((h) => h !== terminal).join(", ")}); attach again. hc said: ${why}`
      : `hc ${args.join(" ")} failed: ${why}` };
  }
  rememberProject(projectKey);
  await afterBind(bot, sessionFolder);
  return { ok: true };
}
