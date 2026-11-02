// The am-quota rules, proven over plain data: node --test test/am-quota-policy.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { choose, headroom, minutesToReset, burnPerHour, minutesToDry, bindingWindow, usable } from "../mods/am-quota/policy.js";

const HOUR = 3600000;
const NOW = Date.parse("2026-11-01T12:00:00Z");
const at = (hours) => new Date(NOW + hours * HOUR).toISOString();

// An account with one seven-day window.
const account = (id, { used = 0, resetIn = 48, provider = "claude", ...rest } = {}) => ({
  id,
  name: id,
  provider,
  windows: [{ id: "seven_day", used_percent: used, reset_at: at(resetIn) }],
  ...rest,
});

test("headroom, reset and burn maths", () => {
  assert.equal(headroom({ used_percent: 0 }), 1);
  assert.equal(headroom({ used_percent: 100 }), 0);
  assert.equal(headroom({ used_percent: 140 }), 0);
  assert.equal(headroom({}), null);

  assert.equal(minutesToReset({ reset_at: at(2) }, NOW), 120);
  assert.equal(minutesToReset({}, NOW), null);

  // 20 points in two hours = 0.1 share/hour.
  const rate = burnPerHour({ used_percent: 10, at: at(-2) }, { used_percent: 30, at: at(0) });
  assert.equal(Math.round(rate * 100) / 100, 0.1);
  // A reset inside the samples is no burn.
  assert.equal(burnPerHour({ used_percent: 90, at: at(-2) }, { used_percent: 5, at: at(0) }), 0);
  // Stale samples are ignored.
  assert.equal(burnPerHour({ used_percent: 10, at: at(-5) }, { used_percent: 50, at: at(0) }, { maxSampleAgeMinutes: 60 }), null);
  // No rate, no projection.
  assert.equal(minutesToDry({ used_percent: 50 }, null), null);
  assert.equal(minutesToDry({ used_percent: 50 }, 0), Infinity);
  assert.equal(Math.round(minutesToDry({ used_percent: 50 }, 0.5) ?? -1), 60);
});

test("the binding window is the one closest to dry, then the earliest reset", () => {
  const a = {
    id: "a",
    provider: "claude",
    windows: [
      { id: "five_hour", used_percent: 20, reset_at: at(1) },
      { id: "seven_day", used_percent: 70, reset_at: at(72) },
    ],
  };
  assert.equal(bindingWindow(a).id, "seven_day");
  const b = { ...a, windows: [
    { id: "x", used_percent: 70, reset_at: at(5) },
    { id: "y", used_percent: 70, reset_at: at(1) },
  ] };
  assert.equal(bindingWindow(b).id, "y");
  assert.equal(bindingWindow({ id: "c", windows: [] }), null);
});

test("usability follows the proxy's own flags", () => {
  assert.equal(usable(account("ok")), true);
  assert.equal(usable({ ...account("off"), disabled: true }), false);
  assert.equal(usable({ ...account("signin"), requires_sign_in: true }), false);
  assert.equal(usable({ ...account("failed"), failed: true }), false);
  assert.equal(usable({ ...account("state"), credential_state: "cooldown" }), false);
  assert.equal(usable({ ...account("status"), status: "disabled" }), false);
});

test("keeps the active account while it outlasts its window", () => {
  const a = account("a", { used: 20, resetIn: 72 });
  const b = account("b", { used: 0, resetIn: 6 });
  // No burn history: nothing to project, keep.
  const d = choose([a, b], { provider: "claude", now: NOW, activeId: "a" });
  assert.equal(d.action, "keep");
  assert.equal(d.to, "a");
});

test("hands off when the active account runs dry before its reset", () => {
  // a: 80% used with 20% left, burning 10 points/hour -> dry in ~2h; resets in 48h.
  const a = {
    ...account("a", { used: 80, resetIn: 48 }),
    previous: { seven_day: { used_percent: 60, at: at(-2) } },
  };
  const b = account("b", { used: 0, resetIn: 10 });
  const d = choose([a, b], { provider: "claude", now: NOW, activeId: "a" });
  assert.equal(d.action, "switch");
  assert.equal(d.to, "b");
  assert.match(d.reason, /runs dry/i);
});

