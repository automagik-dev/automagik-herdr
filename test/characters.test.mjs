import { test } from "node:test";
import assert from "node:assert/strict";
import { INKS, CHARACTER_NAMES, POSES, characterSvg, characterFile, inkOf, mix, isDark } from "../mods/am-sidebar/characters.js";
import { CHARACTERS, COLOURS, OMNI_LOOK } from "../mods/am-sidebar/model.js";

test("the drawn characters are the 21 model.js offers, and every offered colour has an ink", () => {
  assert.deepEqual(CHARACTER_NAMES, CHARACTERS);
  assert.equal(CHARACTER_NAMES.length, 21);
  for (const c of COLOURS) assert.ok(INKS[c], `no ink for ${c}`);
  assert.ok(CHARACTER_NAMES.includes(OMNI_LOOK.character) && INKS[OMNI_LOOK.colour]);
});

test("six poses, as DESIGN Decision 7 names them", () => {
  assert.deepEqual(POSES, ["working", "idle", "needs-you", "done", "failed", "asleep"]);
});

test("every character x colour x pose is a whole SVG with no color-mix(, mask or CSS", () => {
  const files = new Set();
  for (const character of CHARACTER_NAMES) {
    for (const colour of COLOURS) {
      for (const pose of POSES) {
        for (const dark of [true, false]) {
          const svg = characterSvg(character, colour, pose, dark);
          assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"'), `${character} ${colour} ${pose}`);
          assert.ok(svg.endsWith("</svg>"));
          assert.ok(!svg.includes("color-mix("), `${character} ${colour} ${pose}: color-mix`);
          assert.ok(!svg.includes("var(--"), `${character} ${colour} ${pose}: a CSS variable`);
          assert.ok(!/mask|class=|style=/.test(svg), `${character} ${colour} ${pose}: mask or CSS`);
          assert.ok(!svg.includes("NaN") && !svg.includes("undefined"));
          files.add(characterFile(character, colour, pose, dark));
        }
      }
    }
  }
  assert.equal(files.size, 21 * COLOURS.length * 6 * 2, "one file name per picture");
});

test("each pose draws a different face", () => {
  const faces = new Set(POSES.map((p) => characterSvg("octopus", "deepseek", p)));
  assert.equal(faces.size, 6);
});

test("color-mix stops are resolved like CSS srgb color-mix", () => {
  assert.equal(mix("#22D3EE", "#ffffff", 0.58), "#7fe5f5");
  assert.equal(mix("#22D3EE", "#000000", 0.72), "#1898ab");
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
  const svg = characterSvg("octopus", "deepseek", "working");
  assert.ok(svg.includes('stop-color="#7fe5f5"') && svg.includes('stop-color="#22D3EE"') && svg.includes('stop-color="#1898ab"'));
  // The light appearance paints with the light ink.
  assert.ok(characterSvg("octopus", "deepseek", "working", false).includes('stop-color="#0891B2"'));
  // A gradient colour keeps its own stops.
  assert.ok(characterSvg("star", "aurora", "idle").includes('stop-color="#A4FFB0"'));
});

test("unknown character, colour or pose still draws", () => {
  assert.equal(characterSvg("nope", "deepseek", "idle"), characterSvg("gumdrop", "deepseek", "idle"));
  assert.equal(characterSvg("whale", "nope", "idle"), characterSvg("whale", "gray", "idle"));
  assert.equal(characterSvg("whale", "red", "nope"), characterSvg("whale", "red", "idle"));
});

test("a colour, character or pose named like an Object property draws as an unknown one", () => {
  for (const odd of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    assert.equal(characterSvg("whale", odd, "idle"), characterSvg("whale", "gray", "idle"), `colour ${odd}`);
    assert.equal(characterSvg(odd, "red", "idle"), characterSvg("gumdrop", "red", "idle"), `character ${odd}`);
    assert.equal(characterSvg("whale", "red", odd), characterSvg("whale", "red", "idle"), `pose ${odd}`);
    assert.equal(inkOf(odd), inkOf("gray"));
  }
});

test("inkOf: Automagik's light ink, black and unknown read as gray", () => {
  assert.equal(inkOf("deepseek"), "#0891B2");
  assert.equal(inkOf("deepseek", true), "#22D3EE");
  assert.equal(inkOf("black"), INKS.gray[0]);
  assert.equal(inkOf("nope"), INKS.gray[0]);
});

test("file names are safe and say character, colour, pose and ink", () => {
  assert.equal(characterFile("octopus", "deepseek", "needs-you"), "octopus-deepseek-needs-you-dark.svg");
  assert.equal(characterFile("../x", "a/b", "idle", false), "___x-a_b-idle-light.svg");
});

test("isDark: a sidebar's appearance from its chrome colour", () => {
  assert.equal(isDark("#0E1117"), true);
  assert.equal(isDark("#f7f7f7"), false);
  assert.equal(isDark("#ffffffcc"), false);
  assert.equal(isDark("rgb(0,0,0)"), true, "not a hex colour: dark, the common case");
});
