// The rename to am-* (D4, D12) as plain data: which old folder becomes which, and how a layout,
// a keys.json and a shared key follow it. Pure: no `herdr` and no `node:` imports, so the
// sidebar (its shared-key shim), migrateHome.mjs (the app-home side) and `node --test` share it.
// Old names stay readable for one release; removing them is the contract step (v0.4.0). Apache-2.0.

/** Old folder → its am-* folder. am-quota keeps its name. */
export const RENAMES = Object.freeze({
  "spaces-agents": "am-sidebar",
  "sidebar-chrome": "am-footer",
  "auto-tabs": "am-tabs",
  "new-menu-tui": "am-new-menu",
  "md-menu": "am-markdown",
  "mod-manager": "am-mods",
  automations: "am-automations",
});

/**
 * Folders another pack mod took in (Groups 5a, 5b): the mod that does their job now. Never a
 * folder rename: their state is not carried, a layout block naming them is reported, not rewritten,
 * and only the commands in KEY_RENAMES and the key sections in ABSORBED_SECTIONS follow them.
 */
export const ABSORBED = Object.freeze({ "space-icon": "spaces-agents", "markdown-browser": "md-menu" });
/** The absorbed mods whose `mod:<name>` key section moves to their new home (its panes are that mod's now). */
export const ABSORBED_SECTIONS = Object.freeze(["markdown-browser"]);
/** Commands that changed more than their folder name (old → the pre-rename name; RENAMES then applies). */
export const KEY_RENAMES = Object.freeze({ "markdown-browser.open": "md-menu.open" });

/**
 * Shared keys (Herdr's shared.json, which only Herdr writes) → their am.* names. Each mod's shim
 * reads the new key and, on first load, copies the old value in (carryShared); the old keys stay
 * in place for one release, so a rollback to v0.2 finds them as they were before the upgrade.
 */
export const SHARED_RENAMES = Object.freeze({
  "spaces-agents.icons": "am.sidebar.icons",
  "spaces-agents.projects": "am.sidebar.projects",
  "spaces-agents.update-shown": "am.sidebar.update-shown",
  "spaces-agents.theme-selected": "am.sidebar.theme-selected",
  "space.colors": "am.space.colors",
  "sidebar.collapsed": "am.sidebar.collapsed",
  "sidebar.width": "am.sidebar.width",
  "markdown-browser.slots": "am.markdown.slots",
  "markdown-browser.show": "am.markdown.show",
  "markdown-browser.last": "am.markdown.last",
  "mod-manager.installed": "am.mods.installed",
});

/** App-home paths copied (never moved) to their new name when the target is absent: [old, new, the folder it follows]. */
export const PATH_RENAMES = Object.freeze([
  ["spaces-agents-projects.json", "am-sidebar-projects.json", "spaces-agents"],
  ["data/mod-manager", "data/am-mods", "mod-manager"],
]);

/**
 * The shim (D12): for each old key in `olds`, when its am.* key holds nothing yet and the old one
 * holds something, the value is copied over. Returns the keys copied. Never removes the old key.
 */
export function carryShared(shared, setShared, olds = Object.keys(SHARED_RENAMES)) {
  const carried = [];
  for (const old of olds) {
    const now = SHARED_RENAMES[old];
    if (!now || shared(now) != null) continue;
    const value = shared(old);
    if (value == null) continue;
    setShared(now, value);
    carried.push(now);
  }
  return carried;
}

/**
 * Which old names a reference may be rewritten from, and to what (references follow ownership):
 * an old folder that is gone from mods/ and whose successor is there and in the ownership record.
 * `owned`: the record's folders; `present(name)`: whether mods/<name> exists (a link counts).
 * Returns `{ active: {old: new}, kept: string[] }`; `kept` lists old folders still in mods/ (the
 * person's, or not renamed yet), whose references stay.
 */
export function activeRenames(owned, present) {
  const mine = (name) => Boolean(name) && owned.has(name) && present(name);
  const active = {};
  const kept = [];
  for (const old of [...Object.keys(RENAMES), ...Object.keys(ABSORBED)]) {
    if (present(old)) { kept.push(old); continue; }
    const step = RENAMES[old] ?? ABSORBED[old];
    const target = mine(RENAMES[step]) ? RENAMES[step] : mine(step) ? step : null;
    if (target) active[old] = target;
  }
  return { active, kept };
}

