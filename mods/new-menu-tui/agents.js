// Programs Herdr's agent table still lists but their makers retired: Google ended Gemini CLI for
// individuals (Antigravity replaces it). Keyed by the knownAgents() entry's `key`.
export const RETIRED = new Set(["gemini"]);

// The menu's agents from knownAgents(): retired ones dropped first, then the installed ones (what
// ⌘1…9 count over, so the keys stay consecutive) and up to two not-installed suggestions.
export function menuAgents(list) {
  const visible = (list ?? []).filter((a) => !RETIRED.has(a?.key));
  const installed = visible.filter((a) => a.installed);
  return { installed, choices: [...installed, ...visible.filter((a) => !a.installed).slice(0, 2)] };
}
