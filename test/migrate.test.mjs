// The rename migration (Group 6a): an am-* pack installed over a v0.2.0 home and an owner-shaped
// one, through `node update.mjs install … --setup` as install.sh runs it, on scratch app homes
// only. Layouts and keys follow the folders the record renamed, each rewritten file backed up
// with a journal; a rollback reverts exactly those edits; shared.json and Pocket Link are never
// written. Neutral names throughout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import {
  ABSORBED, KEY_RENAMES, RENAMES, SHARED_RENAMES, activeRenames, carryShared, renameAction, rewriteKeys, rewriteLayout,
} from "../mods/spaces-agents/migrate.js";
import { apply, plan, pending, revert } from "../mods/spaces-agents/migrateHome.mjs";
import { parseMarker } from "../mods/spaces-agents/release.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const UPDATE = join(ROOT, "mods", "spaces-agents", "update.mjs");
const today = () => new Date().toISOString().slice(0, 10);
const read = (path) => readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(read(path));
const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
const writeJson = (path, value) => write(path, `${JSON.stringify(value, null, 2)}\n`);
/** One digest over every file and link under `dir` (names, modes, link targets, bytes). */
const treeSum = (dir) => {
  const h = createHash("sha256");
  const walk = (at, rel) => {
    for (const name of readdirSync(at).sort()) {
      const path = join(at, name), st = lstatSync(path);
      h.update(`${rel}${name}\0${st.mode}\0`);
      if (st.isSymbolicLink()) h.update(readlinkSync(path));
      else if (st.isDirectory()) walk(path, `${rel}${name}/`);
      else h.update(readFileSync(path));
    }
  };
  walk(dir, "");
  return h.digest("hex");
};

// ---- the pure rules ----

test("RENAMES are the D4 names; every shared key moves under am.*, and the shim copies once, never removing", () => {
  assert.deepEqual(RENAMES, {
    "spaces-agents": "am-sidebar", "sidebar-chrome": "am-footer", "auto-tabs": "am-tabs", "new-menu-tui": "am-new-menu",
    "md-menu": "am-markdown", "mod-manager": "am-mods", automations: "am-automations",
  });
  assert.equal(Object.hasOwn(RENAMES, "am-quota"), false);
  assert.ok(Object.values(SHARED_RENAMES).every((k) => k.startsWith("am.")));
  const store = new Map([["space.colors", { s1: "ansi3" }], ["sidebar.collapsed", false], ["am.sidebar.icons", { s1: "x" }], ["spaces-agents.icons", { s1: "old" }]]);
  const sets = [];
  const shared = (k) => store.get(k), setShared = (k, v) => { sets.push(k); store.set(k, v); };
  assert.deepEqual(carryShared(shared, setShared).sort(), ["am.sidebar.collapsed", "am.space.colors"]);
  assert.deepEqual(store.get("am.sidebar.icons"), { s1: "x" }, "a value already under am.* is never overwritten");
  assert.equal(store.get("am.sidebar.collapsed"), false, "false is a value, carried");
  assert.ok(store.has("space.colors"), "the old key stays for one release");
  assert.deepEqual(carryShared(shared, setShared), [], "the second load copies nothing");
});

test("each mod's own shim maps its keys exactly as SHARED_RENAMES does", () => {
  const stubs = {
    "sidebar-chrome": new URL("./footer-herdr.mjs", import.meta.url).href,
    "md-menu": new URL("./md-menu-herdr.mjs", import.meta.url).href,
  };
  const gpui = new URL("./gpui-stub.mjs", import.meta.url).href;
  registerHooks({
    resolve: (specifier, context, next) => {
      const mod = Object.keys(stubs).find((m) => context.parentURL?.includes(`/mods/${m}/`));
      if (mod && specifier === "herdr") return { url: stubs[mod], shortCircuit: true };
      if (mod && specifier.startsWith("gpui-")) return { url: gpui, shortCircuit: true };
      return next(specifier, context);
    },
  });
  return Promise.all([import("../mods/sidebar-chrome/main.js"), import("../mods/md-menu/main.js")]).then(([footer, markdown]) => {
    for (const shim of [footer.SHARED_OLD, markdown.SHARED_OLD]) {
      for (const [old, now] of Object.entries(shim)) assert.equal(SHARED_RENAMES[old], now, old);
    }
    const manager = read(join(ROOT, "mods", "mod-manager", "main.js"));
    assert.match(manager, /const RECORDS = "am\.mods\.installed";/);
    assert.equal(SHARED_RENAMES["mod-manager.installed"], "am.mods.installed");
    assert.match(manager, /"mod-manager\.installed": RECORDS/);
  });
});

