// Bot workers: a bot writes no code; for each task it starts one worker, an hc child of its
// pane, in the task's worktree (`automagik-herdr worker`). This file holds the plain-data
// parts: which agent, model and effort (or hc template) a worker runs, its `hc run` arguments, the task
// worktree's folder and the git answers about worktrees, and the rows of the workers ledger
// usagemeter reads. Pure: no `herdr`, `gpui-*` or `fs`, so `node --test`, the CLI and the
// briefing hook share it. Apache-2.0.

import { AGENTS, effortArgs, hasEffortFlag, modelArgs, promptArgs, resolveAgent } from "./models.js";
import { TEMPLATE_SHAPE } from "./model.js";

export { TEMPLATE_SHAPE };

// The usage-tagging contract (usagemeter reads these): a worker terminal carries
// `worker.of=<botId>`, `branch=<branch>` and `worker.role=<role>`, and its cwd is the task
// worktree. Started with Genie's task id (`--task`), it also carries `task=<id>`,
// `task.project=<main checkout>` and `task.lead=<lead bot>`; usagemeter joins on (project, task).
// A worker started before the task contract has no `branch` label: its `task` label is the
// branch (workerBranch reads either).
export const WORKER_OF_LABEL = "worker.of";
export const TASK_LABEL = "task";
export const TASK_PROJECT_LABEL = "task.project";
export const TASK_LEAD_LABEL = "task.lead";
export const BRANCH_LABEL = "branch";
/** What a worker does in its worktree: one of ROLES. */
export const WORKER_ROLE_LABEL = "worker.role";
export const WORKER_MODEL_LABEL = "worker.model";
export const WORKER_EFFORT_LABEL = "worker.effort";
/** The hc template a worker runs (`--template`, or the bot's `worker.template`). */
export const WORKER_TEMPLATE_LABEL = "worker.template";
/** The Claude session a terminal runs, set by the briefing hook when it changes. */
export const SESSION_LABEL = "agent.session";

/** A worker's roles. Dev, test and fix write to the worktree; review never does. */
export const ROLES = ["dev", "test", "review", "fix"];
export const WRITER_ROLES = ["dev", "test", "fix"];
const ROLE_OF_RANK = { tester: "test", reviewer: "review", fixer: "fix" };

/**
 * A worker's role: `given` (--role) when it is one of ROLES, else from the bot's rank
 * (tester: test, reviewer: review, fixer: fix, any other rank or none: dev). { role } or { error }.
 */
export function workerRole(bot, given) {
  if (given === undefined || given === null) return { role: ROLE_OF_RANK[bot?.rank] ?? "dev" };
  if (ROLES.includes(given)) return { role: given };
  return { error: `--role is one of ${ROLES.join(", ")}, not "${given}".` };
}

/**
 * Whether a live worker's labels make it a writer: a writer role, or no role label at all
 * (a worker started before roles holds its worktree until it ends).
 */
export const writesWorktree = (labels) => labels?.[WORKER_ROLE_LABEL] !== "review";

