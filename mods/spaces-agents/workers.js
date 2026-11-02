// Bot workers: a bot writes no code; for each task it starts one worker, an hc child of its
// pane, in the task's worktree (`automagik-herdr worker`). This file holds the plain-data
// parts: which agent, model and effort a worker runs, its `hc run` arguments, the task
// worktree's folder and the git answers about worktrees, and the rows of the workers ledger
// usagemeter reads. Pure: no `herdr`, `gpui-*` or `fs`, so `node --test`, the CLI and the
// briefing hook share it. Apache-2.0.

import { AGENTS, effortArgs, hasEffortFlag, modelArgs, resolveAgent } from "./models.js";

// The usage-tagging contract (usagemeter reads these): a worker terminal carries
// `worker.of=<botId>` and `task=<branch>`, and its cwd is the task worktree.
export const WORKER_OF_LABEL = "worker.of";
export const TASK_LABEL = "task";
export const WORKER_MODEL_LABEL = "worker.model";
export const WORKER_EFFORT_LABEL = "worker.effort";
/** The Claude session a terminal runs, set by the briefing hook when it changes. */
export const SESSION_LABEL = "agent.session";

/** A value the agent would read as an option (a model, a task text starting with a dash). */
export const optionLike = (value) => typeof value === "string" && value.trimStart().startsWith("-");

/** An effort level as the agents spell them (low, medium, high, xhigh, max, …). */
export const EFFORT_SHAPE = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * What a worker runs: the per-task `pick` ({ agent, model, effort }, each optional) over the
 * bot's `worker` defaults, over the bot's own agent. A bot's default model is for its default
 * worker agent: a task that picks another agent runs that agent's own default model unless it
 * names one. The bot's own model pin is its seat's, never its workers'. A model or effort the
 * agent has no flag for is left out with a warning. `agents`: the table Herdr starts from.
 * Returns { agent, model, effort, argv, warnings } or { error }.
 */
export function workerPlan(bot, pick = {}, agents = AGENTS) {
  const warnings = [];
  const defaults = bot?.worker && typeof bot.worker === "object" ? bot.worker : {};
  let fallback = bot?.agent ?? null;
  if (defaults.agent) {
    const key = resolveAgent(defaults.agent, agents);
    if (key) fallback = key;
    else warnings.push(`${bot.name}'s worker agent "${defaults.agent}" isn't one Herdr knows; its own agent ${fallback} is used.`);
  }
  let agent = fallback;
  if (pick.agent) {
    agent = resolveAgent(pick.agent, agents);
    if (!agent) return { error: `"${pick.agent}" isn't a coding agent Herdr knows. Known: ${Object.keys(agents).join(", ")}.` };
  }
  if (!agent || !agents[agent]?.run?.length) return { error: `${bot?.name ?? "This bot"} has no coding agent for its workers; pass --agent.` };
  let model = pick.model || null;
  if (!model && defaults.model) {
    if (agent === fallback) model = defaults.model;
    else warnings.push(`${bot.name}'s worker model ${defaults.model} is for ${fallback}; ${agent} runs its own default.`);
  }
  if (model && optionLike(model)) return { error: `"${model}" isn't a model: it starts with a dash, so ${agent} would read it as an option.` };
  let effort = pick.effort || defaults.effort || null;
  if (effort && !EFFORT_SHAPE.test(effort)) return { error: `"${effort}" isn't an effort level (low, medium, high, …).` };
  if (model && !modelArgs(agent, model).length) {
    warnings.push(`${agents[agent].name} has no model flag this pack knows; model ${model} left out.`);
    model = null;
  }
  if (effort && !hasEffortFlag(agent)) {
    warnings.push(`${agents[agent].name} has no effort flag; effort ${effort} left out.`);
    effort = null;
  }
  const argv = [...agents[agent].run, ...modelArgs(agent, model), ...effortArgs(agent, effort)];
  return { agent, model, effort, argv, warnings };
}

/**
 * `hc run` arguments for a worker: in the background, a child of the bot's pane, in the
 * task worktree, with the usage labels and no `bot` label (a worker is never a bot, so the
 * sidebar folds it under its bot as a helper). The task text is the agent's last argument,
 * after `--`, never part of a shell string.
 */
export function workerArgs({ botId, branch, name, cwd, parent, model, effort, argv, task }) {
  const args = ["run", "--bg", "--json"];
  if (name) args.push("--name", name);
  args.push("--cwd", cwd, "--label", `${WORKER_OF_LABEL}=${botId}`, "--label", `${TASK_LABEL}=${branch}`);
  if (model) args.push("--label", `${WORKER_MODEL_LABEL}=${model}`);
  if (effort) args.push("--label", `${WORKER_EFFORT_LABEL}=${effort}`);
  return [...args, "--parent", parent, "--", ...argv, task];
}

