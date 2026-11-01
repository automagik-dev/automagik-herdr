// The per-turn briefing for a Claude bot (DESIGN Approach "Group 3", Decision 9, A1, A3).
// Claude Code runs it on UserPromptSubmit from the per-person hook Start and Attach write
// in the session's .claude/settings.local.json; whatever it prints reaches the agent as
// context. Plain node, outside Herdr: it imports no `herdr` or `gpui`, only the pack's pure
// modules. Fail-open: it prints nothing and exits 0 unless HC_TERMINAL_ID's terminal carries
// a `bot` label defined in the project $CLAUDE_PROJECT_DIR keys to; on an error it prints one
// stderr line and still exits 0.
// Apache-2.0.

import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { BOT_LABEL, BOTS_PATH, effectiveLead, parseBots, projectKeyOf } from "./model.js";
import { agentInForeground, newest } from "./launchArgs.js";
import { briefingText, directMembers } from "./briefingText.mjs";

// About two seconds in all (the hook's limit is five): no hc call waits more than 1.5 s,
// none starts after the 2 s budget, a call that runs out counts as unreachable, and a last
// guard ends the process silently at 2.4 s. One away machine can't hold the prompt.
const BUDGET_MS = 2000;
const CALL_MS = 1500;
const until = Date.now() + BUDGET_MS;
const guard = setTimeout(() => process.exit(0), 2400);
guard.unref();

const TAIL_LINES = 12;
const MAX_HELPERS = 30;
const TIMED_OUT = Symbol("timed out");
let hcMissing = false;

// A program's stdout; null when it failed or is missing; TIMED_OUT when it ran out of time.
function run(command, args, cwd) {
  const timeout = Math.min(CALL_MS, until - Date.now());
  if (timeout <= 0) return Promise.resolve(TIMED_OUT);
  return new Promise((resolve) => {
    try {
      execFile(command, args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
        if (!err) return resolve(stdout);
        if (err.killed || err.signal === "SIGTERM") return resolve(TIMED_OUT);
        if (err.code === "ENOENT" && command === "hc") hcMissing = true;
        resolve(null);
      });
    } catch { resolve(null); }
  });
}
async function hcJson(args) {
  const out = await run("hc", [...args, "--json"]);
  if (out === null || out === TIMED_OUT) return out;
  try { return JSON.parse(out); } catch { return null; }
}
const rowsOf = (ls) => (Array.isArray(ls?.terminals) ? ls.terminals : Array.isArray(ls) ? ls : []);

/**
 * A bot's pane anywhere hc can see: the live terminals carrying `bot=<id>` with an agent
 * in front (Decision 3), the newest by created_ms when several do. Resolves with
 * { get, addresses } (`get` null when none runs; `addresses` every terminal carrying the
 * label), or { unreachable: true } when hc gave no answer in time.
 */
async function paneOf(botId) {
  const ls = await hcJson(["ls", "--label", `${BOT_LABEL}=${botId}`]);
  if (ls === TIMED_OUT) return { unreachable: true, addresses: [] };
  const rows = rowsOf(ls).filter((r) => r?.address && r.state !== "finished");
  const addresses = rows.map((r) => r.address);
  if (!rows.length) return { get: null, addresses };
  const answers = await Promise.all(rows.map((r) => hcJson(["get", r.address])));
  // A pane that didn't answer may be the newest: no address beats a stale one.
  if (answers.includes(TIMED_OUT)) return { unreachable: true, addresses };
  const gets = answers.filter((g) => g && agentInForeground(g));
  return { get: gets.length ? newest(gets) : null, addresses };
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

const git = async (args, cwd) => { const out = await run("git", args, cwd); return out === TIMED_OUT ? null : out; };
const exists = async (path) => { try { await access(path); return true; } catch { return false; } };

async function main() {
  const self = process.env.HC_TERMINAL_ID;
  const dir = process.env.CLAUDE_PROJECT_DIR;
  if (!self || !dir) return null;
  const [me, key] = await Promise.all([hcJson(["get", self]), projectKeyOf(dir, git, exists)]);
  if (hcMissing) throw new Error("hc is not on PATH");
  const botId = me && me !== TIMED_OUT ? me.labels?.[BOT_LABEL] : null;
  if (!botId) return null;
  const { file } = parseBots(await readFile(`${key === "/" ? "" : key}/${BOTS_PATH}`, "utf8"));
  const bot = file.bots.find((b) => b.id === botId);
  if (!bot || bot.planned) return null;
  const address = me.address ?? self;

  const team = directMembers(file, bot.id);
  const leadId = bot.kind === "member" ? effectiveLead(file, bot.id).lead : "";
  const leadBot = leadId ? file.bots.find((b) => b.id === leadId) : null;

  // One `hc ls` for the helpers (its rows carry parent and status), one label query per
  // team bot; `hc get` only for the bot panes found and the children no query named.
  const [all, panes, leadPane] = await Promise.all([
    hcJson(["ls"]),
    Promise.all(team.map((m) => paneOf(m.id))),
    leadBot ? paneOf(leadBot.id) : null,
  ]);
  const known = new Set([...panes, leadPane].flatMap((p) => p?.addresses ?? []));
  const [members, helpers] = await Promise.all([
    Promise.all(team.map(async (m, i) => {
      const p = panes[i];
      if (p.unreachable) return { bot: m, unreachable: true };
      if (!p.get) return { bot: m };
      return { bot: m, terminal: p.get.address, status: p.get.status?.state, report: await reportOf(p.get) };
    })),
    helpersOf(all, address, known),
  ]);
  const lead = leadBot
    ? { bot: leadBot, terminal: leadPane?.get?.address ?? "", status: leadPane?.get?.status?.state, unreachable: Boolean(leadPane?.unreachable) }
    : undefined;
  return briefingText({ self: bot, file, members, lead, helpers });
}

/**
 * Its children (`hc ls` rows whose parent is its terminal, status from the row), never one
 * that carries a bot label. A row the team's label queries above named is a bot; any other
 * child (a helper, or a bot of another team or project) is asked with `hc get` for its
 * labels, at most MAX_HELPERS of them, and one that gives no answer is left out.
 */
async function helpersOf(all, address, known) {
  if (!all || all === TIMED_OUT) return [];
  const kids = rowsOf(all).filter((r) => r?.parent === address && r.address && r.state !== "finished" && !known.has(r.address)).slice(0, MAX_HELPERS);
  const gets = await Promise.all(kids.map((r) => hcJson(["get", r.address])));
  return kids.filter((_, i) => gets[i] && gets[i] !== TIMED_OUT && !gets[i].labels?.[BOT_LABEL])
    .map((r) => ({ status: typeof r.status === "string" ? r.status : r.status?.state }));
}

try {
  const text = await main();
  // Past this point the block is on its way: the guard must not cut the write short.
  clearTimeout(guard);
  if (text) process.stdout.write(`${text}\n`);
} catch (e) {
  // Fail open: no briefing this turn and exit 0, with one line on stderr as a trace.
  clearTimeout(guard);
  process.stderr.write(`herdr-bots briefing: ${String(e?.message ?? e).split("\n")[0]}\n`);
}
process.exitCode = 0;
