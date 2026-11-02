// Coding agents and their models (A12): how each agent is started, which model a running
// one uses (read from its foreground command line), its own configured default, a short
// list of models a bot may be pinned to, and the flag that passes a pin at Start.
// Pure: no `herdr`, `gpui-kit`, `gpui-base` or `fs`; files are read through an injected
// `read(path) => string | null`, so `node --test` runs it and the CLI and the mod share it.
// Apache-2.0.

/**
 * The agents people start, keyed as Herdr's shipped programs table keys them (the table in
 * the Herdr binary, 2026-11-01: the entries with a `run`), plus `omp` (Oh My Pi, which this
 * host's templates start). `run` is how Herdr starts each one; `match` other process names.
 * `programs.json` in the app home may override `run` or add entries (see withOverrides).
 */
export const AGENTS = Object.freeze({
  claude: { name: "Claude Code", run: ["claude"], match: ["claude-code"] },
  codex: { name: "Codex", run: ["codex"] },
  pi: { name: "Pi", run: ["pi"] },
  omp: { name: "Oh My Pi", run: ["omp"] },
  opencode: { name: "OpenCode", run: ["opencode"] },
  cursor: { name: "Cursor", run: ["cursor-agent"], match: ["cursor-agent"] },
  copilot: { name: "Copilot", run: ["copilot"], match: ["github-copilot"] },
  amp: { name: "Amp", run: ["amp"] },
  grok: { name: "Grok", run: ["grok"] },
  antigravity: { name: "Antigravity", run: ["agy"], match: ["agy"] },
  kimi: { name: "Kimi", run: ["kimi"] },
  kiro: { name: "Kiro", run: ["kiro-cli"], match: ["kiro-cli"] },
  hermes: { name: "Hermes", run: ["hermes"] },
  qoder: { name: "Qoder", run: ["qodercli"], match: ["qodercli"] },
  crush: { name: "Crush", run: ["crush"] },
  gemini: { name: "Gemini", run: ["gemini"] },
});

const isObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

/**
 * AGENTS with an app home's `programs.json` text applied (null: none): an entry there with
 * a `run` list overrides that agent's `run` or adds an agent, as Herdr's knownAgents() does.
 * A text that doesn't parse changes nothing.
 */
export function withOverrides(programsText) {
  const out = Object.fromEntries(Object.entries(AGENTS).map(([k, v]) => [k, { ...v }]));
  let programs = null;
  try { programs = programsText ? JSON.parse(programsText)?.programs : null; } catch { programs = null; }
  if (!isObject(programs)) return out;
  for (const [key, p] of Object.entries(programs)) {
    if (!isObject(p)) continue;
    const run = Array.isArray(p.run) && p.run.length && p.run.every((w) => typeof w === "string") ? p.run : null;
    if (out[key]) { if (run) out[key].run = run; if (typeof p.name === "string") out[key].name = p.name; }
    else if (run) out[key] = { name: typeof p.name === "string" ? p.name : key, run, ...(Array.isArray(p.match) ? { match: p.match } : {}) };
  }
  return out;
}

// Programs that run another program named in their arguments (Herdr's "interpreters").
const INTERPRETERS = new Set(["node", "bun", "bunx", "deno", "python", "python3", "npx", "pnpm", "yarn", "uv", "uvx",
  "ruby", "bundle", "env", "sudo", "nice", "time", "watch", "nodemon"]);
const base = (p) => String(p ?? "").split("/").pop().replace(/^-/, "");

/**
 * The agent's own arguments in a foreground argv: past any interpreter (`bun …/omp`,
 * `node …/codex.js`, `env K=V claude`) and its flags. Returns { program, args }, `program`
 * the basename of the agent's executable (".js"/".mjs"/".cjs" dropped).
 */
export function agentArgv(argv) {
  const words = Array.isArray(argv) ? argv.map(String) : [];
  let i = 0;
  while (i < words.length && INTERPRETERS.has(base(words[i]))) {
    i += 1;
    while (i < words.length && (words[i].startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]))) i += 1;
  }
  if (i >= words.length) return { program: words.length ? base(words[0]) : "", args: [] };
  return { program: base(words[i]).replace(/\.(m|c)?js$/, ""), args: words.slice(i + 1) };
}

