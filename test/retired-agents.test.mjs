// Retired agents (Gemini CLI, which Antigravity replaces) stay out of the pack's agent lists:
// the + menu (new-menu-tui/agents.js) and the automations form (automations/agents.js). Both
// files are pure, so they load here as they are.
import { test } from "node:test";
import assert from "node:assert/strict";
import { menuAgents, RETIRED as MENU_RETIRED } from "../mods/new-menu-tui/agents.js";
import { offeredAgents, RETIRED as AUTO_RETIRED } from "../mods/automations/agents.js";

const agent = (key, installed) => ({ key, name: key, installed, run: [key] });
const keys = (list) => list.map((a) => a.key);

test("both mods retire gemini", () => {
  assert.deepEqual([...MENU_RETIRED], ["gemini"]);
  assert.deepEqual([...AUTO_RETIRED], ["gemini"]);
});

test("+ menu: an installed gemini gets no row and no number key; the keys stay consecutive", () => {
  const { installed, choices } = menuAgents([agent("claude", true), agent("gemini", true), agent("codex", true)]);
  assert.deepEqual(keys(installed), ["claude", "codex"]);   // ⌘1 claude, ⌘2 codex
  assert.deepEqual(keys(choices), ["claude", "codex"]);
});

test("+ menu: a not-installed gemini is never suggested and takes no suggestion slot", () => {
  const list = [agent("claude", true), agent("gemini", false), agent("pi", false), agent("omp", false)];
  const { installed, choices } = menuAgents(list);
  assert.deepEqual(keys(installed), ["claude"]);
  assert.deepEqual(keys(choices), ["claude", "pi", "omp"]);
});

test("+ menu: a list without retired agents is unchanged", () => {
  const list = [agent("claude", true), agent("codex", true), agent("pi", false), agent("omp", false), agent("agy", false)];
  const { installed, choices } = menuAgents(list);
  assert.deepEqual(keys(installed), ["claude", "codex"]);
  assert.deepEqual(keys(choices), ["claude", "codex", "pi", "omp"]);
});

test("+ menu: gemini alone, or no list, leaves nothing", () => {
  assert.deepEqual(menuAgents([agent("gemini", true)]), { installed: [], choices: [] });
  assert.deepEqual(menuAgents(undefined), { installed: [], choices: [] });
});

test("automations: the form offers installed agents, the entry's own, never gemini", () => {
  assert.deepEqual(offeredAgents(["claude", "gemini", "pi"], "claude"), ["claude", "pi"]);
  assert.deepEqual(offeredAgents(["claude"], "codex"), ["claude", "codex"]);
  assert.deepEqual(offeredAgents(["claude"], "gemini"), ["claude"]);
  assert.deepEqual(offeredAgents(null, "gemini"), ["claude", "codex", "pi"]);
});
