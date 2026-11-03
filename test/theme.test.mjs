// The Automagik theme (Group 5, DESIGN Decision 12): the two theme files as scripts/themes.mjs
// builds them from Automagik's look, legible terminal colours, theme.js copying them into the
// app home and selecting them once only, and the update swap carrying themes/ along.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { state } from "./use-stubs.mjs";
import { CONTRAST, DIM, buildThemes, contrast, themeText, THEMES_DIR, ROOT } from "../scripts/themes.mjs";
const { THEME_KEY, THEME_NAMES, ensureTheme, themeSettled, themeSteps } = await import("../mods/am-sidebar/theme.js");
const { applyUpdate } = await import("../mods/am-sidebar/update.mjs");

const PACK = join(ROOT, "mods/am-sidebar");
const HEX = /^#[0-9a-f]{6}$/;

test("the committed theme files are what scripts/themes.mjs builds, in Herdr's theme shape", () => {
  for (const [name, t] of Object.entries(buildThemes())) {
    const text = readFileSync(join(THEMES_DIR, name), "utf8");
    assert.equal(text, themeText(t), `${name}: run node scripts/themes.mjs`);
    const file = JSON.parse(text);
    for (const k of ["background", "foreground", "selection", "cursor"]) assert.match(file[k], HEX, `${name} ${k}`);
    assert.equal(file.ansi.length, 16);
    for (const c of [...file.ansi, ...Object.values(file.colors)]) assert.match(c, HEX);
  }
  assert.deepEqual(THEME_NAMES.map((n) => `${n}.json`), Object.keys(buildThemes()));
});

test("the theme colours read: text, terminal colours and the accent button", () => {
  for (const [name, t] of Object.entries(buildThemes())) {
    assert.ok(contrast(t.foreground, t.background) >= 7, `${name} foreground`);
    t.ansi.forEach((c, i) => {
      if ([0, 7, 15].includes(i)) return; // black, white, bright white: as Automagik names them
      assert.ok(contrast(c, t.background) >= (i === 8 ? DIM : CONTRAST), `${name} ansi${i} ${c}`);
    });
    assert.ok(contrast(t.colors.accent_foreground, t.colors.accent) >= CONTRAST, `${name} accent`);
  }
  // Light is light and dark is dark, so app.theme sets the right half of each.
  const { "automagik-light.json": light, "automagik-dark.json": dark } = buildThemes();
  assert.ok(contrast(light.background, "#000000") > contrast(light.background, "#ffffff"));
  assert.ok(contrast(dark.background, "#ffffff") > contrast(dark.background, "#000000"));
});

test("themeSteps: copy the absent ones; select once, only when both are there and Herdr knows them", () => {
  assert.deepEqual(themeSteps({}), { copy: [...THEME_NAMES], select: false });
  assert.deepEqual(themeSteps({ present: THEME_NAMES, known: [] }), { copy: [], select: false });
  assert.deepEqual(themeSteps({ present: THEME_NAMES, known: ["paper", ...THEME_NAMES] }), { copy: [], select: true });
  assert.deepEqual(themeSteps({ done: true, present: THEME_NAMES, known: THEME_NAMES }), { copy: [], select: false });
  assert.deepEqual(themeSteps({ done: true, present: ["automagik-dark"], known: THEME_NAMES }), { copy: ["automagik-light"], select: false });
});

function home(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "automagik-herdr-theme-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "mods/am-sidebar"), { recursive: true });
  cpSync(THEMES_DIR, join(root, "mods/am-sidebar/themes"), { recursive: true });
  Object.assign(state, { appHome: root, shared: new Map(), runs: [], themeList: [], calls: [], readFault: null, runFault: null, beforeWrite: null });
  return root;
}

test("ensureTheme: copies the themes, selects both halves once, and never again", async (t) => {
  const root = home(t);
  // Herdr hasn't read the new files yet: copied, not selected, not recorded.
  let r = await ensureTheme();
  assert.deepEqual(r, { copied: [...THEME_NAMES], selected: false, why: null });
  for (const n of THEME_NAMES) assert.equal(readFileSync(join(root, "themes", `${n}.json`), "utf8"), readFileSync(join(THEMES_DIR, `${n}.json`), "utf8"));
  assert.deepEqual(state.runs, []);
  assert.equal(themeSettled(), false);
  // It lists them now (the next timer tick, or the next start): both halves selected, recorded.
  state.themeList = [{ name: "paper" }, { name: "graphite" }, { name: "automagik-light" }, { name: "automagik-dark" }];
  r = await ensureTheme();
  assert.deepEqual(r, { copied: [], selected: true, why: null });
  assert.deepEqual(state.runs, [["app.theme", { name: "automagik-light" }], ["app.theme", { name: "automagik-dark" }]]);
  assert.equal(state.shared.get(THEME_KEY), true);
  // The person picks another theme; a restart (shared is persisted) selects nothing.
  state.runs = [];
  r = await ensureTheme();
  assert.deepEqual(r, { copied: [], selected: false, why: null });
  assert.deepEqual(state.runs, []);
});

