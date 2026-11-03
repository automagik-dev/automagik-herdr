// The sidebar's usagemeter run (Group 6c, meter.js) with a fake exec, a fake clock and a fake
// shared store: when it runs, never twice at once, a missing binary is silent; main.js's wiring;
// the marker's usagemeter line. Nothing here runs a real usagemeter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { METER_EVERY_MS, METER_FIRST_MS, METER_KEY, meterBin, syncMeter } from "../mods/am-sidebar/meter.js";
import { formatMarker, parseMarker } from "../mods/am-sidebar/release.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BIN = meterBin("/home/someone");

/** Herdr's shared store as a Map: one per Herdr, every sidebar copy sees it. */
const sharedStore = () => {
  const m = new Map();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v) };
};

/** An exec that records each call and resolves (or rejects) when the test says. */
const gatedExec = () => {
  const calls = [];
  const exec = (cmd, args) => new Promise((resolve, reject) => calls.push({ cmd, args, resolve, reject }));
  return { calls, exec };
};

test("usagemeter sync: the shared binary's absolute path, with no argument beyond sync", async () => {
  assert.equal(BIN, "/home/someone/.local/bin/usagemeter");
  const calls = [];
  const r = await syncMeter({ exec: async (cmd, args) => { calls.push([cmd, args]); return { code: 0 }; }, bin: BIN, now: () => 1e12 });
  assert.deepEqual(calls, [[BIN, ["sync"]]]);
  assert.deepEqual(r, { ran: true, code: 0, wait: METER_EVERY_MS });
});

test("usagemeter sync: once 30 s after load, then at most once per 10 minutes over two hours", async () => {
  assert.equal(METER_FIRST_MS, 30_000);
  assert.equal(METER_EVERY_MS, 600_000);
  // main.js's timer: the first look at METER_FIRST_MS, each next one after the `wait` it returns.
  // A second sidebar copy, loaded 4 minutes later, shares the store and must not add runs.
  const store = sharedStore();
  const runs = [];
  let clock = 0;
  const exec = async () => { runs.push(clock); return { code: 0 }; };
  const copies = [{ next: METER_FIRST_MS, state: {} }, { next: 240_000 + METER_FIRST_MS, state: {} }];
  const end = 2 * 60 * 60 * 1000;
  for (;;) {
    const c = copies.reduce((a, b) => (b.next < a.next ? b : a));
    if (c.next > end) break;
    clock = c.next;
    const r = await syncMeter({ exec, bin: BIN, now: () => clock, ...store, state: c.state });
    assert.ok(r.wait > 0 && r.wait <= METER_EVERY_MS, `wait ${r.wait}`);
    c.next = clock + r.wait;
  }
  assert.equal(runs[0], METER_FIRST_MS);
  for (let i = 1; i < runs.length; i++) assert.ok(runs[i] - runs[i - 1] >= METER_EVERY_MS, `runs ${runs[i - 1]} and ${runs[i]}`);
  assert.equal(runs.length, Math.floor((end - METER_FIRST_MS) / METER_EVERY_MS) + 1);
  assert.equal(store.get(METER_KEY), runs.at(-1));
});

test("usagemeter sync: never twice at once, in one copy or across copies", async () => {
  const store = sharedStore();
  const { calls, exec } = gatedExec();
  let clock = 1e12;
  const now = () => clock;
  const state = {};
  const first = syncMeter({ exec, bin: BIN, now, ...store, state });
  // The same copy again, and another copy, while the run is going: neither starts one.
  assert.deepEqual(await syncMeter({ exec, bin: BIN, now, ...store, state }), { ran: false, why: "busy", wait: METER_EVERY_MS });
  const other = await syncMeter({ exec, bin: BIN, now, ...store, state: {} });
  assert.equal(other.ran, false);
  assert.equal(other.why, "fresh");
  // Even past ten minutes, this copy waits for its own run to end.
  clock += METER_EVERY_MS + 1;
  assert.equal((await syncMeter({ exec, bin: BIN, now, ...store, state })).why, "busy");
  assert.equal(calls.length, 1);
  calls[0].resolve({ code: 0, stdout: "", stderr: "" });
  assert.equal((await first).ran, true);
  // Its run over and ten minutes gone: the next one starts.
  const second = syncMeter({ exec, bin: BIN, now, ...store, state });
  assert.equal(calls.length, 2);
  calls[1].resolve({ code: 0, stdout: "", stderr: "" });
  assert.equal((await second).ran, true);
});

test("usagemeter sync: a missing binary (exec rejects) or a failing run is silent, and tried again later", async () => {
  const store = sharedStore();
  let clock = 1e12;
  const missing = async () => { throw new Error("No such file or directory"); };
  const r = await syncMeter({ exec: missing, bin: BIN, now: () => clock, ...store, state: {} });
  assert.deepEqual(r, { ran: false, why: "missing", wait: METER_EVERY_MS });
  clock += METER_EVERY_MS;
  const failed = await syncMeter({ exec: async () => ({ code: 1 }), bin: BIN, now: () => clock, ...store, state: {} });
  assert.deepEqual(failed, { ran: true, code: 1, wait: METER_EVERY_MS });
  // A shared store that throws (or holds junk) does not stop the run.
  const odd = await syncMeter({ exec: async () => ({ code: 0 }), bin: BIN, now: () => clock, get: () => "junk", set: () => { throw new Error("x"); }, state: {} });
  assert.equal(odd.ran, true);
});

test("the sidebar wires it: Herdr's exec and home(), 30 s after load, no LaunchAgent anywhere", () => {
  const main = readFileSync(join(ROOT, "mods", "am-sidebar", "main.js"), "utf8");
  assert.match(main, /import \{[^}]*\bsyncMeter\b[^}]*\} from "\.\/meter\.js";/);
  assert.match(main, /cx\.timer\.after\(METER_FIRST_MS, \(cx\) => this\.meterTick\(cx\)\)/);
  assert.match(main, /syncMeter\(\{ exec, bin: meterBin\(home\(\)\), get: shared, set: setShared, state: this\.meter, machines \}\)/);
  assert.match(main, /cx\.timer\.after\(wait, \(cx\) => this\.meterTick\(cx\)\)/);
  // meter.js is pure: no import at all, so node --test and the mod share it.
  assert.doesNotMatch(readFileSync(join(ROOT, "mods", "am-sidebar", "meter.js"), "utf8"), /^import /m);
  for (const dir of readdirSync(join(ROOT, "mods"))) {
    for (const name of readdirSync(join(ROOT, "mods", dir)).filter((n) => /\.(m?js)$/.test(n))) {
      assert.doesNotMatch(readFileSync(join(ROOT, "mods", dir, name), "utf8"), /Library\/LaunchAgents|launchctl/, `${dir}/${name}`);
    }
  }
});

test("the marker's usagemeter line: written when set, read back, junk ignored, absent by default", () => {
  const base = { version: "1.2.3", mods: ["am-sidebar"], layout: "added" };
  assert.doesNotMatch(formatMarker(base), /usagemeter/);
  const text = formatMarker({ ...base, usagemeter: "0.2.0" });
  assert.match(text, /\nusagemeter=0\.2\.0\n$/);
  assert.equal(parseMarker(text).usagemeter, "0.2.0");
  assert.equal(parseMarker(formatMarker(parseMarker(text))).usagemeter, "0.2.0");
  assert.equal(parseMarker(`${formatMarker(base)}usagemeter=../../x\n`).usagemeter, null);
  assert.equal(parseMarker(formatMarker(base)).usagemeter, null);
});
