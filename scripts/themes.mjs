#!/usr/bin/env node
// Builds Herdr's two Automagik themes, mods/am-sidebar/themes/automagik-{light,dark}.json
// (DESIGN Decision 12, Group 5), from Automagik's own look. Run it after changing the inputs:
//   node scripts/themes.mjs          writes both files
//   node scripts/themes.mjs check    exits 1 when a committed file differs from what this builds
//
// Taken from github.com/automagik-dev/automagik at 0429687 (apps/bots-dsh/src/client):
// - stage.js STAGE_LIGHT / STAGE_DARK: bg → background, text → foreground, accent → accent and
//   cursor, sidebar → chrome, card → surface; its TOKENS `::selection` colour (--st-lilac) →
//   selection.
// - inks.js INKS (the named colours, [light ink, dark ink]): the 16 terminal colours. Each named
//   colour is darkened (light theme) or lightened (dark theme) toward the foreground's side, in
//   small steps, only until it reads at CONTRAST:1 on the background, so terminal text stays
//   legible; bright black (8) needs DIM:1, and black, white and bright white are taken as they
//   are.
// Apache-2.0.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const THEMES_DIR = join(ROOT, "mods/am-sidebar/themes");

export const STAGE_LIGHT = Object.freeze({ bg: "#f6eee2", sidebar: "#fbf6ee", card: "#fffdf9", text: "#3c3049", accent: "#007087", lilac: "#e6dcf6" });
export const STAGE_DARK = Object.freeze({ bg: "#1e1923", sidebar: "#262029", card: "#2b2431", text: "#f3e9dd", accent: "#7fd8ea", lilac: "#4a3d61" });
export const INKS = Object.freeze({
  charcoal: ["#141416", "#F1F2F4"], graphite: ["#2D2D2D", "#D6D6DA"], rose: ["#EC2F6B", "#FF5A7A"],
  sky: ["#0AA8D6", "#2EE6E0"], tangerine: ["#FF6900", "#FF8A2E"], cobalt: ["#082DFF", "#5C78FF"],
  red: ["#FF3E51", "#E02135"], green: ["#00C972", "#009957"], yellow: ["#FFAF38", "#FF9800"],
  cyan: ["#1CC3B0", "#00A592"], blue: ["#2A92FE", "#0E74E0"], violet: ["#A97EFE", "#804EE0"],
  magenta: ["#FF5EB1", "#E02A88"], gray: ["#959595", "#777777"],
});
export const CONTRAST = 4.5;
export const DIM = 3;

// The terminal colours by slot: [named colour, which ink, minimum contrast or null (as is)].
// Light ink on the light theme, dark ink on the dark one, except where a slot names its own.
const SLOTS = {
  light: [
    ["charcoal", 0, null], ["red", 0, CONTRAST], ["green", 0, CONTRAST], ["yellow", 0, CONTRAST],
    ["blue", 0, CONTRAST], ["magenta", 0, CONTRAST], ["cyan", 0, CONTRAST], ["gray", 1, CONTRAST],
    ["gray", 0, DIM], ["rose", 0, CONTRAST], ["green", 1, CONTRAST], ["tangerine", 0, CONTRAST],
    ["cobalt", 0, CONTRAST], ["violet", 0, CONTRAST], ["sky", 0, CONTRAST], ["graphite", 0, null],
  ],
  dark: [
    ["charcoal", 0, null], ["red", 1, CONTRAST], ["green", 1, CONTRAST], ["yellow", 1, CONTRAST],
    ["blue", 1, CONTRAST], ["magenta", 1, CONTRAST], ["cyan", 1, CONTRAST], ["graphite", 1, null],
    ["gray", 0, DIM], ["rose", 1, CONTRAST], ["green", 0, CONTRAST], ["tangerine", 1, CONTRAST],
    ["cobalt", 1, CONTRAST], ["violet", 1, CONTRAST], ["sky", 1, CONTRAST], ["charcoal", 1, null],
  ],
};

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
/** WCAG relative luminance of #rrggbb. */
export function luminance(color) {
  return channels(color).map((c) => c / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}
/** WCAG contrast ratio of two #rrggbb colours. */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** `color` moved toward `to` (#rrggbb) in 2% steps until it reads at `ratio` on `bg`. */
export function legible(color, bg, ratio, to) {
  const from = channels(color), end = channels(to);
  for (let step = 0; step <= 50; step += 1) {
    const out = hex(from.map((c, i) => c + (end[i] - c) * (step / 50)));
    if (contrast(out, bg) >= ratio) return out;
  }
  return to;
}

/** One Herdr theme file's content for `stage` and its slot list. */
function theme(stage, slots, dark, accentForeground) {
  const toward = dark ? "#ffffff" : "#000000";
  return {
    background: stage.bg,
    foreground: stage.text,
    selection: stage.lilac,
    cursor: stage.accent,
    ansi: slots.map(([name, ink, ratio]) => {
      const base = INKS[name][ink].toLowerCase();
      return ratio === null ? base : legible(base, stage.bg, ratio, toward);
    }),
    colors: { chrome: stage.sidebar, surface: stage.card, accent: stage.accent, accent_foreground: accentForeground },
  };
}

/** Both themes, by file name. */
export function buildThemes() {
  return {
    "automagik-light.json": theme(STAGE_LIGHT, SLOTS.light, false, STAGE_LIGHT.card),
    "automagik-dark.json": theme(STAGE_DARK, SLOTS.dark, true, STAGE_DARK.bg),
  };
}

/** A theme file's text as committed: two-space JSON, the 16 colours on two lines, a final newline. */
export function themeText(t) {
  const row = (xs) => xs.map((x) => JSON.stringify(x)).join(", ");
  return [
    "{",
    `  "background": ${JSON.stringify(t.background)},`,
    `  "foreground": ${JSON.stringify(t.foreground)},`,
    `  "selection": ${JSON.stringify(t.selection)},`,
    `  "cursor": ${JSON.stringify(t.cursor)},`,
    "  \"ansi\": [",
    `    ${row(t.ansi.slice(0, 8))},`,
    `    ${row(t.ansi.slice(8))}`,
    "  ],",
    `  "colors": ${JSON.stringify(t.colors, null, 2).replace(/\n/g, "\n  ")}`,
    "}",
    "",
  ].join("\n");
}

const invoked = (() => { try { return fileURLToPath(import.meta.url) === process.argv[1]; } catch { return false; } })();
if (invoked) {
  const check = process.argv[2] === "check";
  let stale = 0;
  for (const [name, t] of Object.entries(buildThemes())) {
    const path = join(THEMES_DIR, name);
    const text = themeText(t);
    if (check) {
      let had = null;
      try { had = readFileSync(path, "utf8"); } catch {}
      if (had !== text) { stale += 1; console.error(`themes: ${name} differs from what scripts/themes.mjs builds`); }
    } else writeFileSync(path, text);
  }
  if (check && stale) process.exit(1);
}