test("ensureTheme: an edited theme file in the app home is kept; a missing pack file is reported, nothing selected", async (t) => {
  const root = home(t);
  mkdirSync(join(root, "themes"));
  writeFileSync(join(root, "themes/automagik-dark.json"), "{ \"edited\": true }\n");
  state.themeList = THEME_NAMES.map((name) => ({ name }));
  const r = await ensureTheme();
  assert.deepEqual(r.copied, ["automagik-light"]);
  assert.equal(readFileSync(join(root, "themes/automagik-dark.json"), "utf8"), "{ \"edited\": true }\n");
  const bare = home(t);
  rmSync(join(bare, "mods/am-sidebar/themes"), { recursive: true });
  state.themeList = THEME_NAMES.map((name) => ({ name }));
  const missing = await ensureTheme();
  assert.equal(missing.selected, false);
  assert.match(missing.why, /the pack has no themes\/automagik-light\.json/);
  assert.equal(state.shared.get(THEME_KEY), undefined);
});

test("ensureTheme: a theme file that can't be read is there, never replaced", async (t) => {
  const root = home(t);
  mkdirSync(join(root, "themes"));
  const dark = join(root, "themes/automagik-dark.json");
  writeFileSync(dark, "{ \"edited\": true }\n");
  // Herdr caps reads at 1 MiB; a permission or encoding error throws the same way.
  state.readFault = (path) => (path === dark ? new Error("file is larger than 1 MiB") : null);
  state.themeList = THEME_NAMES.map((name) => ({ name }));
  const r = await ensureTheme();
  assert.deepEqual(r, { copied: ["automagik-light"], selected: true, why: null });
  assert.equal(readFileSync(dark, "utf8"), "{ \"edited\": true }\n");
  assert.ok(!state.calls.some((c) => c.kind === "write" && c.path === dark), "no write was tried");
  // Every write that was tried creates only (expected null: no file there).
  assert.ok(state.calls.filter((c) => c.kind === "write").every((c) => c.expected === null));
});

test("ensureTheme: a file that appears between the read and the write is kept, counted as there", async (t) => {
  const root = home(t);
  const light = join(root, "themes/automagik-light.json");
  state.beforeWrite = async (path) => {
    if (path === light) { mkdirSync(join(root, "themes"), { recursive: true }); writeFileSync(light, "{ \"raced\": true }\n"); }
  };
  const r = await ensureTheme();
  assert.deepEqual(r, { copied: ["automagik-dark"], selected: false, why: null });
  assert.equal(readFileSync(light, "utf8"), "{ \"raced\": true }\n");
});

test("ensureTheme: recorded before selecting, so a selection that throws is never tried again", async (t) => {
  home(t);
  state.themeList = THEME_NAMES.map((name) => ({ name }));
  state.runFault = (name, args) => (args?.name === "automagik-dark" ? new Error("no such theme") : null);
  const r = await ensureTheme();
  assert.deepEqual(r, { copied: [...THEME_NAMES], selected: false, why: "no such theme" });
  assert.equal(state.shared.get(THEME_KEY), true);
  state.runs = [];
  state.runFault = null;
  assert.deepEqual(await ensureTheme(), { copied: [], selected: false, why: null });
  assert.deepEqual(state.runs, []);
});

test("an update carries themes/ (the release packs the whole folder; nothing is export-ignored)", async (t) => {
  for (const n of THEME_NAMES) {
    const attr = execFileSync("git", ["check-attr", "export-ignore", "--", `mods/am-sidebar/themes/${n}.json`], { cwd: ROOT, encoding: "utf8" });
    assert.match(attr, /export-ignore: unspecified/);
  }
  const root = realpathSync(mkdtempSync(join(tmpdir(), "automagik-herdr-carry-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { PACK_MODS } = await import("../mods/am-sidebar/release.js");
  for (const m of PACK_MODS) cpSync(join(ROOT, "mods", m), join(root, "src", m), { recursive: true });
  writeFileSync(join(root, "src/am-sidebar/VERSION"), "9.9.9\n");
  const tgz = join(root, "pack.tgz");
  execFileSync("tar", ["czf", tgz, "-C", join(root, "src"), ...PACK_MODS], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  const mods = join(root, "mods");
  await applyUpdate({ tgzPath: tgz, version: "9.9.9", modsDir: mods });
  for (const n of THEME_NAMES) assert.ok(existsSync(join(mods, "am-sidebar/themes", `${n}.json`)), n);
});