test("references follow ownership: only an old folder that is gone, with its successor installed and recorded", () => {
  const owned = new Set(["am-sidebar", "am-markdown", "mod-manager"]);
  const here = new Set(["am-sidebar", "am-markdown", "mod-manager", "sidebar-chrome"]);
  const { active, kept } = activeRenames(owned, (n) => here.has(n));
  assert.deepEqual(active, { "spaces-agents": "am-sidebar", "md-menu": "am-markdown", "space-icon": "am-sidebar", "markdown-browser": "am-markdown" });
  assert.deepEqual(kept.sort(), ["mod-manager", "sidebar-chrome"]);
  assert.equal(renameAction("spaces-agents.paste", active), "am-sidebar.paste");
  assert.equal(renameAction("markdown-browser.open", active), "am-markdown.open");
  assert.equal(renameAction("markdown-browser.reload", active), null, "an absorbed mod's other commands have no new name");
  assert.equal(renameAction("mod.open:space-icon", active), null, "an absorbed mod is not opened as its new home");
  assert.equal(renameAction("mod.open:mod-manager", active), null, "the person kept mod-manager");
  assert.equal(renameAction("mod.open:pocket-link", active), null);
  assert.equal(renameAction("space.new", active), null);
  // Before the folders are renamed (this release): markdown-browser.open already reaches md-menu.
  const now = activeRenames(new Set(["spaces-agents", "md-menu"]), (n) => ["spaces-agents", "md-menu"].includes(n)).active;
  assert.deepEqual(now, { "space-icon": "spaces-agents", "markdown-browser": "md-menu" });
  assert.equal(renameAction("markdown-browser.open", now), KEY_RENAMES["markdown-browser.open"]);
  assert.equal(ABSORBED["space-icon"], "spaces-agents");
});

test("rewriteLayout and rewriteKeys refuse shapes they don't know, and never take a key the person bound", () => {
  const active = { "spaces-agents": "am-sidebar", "markdown-browser": "am-markdown" };
  assert.equal(rewriteLayout([1, 2], active), null);
  assert.equal(rewriteLayout({ children: { a: 1 } }, active), null);
  assert.equal(rewriteKeys({ global: "cmd-v" }, active), null);
  const r = rewriteKeys({ "mod:markdown-browser": { "cmd-o": "markdown-browser.open", "cmd-r": "pane.reload" }, "mod:am-markdown": { "cmd-r": "mine" } }, active);
  assert.deepEqual(r.keys, { "mod:markdown-browser": { "cmd-r": "pane.reload" }, "mod:am-markdown": { "cmd-r": "mine", "cmd-o": "am-markdown.open" } });
  assert.deepEqual(r.left, [{ mod: "markdown-browser", ref: "mod:markdown-browser cmd-r" }]);
});

// ---- on scratch app homes ----

