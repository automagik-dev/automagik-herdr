// Buttons other mods add to the footer rail (mods/am-footer/contributions.js): parsing and
// validating mod.json, the order and the cap, the badge rule, and the scan over a scratch app home.
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_BUTTONS, FALLBACK_ICON, badgeCount, collectFooter, iconLooksValid, iconPath, modNames, oneAtATime, parseFooter, scanFooter, touchesFooter,
} from "../mods/am-footer/contributions.js";

const TASKS = { id: "tasks", label: "Tasks", icon: "mods/genie-herdr/tasks.svg", command: "mod.open", args: { name: "tasks-mock" }, badge: "genie.tasks.waiting" };
const modJson = (footer, extra = {}) => JSON.stringify({ place: "none", ...extra, automagik: { footer } });

test("a good entry: every field kept, keyed <mod>/<id>", () => {
  const { buttons, problems } = parseFooter("genie-herdr", modJson([TASKS]));
  assert.deepEqual(problems, []);
  assert.deepEqual(buttons, [{
    key: "genie-herdr/tasks", mod: "genie-herdr", id: "tasks", label: "Tasks", command: "mod.open",
    args: { name: "tasks-mock" }, icon: "mods/genie-herdr/tasks.svg", badge: "genie.tasks.waiting",
  }]);
});

test("an entry with no id, label or command is skipped and named; the rest stay", () => {
  for (const field of ["id", "label", "command"]) {
    for (const bad of [undefined, "", "   ", 7, null]) {
      const broken = { ...TASKS, id: "other", [field]: bad };
      if (bad === undefined) delete broken[field];
      const { buttons, problems } = parseFooter("m", modJson([broken, TASKS]));
      assert.deepEqual(buttons.map((b) => b.id), ["tasks"], `${field}=${String(bad)}`);
      assert.match(problems[0], /footer\[0\] needs id, label and command/);
    }
  }
  const { buttons, problems } = parseFooter("m", modJson(["tasks", null, [], 3]));
  assert.deepEqual(buttons, []);
  assert.equal(problems.length, 4);
});

test("optional fields: args default to {}, a bad icon is dropped, no badge is null", () => {
  const { buttons: [b] } = parseFooter("m", modJson([{ id: "a", label: "A", command: "app.help", args: ["x"], icon: 3, badge: 5 }]));
  assert.deepEqual(b.args, {});
  assert.equal(b.icon, null);
  assert.equal(b.badge, null);
});

test("bad JSON, no automagik key, or a footer that is not a list: no buttons, no throw", () => {
  assert.deepEqual(parseFooter("m", "{ not json"), { buttons: [], problems: ["m: mod.json is not valid JSON"] });
  assert.deepEqual(parseFooter("m", "null"), { buttons: [], problems: [] });
  assert.deepEqual(parseFooter("m", JSON.stringify({ place: "right" })), { buttons: [], problems: [] });
  assert.deepEqual(parseFooter("m", JSON.stringify({ automagik: {} })), { buttons: [], problems: [] });
  assert.deepEqual(parseFooter("m", JSON.stringify({ automagik: { footer: { id: "x" } } })).buttons, []);
});

test("an id twice in one mod: the first is kept", () => {
  const { buttons, problems } = parseFooter("m", modJson([TASKS, { ...TASKS, label: "Again" }]));
  assert.deepEqual(buttons.map((b) => b.label), ["Tasks"]);
  assert.match(problems[0], /appears twice/);
});

test("more than 4: mod-name order, then declared order, cut at 4", () => {
  const entry = (id) => ({ id, label: id, command: "app.help" });
  const { buttons, problems } = collectFooter([
    { name: "zeta", text: modJson([entry("z1")]) },
    { name: "alpha", text: modJson([entry("a1"), entry("a2")]) },
    { name: "broken", text: "{" },
    { name: "gone", text: null },
    { name: "mid", text: modJson([entry("m1"), entry("m2")]) },
  ]);
  assert.equal(MAX_BUTTONS, 4);
  assert.deepEqual(buttons.map((b) => b.key), ["alpha/a1", "alpha/a2", "mid/m1", "mid/m2"]);
  assert.ok(problems.some((p) => /5 buttons, the first 4/.test(p)));
  assert.ok(problems.some((p) => /broken: mod.json is not valid JSON/.test(p)));
});

test("badge: a count only for a number above 0", () => {
  assert.equal(badgeCount(0), null);
  assert.equal(badgeCount(3), "3");
  assert.equal(badgeCount("x"), null);
  assert.equal(badgeCount(null), null);
  assert.equal(badgeCount(undefined), null);
  assert.equal(badgeCount("3"), null, "strings are not coerced");
  assert.equal(badgeCount(-2), null);
  assert.equal(badgeCount(NaN), null);
  assert.equal(badgeCount(Infinity), null);
  assert.equal(badgeCount(0.4), "1");
  assert.equal(badgeCount(9), "9");
  assert.equal(badgeCount(10), "9+", "past 9 the pill stays two characters wide");
  assert.equal(badgeCount(140), "9+");
});