/** Genie's short task id (gh-1415, gl-231, gn-42); the internal `t_…` key is refused apart. */
export const TASK_SHAPE = /^[a-z0-9][a-z0-9-]{0,40}$/;
/** A lead: a bot id (`b-` plus 10 base32 characters) or a Genie session (`session-<uuid>`). */
export const LEAD_SHAPE = /^(?:b-[a-z2-7]{10}|session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
/** The ranks whose task workers name their lead: the task belongs to another bot. */
export const LEAD_RANKS = ["reviewer", "fixer"];
/** hc's terminal names: 1-32 of a-z 0-9 - _ (`hc run --name`). */
export const HC_NAME_MAX = 32;

/** Why `--task <id>` can't be used, or null. */
export function taskIdProblem(taskId) {
  if (typeof taskId !== "string") return "--task needs Genie's short task id (gn-N, gh-N or gl-N).";
  if (taskId.startsWith("t_")) return "internal Genie id; pass the short id gn-N, gh-N or gl-N";
  if (!TASK_SHAPE.test(taskId)) {
    return `--task: "${taskId}" isn't a short task id (a-z, 0-9 and "-", at most 41, no dash first: gn-42, gh-1415, gl-231).`;
  }
  return null;
}

/** A task worker's terminal name: exactly `<id>-<role>`, never suffixed. */
export const taskWorkerName = (taskId, role) => `${taskId}-${role}`;

/** A worker's branch from its labels: `branch`, else (started before the task contract) `task`. */
export const workerBranch = (labels) => labels?.[BRANCH_LABEL] || labels?.[TASK_LABEL] || null;
/** A worker's Genie task id: `task` beside a `branch` label (without one, `task` is the old branch). */
export const workerTaskId = (labels) => (labels?.[BRANCH_LABEL] ? labels?.[TASK_LABEL] || null : null);

/**
 * Whether a task runs its bot's other arm (planned swaps): `byte` is the first byte of
 * sha256(`${botId}:${projectKey}:${taskId}`), computed by the caller (no `node:` import
 * here). One task in three, by rule, the same for every worker of that bot on that task.
 */
export const swapByte = (byte) => Number.isInteger(byte) && byte % 3 === 0;

/** A bot's swap arm (`worker.swap`: { agent?, model?, effort? }) as a workerPlan pick, or null. */
export function swapArm(bot) {
  const w = bot?.worker;
  const swap = w && typeof w === "object" && w.swap && typeof w.swap === "object" && !Array.isArray(w.swap) ? w.swap : null;
  if (!swap) return null;
  const arm = {};
  for (const k of ["agent", "model", "effort"]) if (typeof swap[k] === "string" && swap[k]) arm[k] = swap[k];
  return Object.keys(arm).length ? arm : null;
}

/**
 * Whether a worker with this `pick` runs an hc template: a per-task template, or the bot's
 * default template with no per-task agent, model or effort. A template worker never swaps.
 */
export function runsTemplate(bot, pick = {}) {
  if (pick.template) return true;
  const defaults = bot?.worker && typeof bot.worker === "object" ? bot.worker : {};
  return Boolean(defaults.template) && !["agent", "model", "effort"].some((k) => pick[k]);
}

/** A value the agent would read as an option (a model, a task text starting with a dash). */
export const optionLike = (value) => typeof value === "string" && value.trimStart().startsWith("-");

/** An effort level as the agents spell them (low, medium, high, xhigh, max, …). */
export const EFFORT_SHAPE = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * What a worker runs: the per-task `pick` ({ template, agent, model, effort }, each optional)
 * over the bot's `worker` defaults, over the bot's own agent. A template owns its command, so
 * it runs alone: a pick naming a template and an agent, model or effort is refused; a default
 * template wins over default agent, model and effort (with a warning); and any per-task agent,
 * model or effort sets a default template aside. A bot's default model is for its default
 * worker agent: a task that picks another agent runs that agent's own default model unless it
 * names one. The bot's own model pin is its seat's, never its workers'. A model or effort the
 * agent has no flag for is left out with a warning. `agents`: the table Herdr starts from.
 * Returns { template, agent, model, effort, argv, warnings } (template null, or agent, model,
 * effort and argv null) or { error }.
 */
export function workerPlan(bot, pick = {}, agents = AGENTS) {
  const warnings = [];
  const defaults = bot?.worker && typeof bot.worker === "object" ? bot.worker : {};
  const picked = ["agent", "model", "effort"].filter((k) => pick[k]);
  const asTemplate = (template) => (TEMPLATE_SHAPE.test(template) ? { template, agent: null, model: null, effort: null, argv: null, warnings }
    : { error: `"${template}" isn't an hc template name (letters, digits, ".", "_" and "-", no dash first).` });
  if (pick.template) {
    if (picked.length) return { error: `A template owns its command: --template goes alone, without --${picked.join(", --")}.` };
    return asTemplate(pick.template);
  }
  if (defaults.template && !picked.length) {
    const shadowed = ["agent", "model", "effort"].filter((k) => defaults[k]);
    if (shadowed.length) warnings.push(`${bot.name}'s worker template ${defaults.template} owns its command; its worker ${shadowed.join(", ")} default${shadowed.length > 1 ? "s are" : " is"} ignored.`);
    return asTemplate(defaults.template);
  }
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
  return { template: null, agent, model, effort, argv, warnings };
}

/**
 * `hc run` arguments for a worker: in the background, a child of the bot's pane, in the
 * task worktree, with the usage labels and no `bot` label (a worker is never a bot, so the
 * sidebar folds it under its bot as a helper). The task text is the agent's last argument
 * (behind `-i` for agy: models.js promptArgs, by `agent`), after `--`, never part of a shell string. An agent runs as `/usr/bin/env PATH=<path> <argv>`
 * (env by its full path, so nothing hangs on core's PATH), so it gets the calling pane's PATH,
 * not herdr-core's (a bun script like omp needs ~/.bun/bin). A
 * `template` runs in hc's documented template form, `<template> <task>` after the options,
 * with no `--` (neither starts with a dash: both are refused before): it sets its own command.
 */
export function workerArgs({ botId, branch, role, name, cwd, parent, agent, model, effort, argv, task, template, path,
  taskId, project, lead }) {
  const args = ["run", "--bg", "--json"];
  if (name) args.push("--name", name);
  args.push("--cwd", cwd, "--label", `${WORKER_OF_LABEL}=${botId}`);
  if (taskId) {
    args.push("--label", `${TASK_LABEL}=${taskId}`, "--label", `${TASK_PROJECT_LABEL}=${project}`);
    if (lead) args.push("--label", `${TASK_LEAD_LABEL}=${lead}`);
  }
  args.push("--label", `${BRANCH_LABEL}=${branch}`);
  if (role) args.push("--label", `${WORKER_ROLE_LABEL}=${role}`);
  if (template) return [...args, "--label", `${WORKER_TEMPLATE_LABEL}=${template}`, "--parent", parent, template, task];
  if (model) args.push("--label", `${WORKER_MODEL_LABEL}=${model}`);
  if (effort) args.push("--label", `${WORKER_EFFORT_LABEL}=${effort}`);
  const env = path ? [ENV, `PATH=${path}`] : [];
  return [...args, "--parent", parent, "--", ...env, ...argv, ...promptArgs(agent, task)];
}

/**
 * The agent an hc template's command runs: the agent (a key of `agents`) whose program comes
 * first in it as a word of its own (`… codex --no-daemon …`, `/usr/bin/claude …`), else null.
 */
export function templateAgent(command, agents = AGENTS) {
  let best = null;
  for (const [key, agent] of Object.entries(agents)) {
    const program = agent?.run?.[0];
    if (!program) continue;
    const word = program.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const at = String(command ?? "").search(new RegExp(`(?:^|[\\s/])${word}(?=\\s|$)`));
    if (at >= 0 && (!best || at < best.at)) best = { key, at };
  }
  return best?.key ?? null;
}

/** The env program agent workers start under, by its full path (macOS and Linux both have it). */
export const ENV = "/usr/bin/env";

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
 * A start row: a worker (`kind: "worker"`, `worktree` its cwd as a real path) or a bot seat
 * (`kind: "seat"`, from start and attach; `worktree` its folder). `task`: Genie's task id
 * (`--task`), else null; rows written before the task contract hold the branch there, with
 * no `branch` key. `branch`: the worker's branch. `project`: the main checkout (usagemeter
 * joins on project and task); `lead`: the task's lead bot; `base`: the commit the worktree
 * started from; `created`: this command made the worktree. `swap`: the task ran the bot's
 * other arm (planned swaps); `override`: the bot picked the agent, model, effort or template
 * itself; `override_requested`: on a swap task, the { agent?, model?, effort? } it asked for
 * and didn't get, else null. `pid` is the terminal's foreground pid when hc gave one.
 * `template`: the hc template a worker runs (its agent, model and effort are then null),
 * else null. `role`: a worker's role (ROLES). A seat's worker fields are null or false.
 */
export function startRow({ kind, terminal, pid, botId, task, branch, project, lead, worktree, base, created, agent, model, effort,
  template, role, swap, override, overrideRequested, at }) {
  const requested = overrideRequested && Object.keys(overrideRequested).length ? { ...overrideRequested } : null;
  return { event: "start", kind, terminal, pid: Number.isInteger(pid) ? pid : null, botId, task: orNull(task),
    worktree: orNull(worktree), agent: orNull(agent), model: orNull(model), effort: orNull(effort), template: orNull(template),
    role: orNull(role), branch: orNull(branch), project: orNull(project), lead: orNull(lead), base: orNull(base),
    created: created === true, swap: swap === true, override: override === true, override_requested: requested, at: stamp(at) };
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
