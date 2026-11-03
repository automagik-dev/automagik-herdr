// Restart over plain data: what a bot's replacement pane runs (resume the conversation, a
// fresh one, or a swap to another agent or model), why a restart is refused, and the labels
// the replacement carries over from the old pane. The CLI's `restart` runs it with hc; the
// sidebar's Restart runs the CLI. Pure: no `herdr`, so `node --test` runs it. Apache-2.0.

import { canResume, modelArgs, resumeArgs } from "./models.js";
import { SQUAD_LABEL, SQUAD_MARK } from "./launchArgs.js";

/** The pane label the briefing hook sets to the Claude session a terminal runs (workers.js SESSION_LABEL). */
const SESSION = "agent.session";

/**
 * What the replacement runs. `bot`: { agent, model } as stored; `run`: the target agent's
 * `run` (Herdr's table, programs.json applied); `runningAgent`: the agent key the old pane's
 * foreground runs (agentKeyOfArgv), null when unknown or when nothing runs; `session`: the old
 * pane's agent.session label; `fresh`, `agent`, `model`: the options (undefined: not given).
 * An --agent or --model is a swap, always fresh: a conversation doesn't cross agents. Returns
 * { mode: "resume" | "fresh" | "swap", agent, model, resume (the resume words, [] for a new
 * conversation), argv, note } (`note`: why a resume wasn't possible, else null).
 */
export function restartPlan({ bot, run, runningAgent = null, session = null, fresh = false, agent, model }) {
  const swap = agent !== undefined || model !== undefined;
  const key = agent ?? bot.agent;
  // A new agent without --model starts on its own default: the old pin belongs to the old agent.
  const pin = model !== undefined ? (model || null) : key === bot.agent ? (bot.model ?? null) : null;
  const plan = (mode, extra = [], note = null) => ({ mode, agent: key, model: pin, resume: extra, argv: [...run, ...extra, ...modelArgs(key, pin)], note });
  if (swap) return plan("swap");
  if (fresh) return plan("fresh");
  if (runningAgent && runningAgent !== key) return plan("fresh", [], `its pane runs ${runningAgent}, not ${key}, and a conversation doesn't cross agents`);
  if (!canResume(key)) return plan("fresh", [], `${key} has no resume this pack knows`);
  const id = key === "claude" && typeof session === "string" && session.trim() ? session.trim() : null;
  return plan("resume", resumeArgs(key, id));
}

/** The old pane's Claude session id (its agent.session label), or null. */
export const sessionOf = (get) => {
  const s = get?.labels?.[SESSION];
  return typeof s === "string" && s.trim() ? s.trim() : null;
};

/**
 * Why a restart of `old` (hc get of the bot's live pane) is refused, or null. `name`: the
 * bot's name; `helpers`: hc get answers of the live terminals whose parent is the old pane.
 * A pane mid-turn would have the turn cut in half; a helper hc ends with its parent
 * (die_with_parent, as a worker is) would end with it. --force (`force`) overrides both.
 */
export function restartRefusal({ name, old, helpers = [], force = false }) {
  if (force) return null;
  if (old?.status?.state === "working") {
    return `${name} is working in ${old.address}; restarting now would cut its turn in half. Wait until it is idle, or pass --force.`;
  }
  const doomed = helpers.filter((h) => h?.state === "live" && h.die_with_parent !== false).map((h) => h.address);
  if (doomed.length) {
    const one = doomed.length === 1;
    return `${old.address} has ${one ? "a helper that ends" : "helpers that end"} with it: ${doomed.join(", ")}. `
      + `Let ${one ? "it" : "them"} finish, or pass --force to end ${one ? "it" : "them"} with the pane.`;
  }
  return null;
}

/**
 * The labels the replacement carries beyond paneLabels: a squad on the old pane (anyone's,
 * not only one this pack copied) and its mark, so the restart moves the pane, not its squad.
 */
export function carriedLabels(old) {
  const have = old?.labels ?? {};
  const out = {};
  if (have[SQUAD_LABEL]) out[SQUAD_LABEL] = have[SQUAD_LABEL];
  if (have[SQUAD_MARK]) out[SQUAD_MARK] = have[SQUAD_MARK];
  return out;
}

/** One line for the owner: what the replacement does with the conversation. */
export function planText(plan, session) {
  if (plan.mode === "swap") return `on ${plan.agent}${plan.model ? ` (${plan.model})` : ""}, a new conversation`;
  if (plan.mode === "fresh") return plan.note ? `a new conversation (${plan.note})` : "a new conversation";
  if (plan.agent === "claude") return session ? `resuming session ${session}` : "resuming the latest conversation in its folder (--continue)";
  return `resuming its last conversation (${plan.resume.join(" ")})`;
}

// ---- the sidebar's Restart: the CLI, run by herdr-core ----

/**
 * The `hc` arguments the sidebar's Restart runs: `hc exec` of this pack's CLI (bin/run.sh
 * finds node) in herdr-core's environment, whose PATH is the one `hc run` starts agents with,
 * so the CLI finds hc and the agent as Start does. `agent`: Restart on… (a swap); `force`:
 * past a working pane or its helpers.
 */
export function restartCall({ appHome, botId, projectKey, agent = null, force = false }) {
  const bin = `${appHome}/mods/am-sidebar/bin`;
  return ["exec", "--env", `HERDR_APP_HOME=${appHome}`, "--cwd", projectKey, "--timeout", "120", "--",
    "sh", `${bin}/run.sh`, `${bin}/automagik-herdr.mjs`, "restart", botId, "--project", projectKey, "--json",
    ...(agent ? ["--agent", agent] : []), ...(force ? ["--force"] : [])];
}

/**
 * What the CLI's answer to restartCall means: { terminal, replaced, warnings } on success,
 * else { refused, forceable } (`forceable`: the refusal is one --force overrides).
 */
export function restartAnswer(r) {
  if (r?.code === 0) {
    try {
      const j = JSON.parse(r.stdout);
      if (j?.terminal) return { terminal: j.terminal, replaced: j.replaced ?? null, warnings: Array.isArray(j.warnings) ? j.warnings : [] };
    } catch { /* not the CLI's answer: below */ }
  }
  const lines = String(r?.stderr || r?.stdout || "").split("\n").map((l) => l.replace(/^automagik-herdr: /, "").trim()).filter(Boolean);
  // The CLI's refusal is its last stderr line (warnings come before it).
  const refused = lines.pop() ?? `Restart failed (exit ${r?.code ?? "?"}).`;
  return { refused, forceable: /pass --force/.test(refused) };
}