/** A branch name as a folder name: lowercase, `/` and other marks as `-`. */
export function branchSlug(branch) {
  return String(branch).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 64) || "task";
}

/** The exclude line that keeps task worktrees out of the main checkout's `git add -A`. */
export const WORKTREES_EXCLUDE = "/.claude/worktrees/";

/** Where a new task worktree goes: `<main checkout>/.claude/worktrees/<slug>`. */
export const worktreeFolder = (mainCheckout, branch) => `${mainCheckout === "/" ? "" : mainCheckout.replace(/\/+$/, "")}/.claude/worktrees/${branchSlug(branch)}`;

/** `git worktree list --porcelain` as [{ path, branch (short name, or null), detached, bare }]. */
export function parseWorktrees(text) {
  const out = [];
  for (const block of String(text ?? "").split(/\n\s*\n/)) {
    const lines = block.split("\n").filter(Boolean);
    const path = lines.find((l) => l.startsWith("worktree "))?.slice(9);
    if (!path) continue;
    const ref = lines.find((l) => l.startsWith("branch "))?.slice(7) ?? null;
    out.push({ path, branch: ref?.startsWith("refs/heads/") ? ref.slice(11) : ref,
      detached: lines.includes("detached"), bare: lines.includes("bare") });
  }
  return out;
}

/**
 * The refs a new task branch may start from, in order: `--base` alone when given; else
 * origin/HEAD's branch, then dev, then main, then master (each as origin's, then local). The caller takes
 * the first that git verifies.
 */
export function baseCandidates(given, originHead) {
  if (given) return [given];
  const out = [];
  if (originHead) out.push(originHead);
  for (const name of ["dev", "main", "master"]) out.push(`origin/${name}`, name);
  return [...new Set(out)];
}

// ---- the workers ledger: <app home>/automagik-herdr/workers.jsonl ----
//
// Append-only, one JSON object per line, each line one O_APPEND write. Rows outlive the
// terminals: usagemeter joins its usage to bots and tasks through them.

export const LEDGER_FILE = "automagik-herdr/workers.jsonl";
export const ledgerPath = (appHome) => `${String(appHome).replace(/\/+$/, "")}/${LEDGER_FILE}`;
const stamp = (at) => new Date(at ?? Date.now()).toISOString();
const orNull = (x) => (x === undefined || x === "" ? null : x);

/**
 * A start row: a worker (`kind: "worker"`, `task` its branch, `worktree` its cwd) or a bot
 * seat (`kind: "seat"`, from start and attach; `task` null, `worktree` its folder). `pid` is
 * the terminal's foreground pid when hc gave one.
 */
export function startRow({ kind, terminal, pid, botId, task, worktree, agent, model, effort, at }) {
  return { event: "start", kind, terminal, pid: Number.isInteger(pid) ? pid : null, botId, task: orNull(task),
    worktree: orNull(worktree), agent: orNull(agent), model: orNull(model), effort: orNull(effort), at: stamp(at) };
}

/** A session row: the Claude session (and its transcript) a terminal now runs. */
export function sessionRow({ terminal, session, transcript, at }) {
  return { event: "session", terminal, session, transcript: orNull(transcript), at: stamp(at) };
}

/** One ledger line. */
export const ledgerLine = (row) => `${JSON.stringify(row)}\n`;

/** A ledger's rows; a line that isn't a JSON object (a torn write) is skipped. */
export function readLedger(text) {
  const rows = [];
  for (const line of String(text ?? "").split("\n")) {
    if (!line.trim()) continue;
    try { const row = JSON.parse(line); if (row && typeof row === "object" && !Array.isArray(row)) rows.push(row); } catch { /* skipped */ }
  }
  return rows;
}

/**
 * What the briefing hook does about a Claude session: `get` is `hc get` of its terminal,
 * `input` the hook's stdin text. { session, transcript } when the input names a session the
 * terminal's SESSION_LABEL doesn't hold yet (label it, append a row); else null.
 */
export function sessionChange(get, input) {
  let data = null;
  try { data = typeof input === "string" && input.trim() ? JSON.parse(input) : null; } catch { data = null; }
  const session = data?.session_id;
  if (typeof session !== "string" || !session.trim() || !get || typeof get !== "object") return null;
  if (get.labels?.[SESSION_LABEL] === session) return null;
  return { session, transcript: typeof data.transcript_path === "string" ? data.transcript_path : null };
}
