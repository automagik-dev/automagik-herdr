// The Automagik theme, switched on once (DESIGN Decision 12, Group 5): on the sidebar's load,
// the pack's themes/automagik-light.json and automagik-dark.json are copied into the app home's
// themes/ when absent (Settings lists them from there), and the first time both are there and
// Herdr knows them, `app.theme` selects each half: the light one for light mode, the dark one
// for dark mode, in the layout shown then. That is recorded in shared (persisted), so the
// themes are never selected again and a theme the person picks later survives every restart.
// An edited theme file in the app home is never overwritten. Apache-2.0.

import { appHome, readTextFile, run, shared, setShared, themes } from "herdr";
import * as fs from "fs/promises";

/** The two themes, by name (the file is `<name>.json`). */
export const THEME_NAMES = Object.freeze(["automagik-light", "automagik-dark"]);
/** The shared value recording that the themes were selected once. */
export const THEME_KEY = "spaces-agents.theme-selected";

/**
 * What to do now, over plain data: `done` (shared THEME_KEY), `present` (names whose file is in
 * the app home's themes/ now) and `known` (names Herdr's themes() lists). Copy the absent ones;
 * select both only when not done and both are present and known (a theme Herdr hasn't read yet
 * waits for the next load, unrecorded).
 */
export function themeSteps({ done = false, present = [], known = [] } = {}) {
  const copy = THEME_NAMES.filter((n) => !present.includes(n));
  const select = !done && copy.length === 0 && THEME_NAMES.every((n) => known.includes(n));
  return { copy, select };
}

/** Whether the themes were selected once already (nothing more to do but keep files present). */
export const themeSettled = () => shared(THEME_KEY) === true;

/**
 * Runs the steps: copies, then selects and records. Never throws; resolves
 * `{ copied, selected, why }` (why: the first failure, or null).
 */
export async function ensureTheme() {
  const home = appHome();
  const target = (n) => `${home}/themes/${n}.json`;
  const copied = [];
  let why = null;
  const present = [];
  for (const n of THEME_NAMES) {
    try { if ((await readTextFile(target(n))) !== null) present.push(n); } catch (e) { why ??= e; }
  }
  const first = themeSteps({ done: shared(THEME_KEY) === true, present });
  if (first.copy.length) {
    try {
      await fs.mkdir(`${home}/themes`, { recursive: true });
      for (const n of first.copy) {
        const text = await readTextFile(`${home}/mods/spaces-agents/themes/${n}.json`);
        if (text === null) throw new Error(`the pack has no themes/${n}.json`);
        await fs.writeFile(target(n), text);
        copied.push(n);
        present.push(n);
      }
    } catch (e) { why ??= e; }
  }
  let known = [];
  try { known = (themes() ?? []).map((t) => t?.name); } catch (e) { why ??= e; }
  const { select } = themeSteps({ done: shared(THEME_KEY) === true, present, known });
  if (!select) return { copied, selected: false, why: why ? String(why?.message ?? why) : null };
  try {
    for (const n of THEME_NAMES) run("app.theme", { name: n });
    setShared(THEME_KEY, true);
  } catch (e) { return { copied, selected: false, why: String(e?.message ?? e) }; }
  return { copied, selected: true, why: null };
}
