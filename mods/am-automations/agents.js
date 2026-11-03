// The agents hc can hand a prompt to and watch to the end (config.KindTakesPromptArg).
export const AGENTS = ["claude", "codex", "pi"];

// Programs Herdr's agent table still lists but their makers retired: Google ended Gemini CLI for
// individuals (Antigravity replaces it). Keyed by the knownAgents() entry's `key`.
export const RETIRED = new Set(["gemini"]);

// The form's agent pills: the installed ones (all when the installed list is unknown), and the
// entry's own agent even if it is not installed (any more). Never a retired one.
export function offeredAgents(installed, current) {
  return AGENTS.filter((a) => !RETIRED.has(a)
    && (!installed || installed.includes(a) || a === current));
}