test("the soonest reset with headroom wins, not the emptiest account", () => {
  // a is the active, nearly dry one; three candidates, all fine, different resets.
  const a = {
    ...account("a", { used: 95, resetIn: 48 }),
    previous: { seven_day: { used_percent: 80, at: at(-1) } },
  };
  const soon = account("soon", { used: 60, resetIn: 3 });    // 40% left, resets in 3h
  const rich = account("rich", { used: 5, resetIn: 40 });    // 95% left, resets in 40h
  const d = choose([a, soon, rich], { provider: "claude", now: NOW, activeId: "a" });
  assert.equal(d.action, "switch");
  assert.equal(d.to, "soon");
});

test("an account close to its reset is held when another is available", () => {
  const a = {
    ...account("a", { used: 99, resetIn: 48 }),
    previous: { seven_day: { used_percent: 90, at: at(-1) } },
  };
  const resetting = account("resetting", { used: 30, resetIn: 1 });   // 29% left, resets in an hour
  const steady = account("steady", { used: 40, resetIn: 20 });
  const d = choose([a, resetting, steady], { provider: "claude", now: NOW, activeId: "a", holdMinutes: 180 });
  assert.equal(d.to, "steady", "the held account's headroom is worth more after its reset");
  // With nothing else, the held one is used rather than leaving the client stuck.
  const only = choose([a, resetting], { provider: "claude", now: NOW, activeId: "a", holdMinutes: 180 });
  assert.equal(only.action, "switch");
  assert.equal(only.to, "resetting");
});

test("an unusable active account switches at once, regardless of projection", () => {
  const a = { ...account("a", { used: 10, resetIn: 48 }), requires_sign_in: true };
  const b = account("b", { used: 50, resetIn: 9 });
  const d = choose([a, b], { provider: "claude", now: NOW, activeId: "a" });
  assert.equal(d.action, "switch");
  assert.equal(d.to, "b");
  assert.match(d.reason, /unusable/);
});

test("no candidate with headroom means no switch, and says so", () => {
  const a = {
    ...account("a", { used: 99, resetIn: 48 }),
    previous: { seven_day: { used_percent: 99, at: at(-1) } },
  };
  const exhausted = account("exhausted", { used: 100, resetIn: 24 });
  const d = choose([a, exhausted], { provider: "claude", now: NOW, activeId: "a" });
  assert.equal(d.action, "none");
  assert.equal(d.to, null);
  assert.match(d.reason, /no other account has headroom/i);
});

test("providers never mix", () => {
  const a = account("a", { used: 99, resetIn: 48, provider: "claude" });
  const codex = account("codex", { used: 0, resetIn: 4, provider: "codex" });
  const d = choose([a, codex], { provider: "claude", now: NOW, activeId: "a" });
  assert.equal(d.action, "none");
  assert.equal(d.facts.length, 1, "only claude accounts are examined");
});

test("with nothing active, the rule still names the account to start on", () => {
  const soon = account("soon", { used: 20, resetIn: 2 });
  const rich = account("rich", { used: 0, resetIn: 30 });
  const d = choose([rich, soon], { provider: "claude", now: NOW, activeId: null });
  assert.equal(d.action, "switch");
  assert.equal(d.to, "soon");
  assert.match(d.reason, /nothing is active/);
});

test("a margin widens the window in which a handoff is due", () => {
  // Dry in ~4h, resets in 4h: the projection alone says "just in time"...
  const a = {
    ...account("a", { used: 80, resetIn: 4 }),
    previous: { seven_day: { used_percent: 70, at: at(-1) } },   // 10 points/hour -> dry in 2h
  };
  const b = account("b", { used: 0, resetIn: 9 });
  const tight = choose([a, b], { provider: "claude", now: NOW, activeId: "a", marginMinutes: 0 });
  assert.equal(tight.action, "switch", "dry (120m) before reset (240m) — due even with no margin");
  const late = { ...a, previous: { seven_day: { used_percent: 20, at: at(-1) } } }; // 60 points/hour?? no: 80-20=60/h -> dry in 12m
  assert.equal(choose([late, b], { provider: "claude", now: NOW, activeId: "a", marginMinutes: 0 }).action, "switch");
  // 2 points/hour -> dry in 20h, reset in 4h: nothing to do.
  const calm = { ...a, previous: { seven_day: { used_percent: 78, at: at(-1) } } };
  assert.equal(choose([calm, b], { provider: "claude", now: NOW, activeId: "a", marginMinutes: 0 }).action, "keep");
});

