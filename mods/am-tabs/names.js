import { spaces, panes, run, shared, setShared } from "herdr";

// Names this mod gave each tab, so it can tell its own names from the user's
// (tab.rename sets `named`, so `named` alone can't). Persisted.
const GIVEN_KEY = "tab-titles.set";

// omp's terminal title: "π > label" idle, "π <frame> label" working,
// "π ! label" when it needs you, "π: label" with tui.titleState off. Working
// frames are braille (default, dots), moon phases (pulse) or -\|/ (line).
const OMP_SEPARATOR = /^[>!:\-\|\\/\u2800-\u28FF\u{1F311}-\u{1F31A}]\s*/u;

function agentTitle(raw) {
  let t = (raw ?? "").trim();
  if (!t) return null;
  if (t.startsWith("π")) {
    t = t.slice(1).trimStart().replace(OMP_SEPARATOR, "").trim();
  }
  // omp can head the session name with a Nerd Fonts glyph (private use area),
  // which the tab bar's UI font can't draw.
  t = t.replace(/^[-\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]\s*/u, "").trim();
  // Generated titles carry omp's category code: "<glyph> <CODE>: <name>".
  t = t.replace(/^[A-Z0-9]{2,6}:\s+/, "").trim();
  return t || null;
}

const HOME = /^\/(?:Users|home)\/[^/]+\/?$|^\/root\/?$/;

function folderName(cwd) {
  if (!cwd) return null;
  if (HOME.test(cwd)) return "~";
  const parts = cwd.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || null;
}

function nameFor(pane, isAgent) {
  if (isAgent) {
    const title = agentTitle(pane.title);
    if (title) return title;
  }
  const program = pane.program;
  if (program && !program.shell) return program.name;
  return folderName(pane.cwd);
}

// Names every tab from one pane: the tab's agent pane if it has one
// (its terminal title), otherwise its first terminal pane (the running
// program, or its folder at the prompt). A tab the user renamed is left
// alone until they rename it back to "" (its number) or the agent's
// default name.
export function syncNames() {
  const all = panes();
  const given = { ...(shared(GIVEN_KEY) ?? {}) };
  const live = new Set();
  let changed = false;
  for (const space of spaces()) {
    for (const tab of space.tabs) {
      live.add(tab.id);
      const own = all.filter(p => p.tab === tab.id);
      const agentPane = own.find(p => p.program?.agent);
      const pane = agentPane ?? own.find(p => p.terminal);
      if (!pane) continue;
      const defaultName = agentPane?.program?.name ?? null;
      if (tab.named && tab.name !== given[tab.id] && tab.name !== defaultName) continue;
      const name = nameFor(pane, Boolean(agentPane));
      if (!name || name === tab.name) continue;
      run("tab.rename", { id: tab.id, name });
      given[tab.id] = name;
      changed = true;
    }
  }
  for (const id of Object.keys(given)) {
    if (!live.has(id)) {
      delete given[id];
      changed = true;
    }
  }
  if (changed) setShared(GIVEN_KEY, given);
}