/** A scratch root: an app home, a bin with a fake herdr-app (logs, passes), never the real ones. */
function scratch(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "am-migrate-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "app"), mods = join(home, "mods"), state = join(home, "automagik-herdr"), bin = join(root, "bin");
  mkdirSync(mods, { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(bin, "herdr-app"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(bin, "herdr-app"), 0o755);
  const env = { HOME: join(root, "home"), PATH: `${bin}:/usr/bin:/bin`, AUTOMAGIK_HERDR_NO_UPDATE: "1" };
  /** `node update.mjs <args> --mods <mods>`: its JSON line, exit code and log. */
  const cli = (...args) => {
    const r = spawnSync(process.execPath, [UPDATE, ...args, "--mods", mods], { env, encoding: "utf8" });
    return { code: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout.trim().split("\n").at(-1)) : null, log: r.stderr };
  };
  return { root, home, mods, state, cli };
}

/** A folder with main.js, mod.json and `files` (path → text). */
function modFolder(dir, files = {}) {
  write(join(dir, "main.js"), "export default 1;\n");
  write(join(dir, "mod.json"), '{ "place": "none" }\n');
  for (const [path, text] of Object.entries(files)) write(join(dir, path), text);
}

/** An am-* pack tarball at `version` (am-sidebar carries VERSION, release.js and the updater). */
function amPack(root, version, mods = ["am-footer", "am-markdown", "am-mods", "am-sidebar"]) {
  const tree = join(root, `pack-${version}`);
  for (const m of mods) modFolder(join(tree, m), { "release.txt": `${version}\n` });
  write(join(tree, "am-sidebar", "VERSION"), `${version}\n`);
  write(join(tree, "am-sidebar", "release.js"), `export const PACK_MODS = ${JSON.stringify(mods)};\n`);
  write(join(tree, "am-sidebar", "update.mjs"), "// the pack's updater\n");
  writeJson(join(tree, "layouts", "automagik.json"), { id: "root", type: "row", children: [{ id: "spaces", type: "block", content: { mod: "am-sidebar" } }] });
  const out = join(root, `automagik-herdr-pack-${version}.tgz`);
  execFileSync("tar", ["-czf", out, "-C", tree, ...readdirSync(tree)], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  return out;
}

const MAIN_AGENTS = {
  id: "root", type: "row", terminal_menu: "md-menu",
  children: [
    { id: "sidebar", type: "column", children: [
      { id: "brand", type: "block", content: { mod: "sidebar-chrome" } },
      { id: "spaces", type: "block", content: { mod: "spaces-agents" } },
      { id: "phone", type: "block", content: { mod: "pocket-link" } },
    ] },
    { id: "main", type: "block", content: { mod: "terminal" } },
  ],
};
const KEYS = {
  global: {
    "cmd-v": "spaces-agents.paste", "ctrl-v": "spaces-agents.paste_image", "cmd-w": "spaces-agents.close_pane",
    "cmd-shift-m": "mod.open:mod-manager", "cmd-shift-p": "mod.open:pocket-link", "cmd-shift-a": "mod.open:machine-add",
    "cmd-t": "tab.new",
  },
  "mod:markdown-browser": { "cmd-o": "markdown-browser.open" },
};
const SHARED = { "spaces-agents.icons": { s1: { kind: "emoji", char: "*" } }, "space.colors": { s1: "ansi3" }, "sidebar.collapsed": true };

/**
 * The owner-shaped home: v0.2.0's spaces-agents (v1 record, its .state), hand-installed
 * sidebar-chrome, md-menu, mod-manager, markdown-browser and space-icon, Pocket Link, an edited
 * main-agents layout, a layout it can't read, the paste bindings, shared keys, the CLI's project
 * list and a catalog URL of the person's own.
 */
function ownerHome(s) {
  modFolder(join(s.mods, "spaces-agents"), { VERSION: "0.2.0\n", ".state/bots.txt": "kept\n" });
  modFolder(join(s.mods, "sidebar-chrome"), { ".state/rail.txt": "rail\n" });
  for (const m of ["md-menu", "mod-manager", "markdown-browser", "space-icon"]) modFolder(join(s.mods, m));
  modFolder(join(s.mods, "pocket-link"), { ".state/pairing.key": "secret\n", "bin/run": "#!/bin/sh\n" });
  write(join(s.state, "installed-by-install.sh"), "version=0.2.0\nlayout=added\nbefore=none\n");
  writeJson(join(s.home, "layouts", "main-agents.json"), MAIN_AGENTS);
  write(join(s.home, "layouts", "scratch.json"), "{ not json\n");
  writeJson(join(s.home, "keys.json"), KEYS);
  writeJson(join(s.home, "shared.json"), SHARED);
  writeJson(join(s.home, "spaces-agents-projects.json"), ["/p/one"]);
  writeJson(join(s.home, "data", "mod-manager", "catalog.json"), { url: "file:///catalogs/mine.json" });
}

test("owner-shaped home, --adopt: folders, layouts, keys and paths move to the am-* names; a second run does nothing", (t) => {
  const s = scratch(t);
  ownerHome(s);
  const pocket = treeSum(join(s.mods, "pocket-link"));
  const shared = read(join(s.home, "shared.json"));
  const unreadable = read(join(s.home, "layouts", "scratch.json"));
  const pack = amPack(s.root, "0.3.0");

  const r = s.cli("install", "--from", pack, "--version", "0.3.0", "--adopt", "--setup");
  assert.equal(r.code, 0, r.log);
  // Folders: the record's spaces-agents became am-sidebar with its state; the person's were adopted.
  assert.deepEqual(readdirSync(s.mods).sort(), ["am-footer", "am-markdown", "am-mods", "am-sidebar", "pocket-link"]);
  assert.equal(read(join(s.mods, "am-sidebar", ".state", "bots.txt")), "kept\n");
  assert.equal(read(join(s.mods, "am-footer", ".state", "rail.txt")), "rail\n");
  assert.ok(existsSync(join(s.state, ".prev", "spaces-agents", ".state", "bots.txt")), "the replaced pack is kept in .prev");
  for (const m of ["sidebar-chrome", "md-menu", "mod-manager", "markdown-browser", "space-icon"]) {
    assert.ok(existsSync(join(s.state, "backup", `${m}-${today()}`, "main.js")), `${m} adopted into backup/`);
  }
  const record = parseMarker(read(join(s.state, "installed-by-install.sh")));
  assert.deepEqual(record.mods, ["am-footer", "am-markdown", "am-mods", "am-sidebar"]);
  assert.deepEqual(record.migrated, [`backup/layouts-${today()}`]);
  // Keys: Cmd+V and the rest name am-sidebar; the markdown-browser section is am-markdown's.
  const keys = readJson(join(s.home, "keys.json"));
  assert.equal(keys.global["cmd-v"], "am-sidebar.paste");
  assert.equal(keys.global["ctrl-v"], "am-sidebar.paste_image");
  assert.equal(keys.global["cmd-w"], "am-sidebar.close_pane");
  assert.equal(keys.global["cmd-shift-m"], "mod.open:am-mods");
  assert.equal(keys.global["cmd-shift-p"], "mod.open:pocket-link");
  assert.equal(keys.global["cmd-shift-a"], "mod.open:machine-add");
  assert.deepEqual(keys["mod:am-markdown"], { "cmd-o": "am-markdown.open" });
  assert.equal(keys["mod:markdown-browser"], undefined);
  // Layouts: main-agents names am-sidebar, am-footer and am-markdown, and its backup is the original.
  const backup = join(s.state, "backup", `layouts-${today()}`);
  const layout = readJson(join(s.home, "layouts", "main-agents.json"));
  assert.equal(layout.terminal_menu, "am-markdown");
  assert.deepEqual(layout.children[0].children.map((c) => c.content.mod), ["am-footer", "am-sidebar", "pocket-link"]);
  assert.deepEqual(readJson(join(backup, "layouts", "main-agents.json")), MAIN_AGENTS);
  assert.deepEqual(readJson(join(backup, "keys.json")), KEYS);
  assert.ok(existsSync(join(backup, "journal.json")));
  assert.equal(read(join(s.home, "layouts", "scratch.json")), unreadable, "an unreadable layout is left as it is");
  assert.match(r.log, /scratch\.json \(not a layout this migration recognises/);
  // Paths are copied; the person's catalog URL stays theirs; shared.json and Pocket Link are untouched.
  assert.deepEqual(readJson(join(s.home, "am-sidebar-projects.json")), ["/p/one"]);
  assert.ok(existsSync(join(s.home, "spaces-agents-projects.json")));
  assert.deepEqual(readJson(join(s.home, "data", "am-mods", "catalog.json")), { url: "file:///catalogs/mine.json" });
  assert.deepEqual(readJson(join(s.home, "data", "mod-manager", "catalog.json")), { url: "file:///catalogs/mine.json" });
  assert.match(r.log, /kept your mod manager catalog \(file:\/\/\/catalogs\/mine\.json\)/);
  assert.equal(read(join(s.home, "shared.json")), shared);
  assert.match(r.log, /shared keys move to am\.\* when their mod next loads: spaces-agents\.icons, space\.colors, sidebar\.collapsed/);
  assert.equal(treeSum(join(s.mods, "pocket-link")), pocket);

  // The second run: nothing to do, nothing written.
  const before = { keys: read(join(s.home, "keys.json")), layout: read(join(s.home, "layouts", "main-agents.json")) };
  assert.equal(pending(plan(s.home)), false);
  const again = s.cli("install", "--from", pack, "--version", "0.3.0", "--setup");
  assert.equal(again.code, 0, again.log);
  assert.deepEqual(again.out.installed.migration.done, []);
  assert.equal(again.out.installed.migration.journal, null);
  assert.deepEqual(readdirSync(join(s.state, "backup")).filter((n) => n.startsWith("layouts-")), [`layouts-${today()}`]);
  assert.deepEqual({ keys: read(join(s.home, "keys.json")), layout: read(join(s.home, "layouts", "main-agents.json")) }, before);
  assert.equal(treeSum(join(s.mods, "pocket-link")), pocket);
});

test("migrate, then rollback: v0.2.0's folders, Cmd+V and main-agents come back; edits made since are kept", (t) => {
  const s = scratch(t);
  ownerHome(s);
  const pocket = treeSum(join(s.mods, "pocket-link"));
  const pack = amPack(s.root, "0.3.0");
  assert.equal(s.cli("install", "--from", pack, "--version", "0.3.0", "--adopt", "--setup").code, 0);
  // Made under v0.3.0: a new binding to am-sidebar, a new state file and a layout block of its own.
  const keys = readJson(join(s.home, "keys.json"));
  keys.global["cmd-j"] = "am-sidebar.paste";
  writeJson(join(s.home, "keys.json"), keys);
  write(join(s.mods, "am-sidebar", ".state", "later.txt"), "later\n");
  const layout = readJson(join(s.home, "layouts", "main-agents.json"));
  layout.children.unshift({ id: "extra", type: "block", content: { mod: "am-sidebar" } });
  writeJson(join(s.home, "layouts", "main-agents.json"), layout);

  const r = s.cli("rollback");
  assert.equal(r.code, 0, r.log);
  // The folders: spaces-agents with its state (and what was written since); the adopted ones back.
  assert.deepEqual(readdirSync(s.mods).sort(), ["markdown-browser", "md-menu", "mod-manager", "pocket-link", "sidebar-chrome", "space-icon", "spaces-agents"]);
  assert.equal(read(join(s.mods, "spaces-agents", ".state", "later.txt")), "later\n");
  assert.equal(read(join(s.mods, "spaces-agents", "VERSION")), "0.2.0\n");
  assert.equal(read(join(s.mods, "sidebar-chrome", ".state", "rail.txt")), "rail\n");
  assert.ok(existsSync(join(s.state, ".prev", "am-sidebar")), "the am-* set is kept for a roll forward");
  const record = parseMarker(read(join(s.state, "installed-by-install.sh")));
  assert.deepEqual(record.mods, ["spaces-agents"]);
  assert.deepEqual([record.adopted, record.migrated], [[], []]);
  // The journal's edits are undone; the binding and the block added since stay as the person made them.
  const back = readJson(join(s.home, "keys.json"));
  assert.deepEqual({ ...back.global }, { ...KEYS.global, "cmd-j": "am-sidebar.paste" });
  assert.deepEqual(back["mod:markdown-browser"], KEYS["mod:markdown-browser"]);
  assert.equal(back["mod:am-markdown"], undefined);
  const restored = readJson(join(s.home, "layouts", "main-agents.json"));
  assert.equal(restored.terminal_menu, "md-menu");
  assert.equal(restored.children[0].content.mod, "am-sidebar", "a block added since is the person's");
  assert.deepEqual(restored.children[1].children.map((c) => c.content.mod), ["sidebar-chrome", "spaces-agents", "pocket-link"]);
  assert.ok(existsSync(join(s.state, "backup", `layouts-${today()}`, "journal.reverted.json")));
  assert.equal(treeSum(join(s.mods, "pocket-link")), pocket);
});

test("v0.2.0 home without --adopt: the person's mods and every reference to them stay; only the record's move", (t) => {
  const s = scratch(t);
  ownerHome(s);
  const pocket = treeSum(join(s.mods, "pocket-link"));
  const kept = ["sidebar-chrome", "md-menu", "mod-manager", "markdown-browser", "space-icon"];
  const sums = kept.map((m) => treeSum(join(s.mods, m)));
  const r = s.cli("install", "--from", amPack(s.root, "0.3.0"), "--version", "0.3.0", "--setup");
  assert.equal(r.code, 0, r.log);
  assert.deepEqual(readdirSync(s.mods).sort(),
    ["am-footer", "am-markdown", "am-mods", "am-sidebar", "markdown-browser", "md-menu", "mod-manager", "pocket-link", "sidebar-chrome", "space-icon"]);
  const keys = readJson(join(s.home, "keys.json"));
  assert.equal(keys.global["cmd-v"], "am-sidebar.paste", "spaces-agents was the record's");
  assert.equal(keys.global["cmd-shift-m"], "mod.open:mod-manager", "an unadopted mod-manager keeps its binding");
  assert.deepEqual(keys["mod:markdown-browser"], KEYS["mod:markdown-browser"]);
  const layout = readJson(join(s.home, "layouts", "main-agents.json"));
  assert.deepEqual(layout.children[0].children.map((c) => c.content.mod), ["sidebar-chrome", "am-sidebar", "pocket-link"]);
  assert.equal(layout.terminal_menu, "md-menu");
  assert.match(r.log, /left: .*keys\.json: mod\.open:mod-manager \(mods\/mod-manager is not the pack's \(--adopt takes it\)\)/);
  assert.match(r.log, /left alone: mods\/sidebar-chrome/);
  assert.equal(existsSync(join(s.home, "data", "am-mods")), false, "data/ follows am-mods only when mod-manager was the pack's");
  assert.match(r.log, /left alone: mods\/space-icon \(not installed by automagik-herdr; the pack's sidebar or Markdown mod/);
  assert.equal(treeSum(join(s.mods, "pocket-link")), pocket);
  assert.deepEqual(kept.map((m) => treeSum(join(s.mods, m))), sums, "every folder the person kept is byte-identical");
});

test("apply journals before it writes; revert undoes only what still holds the migration's value, once", (t) => {
  const s = scratch(t);
  modFolder(join(s.mods, "am-sidebar"));
  write(join(s.state, "installed-by-install.sh"), "version=0.3.0\nmods=am-sidebar\nbefore=none\n");
  writeJson(join(s.home, "keys.json"), { global: { "cmd-v": "spaces-agents.paste", "cmd-x": "spaces-agents.close_pane" } });
  const p = plan(s.home);
  assert.deepEqual(p.keys, [["global cmd-v: spaces-agents.paste", "global cmd-v: am-sidebar.paste"], ["global cmd-x: spaces-agents.close_pane", "global cmd-x: am-sidebar.close_pane"]]);
  const backupDir = join(s.state, "backup", "layouts-x");
  const r = apply(p, { backupDir });
  assert.equal(r.journal, backupDir);
  writeJson(join(s.home, "keys.json"), { global: { "cmd-v": "am-sidebar.paste", "cmd-x": "pane.close" } });
  const back = revert(backupDir);
  assert.deepEqual(back.restored, [join(s.home, "keys.json")]);
  assert.deepEqual(readJson(join(s.home, "keys.json")), { global: { "cmd-v": "spaces-agents.paste", "cmd-x": "pane.close" } });
  assert.match(back.skipped[0].reason, /no longer am-sidebar\.close_pane/);
  assert.deepEqual(revert(backupDir), { restored: [], skipped: [] }, "a reverted journal is not applied twice");
});

test("before the folder rename (this release's old-named pack), markdown-browser.open already reaches md-menu", (t) => {
  const s = scratch(t);
  for (const m of ["spaces-agents", "md-menu"]) modFolder(join(s.mods, m));
  write(join(s.state, "installed-by-install.sh"), "version=0.3.0\nmods=md-menu,spaces-agents\nbefore=none\n");
  writeJson(join(s.home, "keys.json"), KEYS);
  writeJson(join(s.home, "layouts", "main-agents.json"), MAIN_AGENTS);
  const p = plan(s.home);
  assert.equal(p.layouts.length, 0);
  assert.deepEqual(p.keys, [["mod:markdown-browser cmd-o: markdown-browser.open", "mod:md-menu cmd-o: md-menu.open"]]);
  assert.deepEqual(p.left.filter((l) => !/mod-manager|sidebar-chrome/.test(l.item)), [], "the pack's own old-named folders are not reported");
});

test("space-icon and markdown-browser the record lists leave with the kept set, never deleted; a person's own stays", (t) => {
  const s = scratch(t);
  modFolder(join(s.mods, "spaces-agents"), { VERSION: "0.3.0\n" });
  modFolder(join(s.mods, "space-icon"), { ".state/icons.txt": "icons\n" });
  modFolder(join(s.mods, "markdown-browser"));
  write(join(s.state, "installed-by-install.sh"), "version=0.3.0\nmods=markdown-browser,space-icon,spaces-agents\nbefore=none\n");
  const r = s.cli("install", "--from", amPack(s.root, "0.3.1"), "--version", "0.3.1");
  assert.equal(r.code, 0, r.log);
  assert.deepEqual(r.out.installed.retired.sort(), ["markdown-browser", "space-icon", "spaces-agents"]);
  assert.deepEqual(r.out.installed.renamed, [["spaces-agents", "am-sidebar"]]);
  assert.equal(read(join(s.state, ".prev", "space-icon", ".state", "icons.txt")), "icons\n");
  assert.ok(existsSync(join(s.state, ".prev", "markdown-browser", "main.js")));
  assert.equal(existsSync(join(s.mods, "space-icon")), false);

  // Not the record's: left without --adopt, reported.
  const o = scratch(t);
  modFolder(join(o.mods, "spaces-agents"));
  modFolder(join(o.mods, "space-icon"));
  write(join(o.state, "installed-by-install.sh"), "version=0.3.0\nmods=spaces-agents\nbefore=none\n");
  const left = o.cli("install", "--from", amPack(o.root, "0.3.1"), "--version", "0.3.1");
  assert.equal(left.code, 0, left.log);
  assert.deepEqual(left.out.installed.left, ["space-icon"]);
  assert.ok(existsSync(join(o.mods, "space-icon", "main.js")));
});

test("a rollback between two am-* releases reverts nothing and writes no new backup", (t) => {
  const s = scratch(t);
  ownerHome(s);
  assert.equal(s.cli("install", "--from", amPack(s.root, "0.3.0"), "--version", "0.3.0", "--adopt", "--setup").code, 0);
  assert.equal(s.cli("install", "--from", amPack(s.root, "0.3.1"), "--version", "0.3.1", "--setup").code, 0);
  const keys = read(join(s.home, "keys.json"));
  const r = s.cli("rollback");
  assert.equal(r.code, 0, r.log);
  assert.deepEqual(r.out.reverted, []);
  assert.equal(read(join(s.home, "keys.json")), keys);
  assert.deepEqual(parseMarker(read(join(s.state, "installed-by-install.sh"))).migrated, [`backup/layouts-${today()}`]);
  assert.deepEqual(readdirSync(join(s.state, "backup")).filter((n) => n.startsWith("layouts-")), [`layouts-${today()}`]);
  assert.equal(read(join(s.mods, "am-sidebar", "release.txt")), "0.3.0\n");
});
