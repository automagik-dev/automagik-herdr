// scripts/standalone-check.mjs: the scan finds what a mod reaches outside its folder, and the
// script runs every am-* mod alone in a scratch app home ($HERDR_APP_HOME = a temp folder, never
// the real one). Where herdr-app is not installed (CI), the check column says it was skipped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { REVIEWED, scanMod, scratchBase, summarize, verdictOf } from "../scripts/standalone-check.mjs";

const SCRIPT = new URL("../scripts/standalone-check.mjs", import.meta.url).pathname;
const MODS = new URL("../mods/", import.meta.url).pathname;
const AM = readdirSync(MODS).filter((n) => n.startsWith("am-") && statSync(join(MODS, n)).isDirectory()).sort();

const deps = (self, text, reviewed) => summarize(scanMod(self, { "main.js": text }), reviewed);

test("scan: another mod, opened as an overlay, a tab, by mod.open or by path, is a hard dependency", () => {
  const { hard } = deps("am-x", [
    'openOverlay({ mod: "am-new-menu", kind: "popup" });',
    'run("tab.new", { name: "Mods", mod: "am-mods" });',
    'run("mod.open", { name: "pocket-link" });',
    'const k = { "cmd-m": "mod.open:am-y" };',
    'svg("mods/am-z/icon.svg");',
  ].join("\n"));
  assert.deepEqual(hard.map((d) => d.dep), ["mod am-new-menu", "mod am-mods", "mod pocket-link", "mod am-y", "mod am-z"]);
  assert.equal(hard[0].at, "main.js:1");
});

test("scan: itself, Herdr's own mods and Herdr's own layout nodes are not dependencies", () => {
  const { hard, optional } = deps("am-x", [
    'openOverlay({ mod: "am-x", kind: "popup" });',
    'svg("mods/pane/close.svg"); run("mod.open", { name: "picker" });',
    'openOverlay({ mod: "worktree", kind: "dialog" });',
    'run("layout.select", { stack: "panel-body", child: want }); run("layout.hide", { id: "panel" });',
  ].join("\n"));
  assert.deepEqual([hard, optional], [[], []]);
});

test("scan: a layout node Herdr does not ship is a dependency", () => {
  const { hard } = deps("am-x", [
    'run("layout.toggle", { id: "am-quota-panel" });',
    'const shown = !find(layout(), "automations-panel")?.hidden;',
  ].join("\n"));
  assert.deepEqual(hard.map((d) => d.dep), ["node am-quota-panel", "node automations-panel"]);
});

test("scan: a probed mod is optional everywhere, and a reviewed entry moves or drops a finding", () => {
  const text = [
    'bots = (await readTextFile(`${appHome()}/mods/am-sidebar/mod.json`)) !== null;',
    'const f = { mod: "am-sidebar", kind: "dialog" };',
    'const r = await exec("node", ["-e", X]);',
    'const g = await exec("gh", ["api"]);',
  ].join("\n");
  const { hard, optional } = deps("am-x", text, [{ dep: "exec node", soft: "behind a probe" }, { dep: "exec gh", drop: "not real" }]);
  assert.deepEqual(hard, []);
  assert.deepEqual(optional.map((d) => d.dep), ["mod am-sidebar", "exec node"]);
});

test("scan: hc, programs other than the system's, usagemeter, hosts and installer state", () => {
  const { hard } = deps("am-x", [
    'const r = await hc(["read", term]);',
    'await exec("sh", ["-c", s]); await exec("git", ["status"]); await io.exec("herdr-automations", ["version"]);',
    'const bin = `${home}/.local/bin/usagemeter`;',
    'const URL = "https://api.github.com/repos"; const ns = "http://www.w3.org/2000/svg";',
    'const p = `${appHome}/data/am-mods/catalog.json`;',
  ].join("\n"));
  assert.deepEqual(hard.map((d) => d.dep), ["hc", "exec herdr-automations", "exec usagemeter", "net api.github.com", "installer state data/am-mods"]);
});