/** `action` (a keys.json value) with an old mod name moved onto `active`'s; null when it names none. */
export function renameAction(action, active) {
  if (typeof action !== "string") return null;
  const open = /^mod\.open:(.+)$/.exec(action);
  if (open) return RENAMES[open[1]] && active[open[1]] ? `mod.open:${active[open[1]]}` : null;
  const dot = action.indexOf(".");
  if (dot <= 0) return null;
  const mod = action.slice(0, dot);
  if (!active[mod]) return null;
  if (KEY_RENAMES[action]) return `${active[mod]}${KEY_RENAMES[action].slice(KEY_RENAMES[action].indexOf("."))}`;
  return RENAMES[mod] ? `${active[mod]}${action.slice(dot)}` : null;
}

/** A keys.json section (`mod:<name>`) moved onto `active`'s name, or null. */
export function renameSection(section, active) {
  const m = /^mod:(.+)$/.exec(section);
  if (!m || !active[m[1]]) return null;
  return RENAMES[m[1]] || ABSORBED_SECTIONS.includes(m[1]) ? `mod:${active[m[1]]}` : null;
}

/** The old mod a reference (a mod id, an action or a `mod:` section) names, or null. */
export function oldModOf(value) {
  if (typeof value !== "string") return null;
  const name = /^mod\.open:(.+)$/.exec(value)?.[1] ?? /^mod:(.+)$/.exec(value)?.[1] ?? (value.includes(".") ? value.slice(0, value.indexOf(".")) : value);
  return Object.hasOwn(RENAMES, name) || Object.hasOwn(ABSORBED, name) ? name : null;
}

const isNode = (n) => n !== null && typeof n === "object" && !Array.isArray(n);

/**
 * A parsed layout with `content.mod` and the root's `terminal_menu` moved onto `active`'s names.
 * Returns `{ layout, edits, left }` (edits: `{pointer, id, field, before, after}`; left: `{mod, ref}`
 * for each old name met but not rewritten), or null when the structure is not a layout (a root object whose
 * `children`, where present, are arrays of objects).
 */
export function rewriteLayout(parsed, active) {
  if (!isNode(parsed)) return null;
  const layout = JSON.parse(JSON.stringify(parsed));
  const edits = [];
  const left = new Map();
  const visit = (node, pointer) => {
    if (!isNode(node)) return false;
    if (node.children !== undefined && !Array.isArray(node.children)) return false;
    const mod = isNode(node.content) ? node.content.mod : undefined;
    if (typeof mod === "string") {
      if (RENAMES[mod] && active[mod]) {
        node.content.mod = active[mod];
        edits.push({ pointer: `${pointer}/content/mod`, id: node.id ?? null, field: "content.mod", before: mod, after: active[mod] });
      } else if (oldModOf(mod)) left.set(mod, oldModOf(mod));
    }
    return (node.children ?? []).every((child, i) => visit(child, `${pointer}/children/${i}`));
  };
  if (!visit(layout, "")) return null;
  const menu = layout.terminal_menu;
  if (typeof menu === "string") {
    if (RENAMES[menu] && active[menu]) {
      layout.terminal_menu = active[menu];
      edits.push({ pointer: "/terminal_menu", id: layout.id ?? null, field: "terminal_menu", before: menu, after: active[menu] });
    } else if (oldModOf(menu)) left.set(menu, oldModOf(menu));
  }
  return { layout, edits, left: [...left].map(([ref, mod]) => ({ mod, ref })) };
}

/**
 * A parsed keys.json (`{section: {key: action}}`) with every action and `mod:<old>` section moved
 * onto `active`'s names. A key whose new place is taken stays where it is (the person's binding
 * wins). Returns `{ keys, edits, left }` (edits: `{before: {section, key, action}, after: {…}}`),
 * or null when it is not that shape. Values that are not strings are left as they are.
 */
export function rewriteKeys(parsed, active) {
  if (!isNode(parsed) || !Object.values(parsed).every(isNode)) return null;
  const keys = JSON.parse(JSON.stringify(parsed));
  const edits = [];
  const left = new Map();
  for (const section of Object.keys(parsed)) {
    const toSection = renameSection(section, active) ?? section;
    if (toSection === section && oldModOf(section)) left.set(section, oldModOf(section));
    for (const [key, action] of Object.entries(parsed[section])) {
      const toAction = renameAction(action, active) ?? action;
      if (toAction === action && oldModOf(action)) left.set(action, oldModOf(action));
      if (toSection === section && toAction === action) continue;
      if (toSection !== section && keys[toSection]?.[key] !== undefined) { left.set(`${section} ${key}`, oldModOf(section)); continue; }
      if (toSection !== section) delete keys[section][key];
      (keys[toSection] ??= {})[key] = toAction;
      edits.push({ before: { section, key, action }, after: { section: toSection, key, action: toAction } });
    }
    if (toSection !== section && Object.keys(keys[section]).length === 0) delete keys[section];
  }
  return { keys, edits, left: [...left].map(([ref, mod]) => ({ mod, ref })) };
}