test("icon paths: relative SVGs under the app home only; files must look like an SVG", () => {
  assert.equal(iconPath("mods/genie-herdr/tasks.svg"), "mods/genie-herdr/tasks.svg");
  for (const bad of ["/etc/x.svg", "~/x.svg", "mods/../../x.svg", "mods//x.svg", "mods/x.png", "mods\\x.svg", "", null, 4]) {
    assert.equal(iconPath(bad), null, String(bad));
  }
  assert.ok(iconLooksValid('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
  assert.ok(!iconLooksValid("not an icon"));
  assert.ok(!iconLooksValid(null));
});

test("the mods folder listing: by name, hidden folders and Pocket Link (any case) left out", () => {
  const out = ["/h/mods/tasks-mock", "/h/mods/.cache", "/h/mods/pocket-link", "/h/mods/Pocket-Link", "/h/mods/am-quota/", ""].join("\n");
  assert.deepEqual(modNames(out), ["am-quota", "tasks-mock"]);
});

test("watch batches: only the folder, a mod folder, a mod.json or an SVG rescan", () => {
  const dir = "/h/mods";
  assert.ok(touchesFooter(["/h/mods"], dir));
  assert.ok(touchesFooter(["/h/mods/new-mod"], dir));
  assert.ok(touchesFooter(["/h/mods/tasks-mock/mod.json"], dir));
  assert.ok(touchesFooter(["/h/mods/genie-herdr/icons/tasks.svg"], dir));
  assert.ok(!touchesFooter(["/h/mods/tasks-mock/main.js", "/h/mods/x/node_modules/y/mod.json"], dir));
  assert.ok(!touchesFooter(["/h/other/mod.json"], dir));
  assert.ok(!touchesFooter([], dir));
});

// The scan against a real folder: `find` lists, readText reads (null when missing), nothing writes.
function scratch(files) {
  const root = mkdtempSync(join(tmpdir(), "hb-contrib-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}
const realIo = (calls) => ({
  exec: (cmd, args) => { calls.push(["exec", cmd]); return new Promise((resolve) => execFile(cmd, args, (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, stdout, stderr }))); },
  readText: async (path) => { calls.push(["read", path]); try { return await readFile(path, "utf8"); } catch (e) { if (e.code === "ENOENT") return null; throw e; } },
});

test("scan: lists the mods, keeps valid buttons, swaps a missing or invalid icon for the glyph", async () => {
  const root = scratch({
    "mods/tasks-mock/mod.json": modJson([TASKS, { id: "bad", label: "No command" }, { id: "x", label: "X", command: "app.help", icon: "mods/tasks-mock/x.svg" }]),
    "mods/tasks-mock/x.svg": "not an svg",
    "mods/genie-herdr/tasks.svg": '<svg viewBox="0 0 24 24"></svg>',
    "mods/aaa/mod.json": modJson([{ id: "one", label: "One", command: "app.help", icon: "mods/aaa/missing.svg" }]),
    "mods/pocket-link/mod.json": modJson([{ id: "p", label: "P", command: "app.help" }]),
    "mods/plain/mod.json": JSON.stringify({ place: "right" }),
  });
  const calls = [];
  try {
    const { buttons, problems } = await scanFooter(realIo(calls), root);
    assert.deepEqual(buttons.map((b) => [b.key, b.glyph]), [
      ["aaa/one", FALLBACK_ICON],
      ["tasks-mock/tasks", "mods/genie-herdr/tasks.svg"],
      ["tasks-mock/x", FALLBACK_ICON],
    ]);
    assert.ok(problems.some((p) => /tasks-mock: footer\[1\]/.test(p)));
    assert.ok(!calls.some(([, p]) => /pocket-link/i.test(String(p))), "Pocket Link's folder is never read");
    assert.deepEqual([...new Set(calls.map(([kind]) => kind))].sort(), ["exec", "read"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scan: no mods folder means no buttons and one problem, not a throw", async () => {
  const root = mkdtempSync(join(tmpdir(), "hb-contrib-"));
  try {
    const { buttons, problems } = await scanFooter(realIo([]), root);
    assert.deepEqual(buttons, []);
    assert.deepEqual(problems, ["footer: could not list the mods folder"]);
    const failing = { exec: () => Promise.reject(new Error("no find")), readText: async () => null };
    assert.deepEqual((await scanFooter(failing, root)).buttons, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("one scan at a time: triggers during a scan wait for it and get one rerun, with the latest args", async () => {
  const runs = [];
  let release;
  const fn = async (x) => { runs.push(x); if (x === "a") await new Promise((r) => { release = r; }); };
  const scan = oneAtATime(fn);
  const first = scan("a");
  const second = scan("b");
  const third = scan("c");
  assert.equal(second, first, "a trigger during a scan waits for the same run");
  assert.equal(third, first);
  await Promise.resolve();
  assert.deepEqual(runs, ["a"], "nothing runs beside the scan in flight");
  release();
  await Promise.all([first, second, third]);
  assert.deepEqual(runs, ["a", "c"], "one rerun, with the latest trigger");
  await scan("d");
  assert.deepEqual(runs, ["a", "c", "d"], "idle again: the next trigger runs at once");
});

test("one scan at a time: a failing run frees the next trigger", async () => {
  const scan = oneAtATime(async (x) => { if (x === "bad") throw new Error("boom"); });
  await assert.rejects(scan("bad"), /boom/);
  await scan("good");
});
