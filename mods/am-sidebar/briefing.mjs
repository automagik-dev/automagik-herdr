// The per-turn briefing for a Claude bot (DESIGN Approach "Group 3", Decision 9, A1, A3).
// Claude Code runs it on UserPromptSubmit from the per-person hook Start and Attach write
// in the session's .claude/settings.local.json; whatever it prints reaches the agent as
// context. Plain node, outside Herdr: it imports no `herdr` or `gpui`, only the pack's pure
// modules. Fail-open: it prints nothing and exits 0 unless HC_TERMINAL_ID's terminal carries
// a `bot` label defined in the project $CLAUDE_PROJECT_DIR keys to; on an error it prints one
// stderr line and still exits 0.
// It also ties a Claude session to its terminal for usagemeter, bot or worker alike: when the
// hook's stdin names a session_id the terminal's agent.session label doesn't hold yet, it
// appends a session row to the workers ledger and sets the label (once per change). That part
// never fails the hook and never changes the briefing.
// Apache-2.0.

import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { closeSync, mkdirSync, openSync, realpathSync, writeSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BOT_LABEL, BOTS_PATH, effectiveLead, parseBots, projectKeyOf } from "./model.js";
import { UNANSWERED, paneOf, rowsOf } from "./launchArgs.js";
import { briefingText, directMembers, latestReport } from "./briefingText.mjs";
import { SESSION_LABEL, ledgerLine, ledgerPath, sessionChange, sessionRow } from "./workers.js";

// About two seconds in all (the hook's limit is five): no hc call waits more than 1.5 s,
// none starts after the 2 s budget, a call that runs out counts as unreachable, and a last
// guard ends the process silently at 2.4 s. One away machine can't hold the prompt.
// The clock starts when the script runs as the hook, not when another program imports it.
// HERDR_BRIEFING_TIME_SCALE (a whole number, 1 to 10) multiplies all three: the tests' slow
// fakes run on loaded machines. It only ever lengthens them; unset, the times are as above.
export const BUDGET_MS = 2000;
export const CALL_MS = 1500;
export const GUARD_MS = 2400;
export const timeScale = (raw) => (/^([1-9]|10)$/.test(String(raw ?? "").trim()) ? Number(String(raw).trim()) : 1);
let until = Infinity;
let callMs = CALL_MS;

const MAX_HELPERS = 30;
let hcMissing = false;

// A program's stdout; null when it failed or is missing; UNANSWERED when it ran out of time.
function run(command, args, cwd) {
  const timeout = Math.min(callMs, until - Date.now());
  if (timeout <= 0) return Promise.resolve(UNANSWERED);
  return new Promise((resolve) => {
    try {
      execFile(command, args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
        if (!err) return resolve(stdout);
        if (err.killed || err.signal === "SIGTERM") return resolve(UNANSWERED);
        if (err.code === "ENOENT" && command === "hc") hcMissing = true;
        resolve(null);
      });
    } catch { resolve(null); }
  });
}
async function hcJson(args) {
  const out = await run("hc", [...args, "--json"]);
  if (out === null || out === UNANSWERED) return out;
  try { return JSON.parse(out); } catch { return null; }
}

const git = async (args, cwd) => { const out = await run("git", args, cwd); return out === UNANSWERED ? null : out; };
const exists = async (path) => { try { await access(path); return true; } catch { return false; } };

/**
 * The briefing of `bot` in `file`, gathered through `ask` (launchArgs.js paneOf's contract:
 * parsed `hc … --json`, null on failure, UNANSWERED when out of time). `address` is the bot's
 * own live terminal, whose unlabelled children are its helpers (null: no helpers counted).
 * Shared with the CLI's `automagik-herdr brief`.
 */
export async function gatherBriefing({ file, bot, address, ask }) {
  const team = directMembers(file, bot.id);
  const leadId = bot.kind === "member" ? effectiveLead(file, bot.id).lead : "";
  const leadBot = leadId ? file.bots.find((b) => b.id === leadId) : null;

  // One `hc ls` for the helpers (its rows carry parent and status), one label query per
  // team bot; `hc get` only for the bot panes found and the children no query named.
  const [all, panes, leadPane] = await Promise.all([
    address ? ask(["ls"]) : null,
    Promise.all(team.map((m) => paneOf(m.id, ask))),
    leadBot ? paneOf(leadBot.id, ask) : null,
  ]);
  const known = new Set([...panes, leadPane].flatMap((p) => p?.addresses ?? []));
  const [members, helpers] = await Promise.all([
    Promise.all(team.map(async (m, i) => {
      const p = panes[i];
      if (p.unreachable) return { bot: m, unreachable: true };
      if (!p.get) return { bot: m };
      return { bot: m, terminal: p.get.address, status: p.get.status?.state, report: await latestReport(p.get, ask) };
    })),
    helpersOf(all, address, known, ask),
  ]);
  const lead = leadBot
    ? { bot: leadBot, terminal: leadPane?.get?.address ?? "", status: leadPane?.get?.status?.state, unreachable: Boolean(leadPane?.unreachable) }
    : undefined;
  return briefingText({ self: bot, file, members, lead, helpers });
}