test("scan: a fetch of a computed URL, in a file naming no host, is a configured endpoint", () => {
  assert.deepEqual(deps("am-x", "const res = await fetch(`${root}${path}`);").hard.map((d) => d.dep), ["net configured endpoint"]);
  assert.deepEqual(deps("am-x", 'const U = "https://x.dev/a";\nawait fetch(U);').hard.map((d) => d.dep), ["net x.dev"]);
});

test("scan: comment lines are prose, not references", () => {
  const { hard } = deps("am-x", [
    '// opens am-sidebar\'s dialog: openOverlay({ mod: "am-sidebar" })',
    ' * hc(["read"]) and https://example.com',
    '/* run("layout.toggle", { id: "am-quota-panel" }) */',
  ].join("\n"));
  assert.deepEqual(hard, []);
});

test("verdict: standalone only with no hard dependency and no failed check", () => {
  assert.equal(verdictOf({ status: "pass" }, []), "standalone");
  assert.equal(verdictOf({ status: "skipped" }, []), "standalone");
  assert.equal(verdictOf({ status: "fail" }, []), "needs a passing check");
  assert.equal(verdictOf({ status: "pass" }, [{ dep: "mod am-new-menu" }, { dep: "hc" }]), "needs mod am-new-menu, hc");
});

test("REVIEWED: every entry names a mod and still matches what its scan finds", async () => {
  const { readFileSync } = await import("node:fs");
  for (const [mod, entries] of Object.entries(REVIEWED)) {
    assert.ok(AM.includes(mod), `${mod} is not a mod`);
    const files = {};
    const walk = (d, rel = "") => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(join(d, e.name), r);
        else if (/\.m?js$/.test(e.name)) files[r] = readFileSync(join(d, e.name), "utf8");
      }
    };
    walk(join(MODS, mod));
    const { hard, optional } = summarize(scanMod(mod, files));
    const found = [...hard, ...optional].map((d) => d.dep);
    for (const e of entries) assert.ok(found.includes(e.dep), `${mod}: reviewed "${e.dep}" is no longer found`);
  }
});

test("scratch base: the real app home and the home folder are refused", () => {
  assert.throws(() => scratchBase({ HERDR_APP_HOME: join(homedir(), ".config/herdr-app") }), /refusing/);
  assert.throws(() => scratchBase({ HERDR_APP_HOME: homedir() }), /refusing/);
  assert.equal(scratchBase({ HERDR_APP_HOME: "/tmp/x" }), "/tmp/x");
});

test("the script: one row per am-* mod, in a scratch app home it leaves empty", (t) => {
  const scratch = mkdtempSync(join(tmpdir(), "standalone-check-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const r = spawnSync(process.execPath, [SCRIPT, "--json"], {
    encoding: "utf8",
    timeout: 600000,
    env: { ...process.env, HERDR_APP_HOME: scratch },
  });
  assert.equal(r.status, 0, r.stderr);
  const { herdrApp, skipped, rows } = JSON.parse(r.stdout);
  assert.deepEqual(rows.map((row) => row.mod), AM);
  if (herdrApp === null) {
    t.diagnostic(`herdr-app is not installed: ${skipped}`);
    for (const row of rows) assert.equal(row.check.status, "skipped");
  } else {
    for (const row of rows) assert.ok(["pass", "fail"].includes(row.check.status), row.mod);
  }
  const by = Object.fromEntries(rows.map((row) => [row.mod, row]));
  assert.ok(by["am-tabs"].hard.some((d) => d.dep === "mod am-new-menu"));
  assert.ok(by["am-footer"].hard.some((d) => d.dep === "mod am-mods"));
  assert.deepEqual(readdirSync(scratch), [], "the run's homes are removed");
});

test("the script refuses the real app home before it copies anything", () => {
  const r = spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: { ...process.env, HERDR_APP_HOME: join(homedir(), ".config/herdr-app") },
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /refusing/);
});