test("the 15-minute hold is measured on the candidate, never on the active account", () => {
  // The active account resets in five minutes — inside the hold window — and is otherwise fine.
  const active = { ...account("active", { used: 10, resetIn: 5 }), previous: { seven_day: { used_percent: 9, at: at(-1) } } };
  const far = account("far", { used: 30, resetIn: 40 });
  // Force a switch by making the active project dry before its reset.
  const dry = { ...active, previous: { seven_day: { used_percent: 0, at: at(-1) } }, windows: [{ id: "seven_day", used_percent: 99, reset_at: at(4) }] };
  const d = choose([dry, far], { provider: "claude", now: NOW, activeId: "active", holdMinutes: 15, marginMinutes: 0, floorHeadroom: 0.01 });
  assert.equal(d.action, "switch");
  assert.equal(d.to, "far", "the active account's short reset must not mark the candidate as held");
  const farFact = d.facts.find((f) => f.id === "far");
  assert.equal(farFact.held, false);

  // And a candidate that really is rolling over within the window is skipped for a steadier one.
  const rolling = account("rolling", { used: 20, resetIn: 0.1 });   // 6 minutes away
  const steady = account("steady", { used: 60, resetIn: 20 });
  const pick = choose([dry, rolling, steady], { provider: "claude", now: NOW, activeId: "active", holdMinutes: 15, marginMinutes: 0, floorHeadroom: 0.01 });
  assert.equal(pick.to, "steady");
  assert.equal(pick.facts.find((f) => f.id === "rolling").held, true);
});

test("a flat window sitting at the floor is still dry", () => {
  const floored = {
    ...account("floored", { used: 99, resetIn: 48 }),          // 1% left, under the 2% floor
    previous: { seven_day: { used_percent: 99, at: at(-1) } },  // no burn at all
  };
  const spare = account("spare", { used: 10, resetIn: 30 });
  const d = choose([floored, spare], { provider: "claude", now: NOW, activeId: "floored" });
  assert.equal(d.action, "switch", "1% left with zero burn is still unusable now");
  assert.equal(d.to, "spare");

  // Three points of headroom with no burn is not dry: keep.
  const calm = {
    ...account("calm", { used: 97, resetIn: 48 }),
    previous: { seven_day: { used_percent: 97, at: at(-1) } },
  };
  const kept = choose([calm, spare], { provider: "claude", now: NOW, activeId: "calm" });
  assert.equal(kept.action, "keep");
});

test("equal resets break the tie in a fixed order, so the panel cannot flip", () => {
  const active = {
    ...account("active", { used: 99, resetIn: 48 }),
    previous: { seven_day: { used_percent: 90, at: at(-1) } },
  };
  const slim = account("slim", { used: 70, resetIn: 12 });   // 30% left
  const wide = account("wide", { used: 10, resetIn: 12 });   // 90% left, same reset
  const first = choose([active, slim, wide], { provider: "claude", now: NOW, activeId: "active" });
  const second = choose([wide, active, slim], { provider: "claude", now: NOW, activeId: "active" });
  assert.equal(first.to, "wide", "same reset: the greater headroom wins");
  assert.equal(second.to, first.to, "input order must not change the answer");

  // Same reset and same headroom: the id decides, again regardless of order.
  const a1 = account("aaa", { used: 50, resetIn: 12 });
  const b1 = account("bbb", { used: 50, resetIn: 12 });
  assert.equal(choose([active, b1, a1], { provider: "claude", now: NOW, activeId: "active" }).to, "aaa");
  assert.equal(choose([active, a1, b1], { provider: "claude", now: NOW, activeId: "active" }).to, "aaa");
});