// `me`: the pending `hc get` of HC_TERMINAL_ID, shared with joinSession.
async function main(mePending) {
  const self = process.env.HC_TERMINAL_ID;
  const dir = process.env.CLAUDE_PROJECT_DIR;
  if (!self || !dir) return null;
  const [me, key] = await Promise.all([mePending, projectKeyOf(dir, git, exists)]);
  if (hcMissing) throw new Error("hc is not on PATH");
  const botId = me && me !== UNANSWERED ? me.labels?.[BOT_LABEL] : null;
  if (!botId) return null;
  const { file } = parseBots(await readFile(`${key === "/" ? "" : key}/${BOTS_PATH}`, "utf8"));
  const bot = file.bots.find((b) => b.id === botId);
  if (!bot || bot.planned) return null;
  return gatherBriefing({ file, bot, address: me.address ?? self, ask: hcJson });
}

/**
 * Its children (`hc ls` rows whose parent is its terminal, status from the row), never one
 * that carries a bot label. A row the team's label queries above named is a bot; any other
 * child (a helper, or a bot of another team or project) is asked with `hc get` for its
 * labels, at most MAX_HELPERS of them, and one that gives no answer is left out.
 */
async function helpersOf(all, address, known, ask) {
  if (!address || !all || all === UNANSWERED) return [];
  const kids = rowsOf(all).filter((r) => r?.parent === address && r.address && r.state !== "finished" && !known.has(r.address)).slice(0, MAX_HELPERS);
  const gets = await Promise.all(kids.map((r) => ask(["get", r.address])));
  return kids.filter((_, i) => gets[i] && typeof gets[i] === "object" && !gets[i].labels?.[BOT_LABEL])
    .map((r) => ({ status: typeof r.status === "string" ? r.status : r.status?.state }));
}

// The hook's stdin (Claude Code's JSON, with session_id and transcript_path), or "" when
// none comes within `ms` (a caller that never closes stdin can't hold the hook). Claude Code
// closes it at once, so INPUT_MS is never scaled: it only bounds such a caller.
const INPUT_MS = 300;
function readInput(ms) {
  if (process.stdin.isTTY) return Promise.resolve("");
  return new Promise((resolve) => {
    let text = "";
    let timer = null;
    const done = () => { clearTimeout(timer); process.stdin.removeAllListeners("data"); process.stdin.destroy(); resolve(text); };
    timer = setTimeout(done, ms);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => { text += d; if (text.length > 1_000_000) done(); });
    process.stdin.on("end", done);
    process.stdin.on("error", done);
  });
}

/**
 * Ties the Claude session in the hook's `input` to terminal `me` (its `hc get`) once per
 * change: a session row appended to the ledger under `appHome`, then the agent.session label
 * set (a failed label means the row comes again next turn, never a lost one). Never rejects;
 * resolves with whether the session was new.
 */
export async function joinSession(self, me, input, appHome) {
  try {
    if (!me || me === UNANSWERED) return false;
    const change = sessionChange(me, input);
    if (!change) return false;
    const terminal = me.address ?? self;
    const path = ledgerPath(appHome);
    mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
    const fd = openSync(path, "a");
    try { writeSync(fd, ledgerLine(sessionRow({ terminal, ...change }))); } finally { closeSync(fd); }
    await run("hc", ["label", terminal, `${SESSION_LABEL}=${change.session}`]);
    return true;
  } catch { return false; }
}

// The app home this script is installed in (<app home>/mods/am-sidebar/briefing.mjs).
const appHomeOf = () => process.env.HERDR_APP_HOME || fileURLToPath(new URL("../..", import.meta.url)).replace(/\/+$/, "");

// Run as the hook (node briefing.mjs), not when the CLI imports gatherBriefing.
const invoked = (() => { try { return pathToFileURL(realpathSync(process.argv[1])).href; } catch { return null; } })();
if (import.meta.url === invoked) {
  const scale = timeScale(process.env.HERDR_BRIEFING_TIME_SCALE);
  until = Date.now() + BUDGET_MS * scale;
  callMs = CALL_MS * scale;
  const guard = setTimeout(() => process.exit(0), GUARD_MS * scale);
  guard.unref();
  const self = process.env.HC_TERMINAL_ID;
  const me = self ? hcJson(["get", self]) : Promise.resolve(null);
  const joined = self ? Promise.all([me, readInput(INPUT_MS)]).then(([get, input]) => joinSession(self, get, input, appHomeOf()), () => false)
    : Promise.resolve(false);
  try {
    const text = await main(me);
    // Past this point the block is on its way: the guard must not cut the write short.
    clearTimeout(guard);
    if (text) process.stdout.write(`${text}\n`);
  } catch (e) {
    // Fail open: no briefing this turn and exit 0, with one line on stderr as a trace.
    clearTimeout(guard);
    process.stderr.write(`automagik-herdr briefing: ${String(e?.message ?? e).split("\n")[0]}\n`);
  }
  await joined;
  process.exitCode = 0;
}
