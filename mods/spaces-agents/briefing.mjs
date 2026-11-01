// The per-turn briefing for a Claude bot (DESIGN Approach "Group 3", Decision 9, A1, A3).
// Claude Code runs it on UserPromptSubmit from the per-person hook Start and Attach write
// in the session's .claude/settings.local.json; whatever it prints reaches the agent as
// context. Plain node, outside Herdr: it imports no `herdr` or `gpui`, only the pack's pure
// modules. Fail-open: it prints nothing and exits 0 unless HC_TERMINAL_ID's terminal carries
// a `bot` label defined in the project $CLAUDE_PROJECT_DIR keys to, and on any error.
// Apache-2.0.

import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { BOT_LABEL, BOTS_PATH, effectiveLead, parseBots, projectKeyOf } from "./model.js";
import { agentInForeground, newest } from "./launchArgs.js";
import { briefingText, directMembers } from "./briefingText.mjs";

// Five seconds in all: calls get what is left of 4.5 s, a call that runs out counts as
// unanswered, and a last guard ends the process silently just before 5 s.
const BUDGET_MS = 4500;
const until = Date.now() + BUDGET_MS;
const guard = setTimeout(() => process.exit(0), 4900);
guard.unref();

const TAIL_LINES = 12;
const MAX_HELPERS = 30;

// A program's stdout, or null when it failed, is missing or ran out of time.
function run(command, args, cwd) {
  const timeout = Math.max(100, until - Date.now());
  return new Promise((resolve) => {
    try {
      execFile(command, args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => resolve(err ? null : stdout));
    } catch { resolve(null); }
  });
}
async function hcJson(args) {
  const out = await run("hc", [...args, "--json"]);
  if (out === null) return null;
  try { return JSON.parse(out); } catch { return null; }
}
const rowsOf = (ls) => (Array.isArray(ls?.terminals) ? ls.terminals : Array.isArray(ls) ? ls : []);

/**
 * A bot's pane anywhere hc can see: the live terminals carrying `bot=<id>` with an agent
 * in front (Decision 3), the newest by created_ms when several do. Its `hc get`, or null.
 */
async function paneOf(botId) {
  const rows = rowsOf(await hcJson(["ls", "--label", `${BOT_LABEL}=${botId}`])).filter((r) => r?.address && r.state !== "finished");
  if (!rows.length) return null;
  const gets = (await Promise.all(rows.map((r) => hcJson(["get", r.address])))).filter((g) => g && agentInForeground(g));
  return gets.length ? newest(gets) : null;
}

// The latest report (Decision 10): the published status text, else a short screen tail.
async function reportOf(get) {
  const msg = get?.status?.msg;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  const read = await hcJson(["read", get.address]);
  const text = typeof read?.text === "string" ? read.text : "";
  // eslint-disable-next-line no-control-regex
  const lines = text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
  return lines.slice(-TAIL_LINES).join("\n");
}

const git = async (args, cwd) => run("git", args, cwd);
const exists = async (path) => { try { await access(path); return true; } catch { return false; } };

async function main() {
  const self = process.env.HC_TERMINAL_ID;
  const dir = process.env.CLAUDE_PROJECT_DIR;
  if (!self || !dir) return null;
  const [me, key] = await Promise.all([hcJson(["get", self]), projectKeyOf(dir, git, exists)]);
  const botId = me?.labels?.[BOT_LABEL];
  if (!botId) return null;
  const { file } = parseBots(await readFile(`${key === "/" ? "" : key}/${BOTS_PATH}`, "utf8"));
  const bot = file.bots.find((b) => b.id === botId);
  if (!bot || bot.planned) return null;
  const address = me.address ?? self;

  const team = directMembers(file, bot.id);
  const leadId = bot.kind === "member" ? effectiveLead(file, bot.id).lead : "";
  const leadBot = leadId ? file.bots.find((b) => b.id === leadId) : null;

  const [panes, leadPane, helpers] = await Promise.all([
    Promise.all(team.map((m) => paneOf(m.id))),
    leadBot ? paneOf(leadBot.id) : null,
    helpersOf(address),
  ]);
  const members = await Promise.all(team.map(async (m, i) => {
    const get = panes[i];
    if (!get) return { bot: m };
    return { bot: m, terminal: get.address, status: get.status?.state, report: await reportOf(get) };
  }));
  const lead = leadBot ? { bot: leadBot, terminal: leadPane?.address ?? "", status: leadPane?.status?.state } : undefined;
  return briefingText({ self: bot, file, members, lead, helpers });
}

// Its children (hc ls rows whose parent is its terminal), never one that carries a bot label.
async function helpersOf(address) {
  const kids = rowsOf(await hcJson(["ls"])).filter((r) => r?.parent === address && r.address).slice(0, MAX_HELPERS);
  const gets = await Promise.all(kids.map((r) => hcJson(["get", r.address])));
  return gets.filter((g) => g && !g.labels?.[BOT_LABEL]).map((g) => ({ status: g.status?.state }));
}

try {
  const text = await main();
  // Past this point the block is on its way: the guard must not cut the write short.
  clearTimeout(guard);
  if (text) process.stdout.write(`${text}\n`);
} catch {
  // Fail open: no briefing this turn, never an error in the session.
}
process.exitCode = 0;
