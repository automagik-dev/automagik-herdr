// The recorded sidebar fixtures (test/fixtures/sidebar/*.json, one State each, sidebar-rules
// D8) and the sidebar's view of them: each project's bot tree placed after its first space
// (A8), and each space's rows in R3 order (spaceRowOrder). A space's plain agents are the live
// agents in its panes that aren't a bot's pane, each with its hc sub-agents; its shells are
// the rest of its panes. Shared by the ordering tests of every sidebar-rules group.
import { readFileSync, readdirSync } from "node:fs";
import { parseBots } from "../mods/am-sidebar/model.js";
import { liveFrom, buildTree, placeTrees, helpersOf, knownBots, projectId, botFold, categoryFold, spaceRowOrder } from "../mods/am-sidebar/rows.js";

export const FIXTURES = new URL("./fixtures/sidebar/", import.meta.url);

/** Every recorded State, by file name without `.json` (golden files left out). */
export function fixtures() {
  return readdirSync(FIXTURES).filter((f) => f.endsWith(".json") && !f.endsWith(".golden.json"))
    .map((f) => ({ name: f.slice(0, -5), text: readFileSync(new URL(f, FIXTURES), "utf8") }))
    .map((f) => ({ ...f, state: JSON.parse(f.text) }));
}

export const golden = (name) => JSON.parse(readFileSync(new URL(`${name}.golden.json`, FIXTURES), "utf8"));

/** A fold state with every bot and category of a tree open. */
export function openAll(tree) {
  const open = new Map();
  const walk = (n) => { if (!n) return; open.set(botFold(n.bot.id), true); n.members.forEach(walk); };
  walk(tree.main);
  for (const c of tree.categories) { open.set(categoryFold(tree, c.id), true); c.bots.forEach(walk); }
  tree.uncategorised.forEach(walk);
  return open;
}

/** The sidebar's view of a State: trees and each space's R3 rows ({ space, tree, rows }). */
export function view(state, { open = () => new Map(), now = 1_800_000_000_000 } = {}) {
  const projects = state.projects.map((p) => ({ ...p, ...parseBots(JSON.stringify(p.file)) }));
  const known = knownBots(projects);
  const live = liveFrom(state.terminals, known);
  const trees = buildTree({ projects, live, terminals: state.terminals, now });
  const { at } = placeTrees(state.spaces.map((s) => s.id), trees);
  const byId = new Map(trees.map((t) => [projectId(t), t]));
  const botPanes = new Set(Object.values(live).map((l) => l.terminal));
  const term = new Map(state.terminals.map((t) => [t.address, t]));
  return state.spaces.map((space) => {
    const tree = at.has(space.id) ? byId.get(at.get(space.id)) : null;
    const panes = space.tabs.flatMap((t) => t.panes).map((p) => term.get(p.terminal)).filter((t) => t?.state === "live");
    const agents = panes.filter((t) => t.program?.agent && !botPanes.has(t.address)).map((t) => ({
      terminal: t.address, subs: helpersOf(state.terminals, t.address, known).map((h) => ({ terminal: h.terminal, depth: h.depth })),
    }));
    const shells = panes.filter((t) => !t.program?.agent).map((t) => ({ terminal: t.address }));
    return { space, tree, panes, rows: spaceRowOrder({ tree, agents, shells, open: tree ? open(tree) : new Map() }) };
  });
}
