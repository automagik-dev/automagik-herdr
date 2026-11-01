// Start and Attach over plain data: the `hc run` arguments, the A1 parent rule, the live
// rule (DESIGN Decision 3), which terminal counts among duplicates, the label moves of an
// attach and its refusal message. Pure: no `herdr`, so `node --test` runs it. Apache-2.0.

import { BOT_LABEL, effectiveLead, mainBotOf } from "./model.js";

const SHELLS = new Set(["sh", "zsh", "bash", "fish", "dash", "ksh", "tcsh", "csh", "nu", "login"]);
const base = (p) => String(p ?? "").split("/").pop().replace(/^-/, "");

/** An hc terminal name for a bot: 1-32 of a-z 0-9 - _, unique among `taken`. */
export function hcName(name, botId, taken = new Set()) {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "bot";
  if (!taken.has(slug)) return slug;
  const tail = `-${String(botId).slice(-4)}`;
  const named = `${slug.slice(0, 32 - tail.length)}${tail}`;
  return taken.has(named) ? null : named; // null: let hc pick, rather than fail on a taken name
}

/**
 * The hc parent of a started bot (DESIGN Decision 5, A1): the main bot has none; a member
 * reports to its effective lead's live terminal and outlives it, else has none.
 * `liveOf(botId)` is that bot's live terminal address, or null.
 */
export function parentArgs(file, botId, liveOf) {
  const bot = file.bots.find((b) => b.id === botId);
  if (!bot || bot.kind === "main") return ["--no-parent"];
  const { lead } = effectiveLead(file, botId);
  const live = lead ? liveOf(lead) : null;
  return live ? ["--parent", live, "--outlive-parent"] : ["--no-parent"];
}

/** Why a bot can't be started, or null. */
export function startRefusal(file, botId) {
  const bot = file.bots.find((b) => b.id === botId);
  if (!bot) return `No bot ${botId} in this project.`;
  if (bot.planned) return `${bot.name} is planned (wave ${bot.planned.wave}); edit it and clear "planned" to start it.`;
  if (!bot.agent) return `${bot.name} has no coding agent; edit it and pick one.`;
  if (bot.kind === "member" && !mainBotOf(file)) return `${bot.name}'s project has no main bot yet; create one first.`;
  return null;
}

/**
 * `hc run` arguments for Start: in the background, labelled with the bot and Herdr's
 * adoption labels, named, in the project folder, with the parent rule, never --no-notify.
 */
export function startArgs({ botId, name, cwd, space, tab, parent, argv }) {
  const args = ["run", "--bg", "--json"];
  if (name) args.push("--name", name);
  args.push("--cwd", cwd, "--label", `${BOT_LABEL}=${botId}`);
  if (space) args.push("--label", `herdr.space=${space}`);
  if (tab) args.push("--label", `herdr.tab=${tab}`);
  return [...args, ...parent, "--", ...argv];
}

/** True when `hc get`'s foreground is a program other than a shell (an agent, by Decision 3). */
export function agentInForeground(get) {
  const argv0 = get?.foreground?.argv?.[0];
  return Boolean(argv0) && !SHELLS.has(base(argv0));
}

/**
 * Whether a `terminals()` row is a live agent: `program.agent` when the row says, else
 * `hc get` (fetched by the caller only then). Rows from another machine never count.
 */
export function rowIsAgent(row) {
  return typeof row?.program?.agent === "boolean" ? row.program.agent : null;
}

/** A Claude Code pane: by Herdr's program table, its own report, or its foreground. */
export function isClaude(row, get) {
  return row?.program?.key === "claude" || row?.report?.app === "claude-code" || get?.status?.app === "claude-code"
    || base(get?.foreground?.argv?.[0]) === "claude";
}

/** Of several `hc get` answers for one bot's label, the newest by created_ms counts. */
export function newest(gets) {
  return gets.reduce((a, b) => ((b?.created_ms ?? -1) > (a?.created_ms ?? -1) ? b : a), null);
}

/** The `hc label` calls of an attach: the label off every other holder, then on the target. */
export function labelMoves(holders, target, botId) {
  const off = [...new Set(holders)].filter((t) => t !== target).map((t) => ["label", t, `${BOT_LABEL}=`]);
  return [...off, ["label", target, `${BOT_LABEL}=${botId}`]];
}

/**
 * The attach check for a Claude pane (DESIGN Approach): the folder its session runs in must
 * key to the bot's project. Returns the refusal, naming both folders and the fix, or null.
 */
export function attachRefusal({ botName, projectKey, sessionFolder, sessionKey }) {
  if (sessionKey === projectKey) return null;
  return `Not attached: this Claude session runs in ${sessionFolder}, which belongs to ${sessionKey}, `
    + `not to ${botName}'s project ${projectKey}. Claude reads its settings only from the folder its `
    + `session started in, so ${botName} would get no role or briefing there. Create the bot in `
    + `${sessionKey} instead, or Start ${botName} fresh in its own project.`;
}

/**
 * A mod command as nextCommand() gives it: its name, then optional arguments as JSON or
 * key=value words ("edit b-x", "edit {\"bot\":\"b-x\"}", "attach bot=b-x terminal=t7").
 */
export function parseCommand(text) {
  const s = String(text ?? "").trim();
  const space = s.search(/\s/);
  if (space < 0) return { name: s, args: {} };
  const name = s.slice(0, space), rest = s.slice(space + 1).trim();
  if (rest.startsWith("{")) { try { return { name, args: JSON.parse(rest) }; } catch { return { name, args: {} }; } }
  const args = {};
  for (const w of rest.split(/\s+/)) {
    const eq = w.indexOf("=");
    if (eq > 0) args[w.slice(0, eq)] = w.slice(eq + 1);
    else if (w.startsWith("b-")) args.bot = w;
    else args.terminal = w;
  }
  return { name, args };
}