/** The agent key a foreground argv runs, by `run[0]`, key or `match` in `agents`, or null. */
export function agentKeyOfArgv(argv, agents = AGENTS) {
  const { program } = agentArgv(argv);
  if (!program) return null;
  for (const [key, a] of Object.entries(agents)) {
    if (key === program || base(a.run?.[0]) === program || (a.match ?? []).includes(program)) return key;
  }
  return null;
}

// Each agent's model flags, read from `<agent> --help` on this host (2026-11-01: Claude Code
// 2.1.316, codex, gemini, omp, pi). Agents not installed here have none listed, so their
// model is never guessed: detectModel and modelArgs give null / [] for them.
const FLAGS = {
  claude: { long: ["--model"] },
  codex: { long: ["--model"], short: ["-m"], config: ["-c", "--config"] },
  gemini: { long: ["--model"], short: ["-m"] },
  pi: { long: ["--model"] },
  omp: { long: ["--model"] },
};

const unquote = (v) => String(v).trim().replace(/^(["'])(.*)\1$/, "$2");

/**
 * The model a running agent was started with, read from its foreground argv (A12), or
 * null when the command line names none (the agent then runs its own default). The last
 * flag wins, as each agent's own parser has it. Exact flags only: `--fallback-model`,
 * `--models` or codex's `-c model_provider=…` are not the model.
 */
export function detectModel(argv, agentKey) {
  const { program, args } = agentArgv(argv);
  const key = FLAGS[agentKey] ? agentKey : agentKeyOfArgv(argv);
  const flags = FLAGS[key];
  if (!flags || !program) return null;
  let model = null;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--") break;
    const eq = a.indexOf("=");
    const name = a.startsWith("--") && eq > 0 ? a.slice(0, eq) : a;
    const inline = a.startsWith("--") && eq > 0 ? a.slice(eq + 1) : null;
    if ((flags.long ?? []).includes(name) || (flags.short ?? []).includes(name)) {
      const v = inline ?? args[i + 1];
      if (inline === null) i += 1;
      if (typeof v === "string" && v !== "" && !v.startsWith("-")) model = unquote(v);
    } else if ((flags.short ?? []).some((s) => a.startsWith(s) && a.length > s.length && !a.startsWith("--"))) {
      model = unquote(a.slice(2)); // -mgpt-x
    } else if ((flags.config ?? []).includes(name)) {
      const v = inline ?? args[i + 1];
      if (inline === null) i += 1;
      const m = /^\s*model\s*=\s*(.+)$/.exec(v ?? "");
      if (m) model = unquote(m[1]);
    }
  }
  return model;
}

// Top-level `model = "…"` of a TOML text: before the first [section] (profiles carry their own).
function tomlTopModel(text) {
  for (const line of String(text).split("\n")) {
    if (/^\s*\[/.test(line)) break;
    const m = /^\s*model\s*=\s*(["'])(.*?)\1\s*(#.*)?$/.exec(line);
    if (m) return m[2];
  }
  return null;
}

/**
 * The agents' own config files this module reads, by name, under a home folder. A caller
 * whose file reads are async (the mod's readTextFile) reads these first and passes the
 * texts to defaultModelFrom / knownModelsFrom.
 */
export function configPaths(home) {
  return {
    claudeSettings: `${home}/.claude/settings.json`,
    codexConfig: `${home}/.codex/config.toml`,
    codexModels: `${home}/.codex/models_cache.json`,
    geminiSettings: `${home}/.gemini/settings.json`,
  };
}

// Every config text (null when missing) through a synchronous `read(path)`.
function textsOf(home, read) {
  const out = {};
  for (const [name, path] of Object.entries(configPaths(home))) {
    try { out[name] = read(path) ?? null; } catch { out[name] = null; }
  }
  return out;
}

const parseJson = (t) => { try { return typeof t === "string" && t ? JSON.parse(t) : null; } catch { return null; } };

/**
 * The model an agent runs when its command line names none: its own configured default,
 * when that is one cheap local file (Claude Code: `~/.claude/settings.json` `model`; Codex:
 * `~/.codex/config.toml` top-level `model`; Gemini: `~/.gemini/settings.json` `model.name`
 * or `model`). Null for every other agent, or when the file or key is missing.
 * `texts`: configPaths' names mapped to each file's text (null or absent: no file).
 */
export function defaultModelFrom(agentKey, texts = {}) {
  if (agentKey === "claude") {
    const m = parseJson(texts.claudeSettings)?.model;
    return typeof m === "string" && m ? m : null;
  }
  if (agentKey === "codex") return typeof texts.codexConfig === "string" ? tomlTopModel(texts.codexConfig) : null;
  if (agentKey === "gemini") {
    const m = parseJson(texts.geminiSettings)?.model;
    const name = typeof m === "string" ? m : m?.name;
    return typeof name === "string" && name ? name : null;
  }
  return null;
}

/** defaultModelFrom over a synchronous `read(path) => string | null` under `home` (the CLI). */
export function defaultModel(agentKey, { home, read }) {
  return defaultModelFrom(agentKey, textsOf(home, read));
}

// Claude Code: the aliases `claude --help` names ("an alias for the latest model (e.g.
// 'sonnet' or 'opus')") and the current model ids of the Claude 5 family (2026-11-01).
const CLAUDE_MODELS = ["opus", "sonnet", "haiku", "claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];

/**
 * The models a bot running `agentKey` may be pinned to (A12: picked from a list, never
 * typed). Claude Code: CLAUDE_MODELS above. Codex: the slugs in its own model cache,
 * `~/.codex/models_cache.json` `.models[].slug`, which Codex refreshes itself. Any agent:
 * plus its configured default (defaultModelFrom). Others: empty (no pin offered).
 * `texts` as for defaultModelFrom.
 */
export function knownModelsFrom(agentKey, texts = {}) {
  const out = [];
  const add = (m) => { if (typeof m === "string" && m && !out.includes(m)) out.push(m); };
  if (agentKey === "claude") CLAUDE_MODELS.forEach(add);
  if (agentKey === "codex") {
    const cache = parseJson(texts.codexModels);
    for (const m of Array.isArray(cache?.models) ? cache.models : []) add(m?.slug ?? m?.id);
  }
  add(defaultModelFrom(agentKey, texts));
  return out;
}

/** knownModelsFrom over a synchronous `read(path)` under `home` (the CLI); no reader: the static list. */
export function knownModels(agentKey, { home, read } = {}) {
  return knownModelsFrom(agentKey, read && home ? textsOf(home, read) : {});
}

/** The arguments that start `agentKey` on `model` (A12), [] when there is no pin or no known flag. */
export function modelArgs(agentKey, model) {
  if (!model) return [];
  if (agentKey === "omp") return [`--model=${model}`]; // omp's help spells it --model=<value>
  const flags = FLAGS[agentKey];
  if (!flags) return [];
  return [flags.long?.[0] ?? flags.short[0], model];
}

/**
 * The model a bot's row shows (A12): for a running bot (`argv`: its pane's foreground), what
 * runs: the model its command line names, else the agent's own default (a pin it wasn't
 * started with doesn't run). For a bot that isn't running: its pin, else the default.
 * Returns { model, source: "detected" | "pinned" | "default" } or { model: null, source: null }.
 */
export function shownModel({ argv, agentKey, pinned, fallback }) {
  if (argv) {
    const detected = detectModel(argv, agentKey);
    if (detected) return { model: detected, source: "detected" };
  } else if (pinned) return { model: pinned, source: "pinned" };
  if (fallback) return { model: fallback, source: "default" };
  return { model: null, source: null };
}

/**
 * The agent key a name stands for in `agents` (a key, an executable or a `match` name, so
 * `claude-code` is `claude`), or null. What a person types for --agent goes through this.
 */
export function resolveAgent(name, agents = AGENTS) {
  if (typeof name !== "string" || !name.trim()) return null;
  return agents[name] ? name : agentKeyOfArgv([name], agents);
}

// Each agent's reasoning-effort flag, read from `<agent> --help` on this host (2026-11-02):
// Claude Code 2.1.316 `--effort <level>`; codex's config key `model_reasoning_effort`
// through `-c`; pi `--thinking <level>`; omp `--thinking=<value>`. gemini has none.
const EFFORT = {
  claude: (level) => ["--effort", level],
  codex: (level) => ["-c", `model_reasoning_effort=${level}`],
  pi: (level) => ["--thinking", level],
  omp: (level) => [`--thinking=${level}`],
};

/** True when `agentKey` has an effort flag effortArgs knows. */
export const hasEffortFlag = (agentKey) => Boolean(EFFORT[agentKey]);

/** The arguments that start `agentKey` at reasoning `effort`, [] when none is given or known. */
export function effortArgs(agentKey, effort) {
  if (!effort || !EFFORT[agentKey]) return [];
  return EFFORT[agentKey](effort);
}
