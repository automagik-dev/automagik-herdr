// inspect.js under `node --test`: what the bot menu shows (menuItems) and what the two ledgers
// say a bot did (botHistory, historyLines). Pure: rows in, data out.
import { test } from "node:test";
import assert from "node:assert/strict";

import { HISTORY_LIMIT, botHistory, historyLines, menuItems } from "../mods/am-sidebar/inspect.js";

const A = "b-aaaaaaaaaa", B = "b-bbbbbbbbbb";
const at = (minute) => `2026-11-03T10:${String(minute).padStart(2, "0")}:00.000Z`;
const attach = (event, bot, terminal, minute, extra = {}) => ({ v: 1, event, bot, project: "/x/proj", terminal, core: "c1", created_ms: 1, machine: null,
  by: event === "attach" ? "start" : "detach", at: at(minute), ...extra });
const seat = (botId, terminal, minute) => ({ event: "start", kind: "seat", terminal, botId, agent: "claude", model: null, at: at(minute) });
const worker = (botId, terminal, minute, branch) => ({ event: "start", kind: "worker", terminal, botId, branch, role: "dev", agent: "codex", at: at(minute) });
const session = (terminal, minute, id, transcript = null) => ({ event: "session", terminal, session: id, transcript, at: at(minute) });

test("menuItems: every bot gets Configure, Prompt and Inspect; a planned one nothing that needs a pane", () => {
  assert.deepEqual(menuItems({ planned: true, live: null, pane: "t3" }), ["configure", "prompt", "inspect"]);
});

test("menuItems: a bot without a pane: Start, Restart, Restart on…, Attach to the focused pane; no Focus, Detach or fresh", () => {
  assert.deepEqual(menuItems({ live: null, pane: "t3" }), ["configure", "prompt", "start", "restart", "restart-on", "attach", "inspect"]);
  assert.deepEqual(menuItems({ live: null, pane: null }), ["configure", "prompt", "start", "restart", "restart-on", "inspect"]);
});

test("menuItems: a running bot: Focus instead of Start, Restart with a new conversation, Detach; no Attach to its own pane", () => {
  assert.deepEqual(menuItems({ live: "t5", pane: "t5" }),
    ["configure", "prompt", "focus", "restart", "restart-fresh", "restart-on", "detach", "inspect"]);
  assert.ok(menuItems({ live: "t5", pane: "t9" }).includes("attach"), "another focused pane can still take it");
});

test("botHistory: the bot's attach rows, seat starts and workers; another bot's rows are left out", () => {
  const h = botHistory({
    attachRows: [attach("attach", A, "t5", 1), attach("attach", B, "t6", 2), attach("detach", A, "t5", 3)],
    ledgerRows: [seat(A, "t5", 1), seat(B, "t6", 2), worker(A, "t8", 4, "fix-x"), worker(B, "t9", 5, "fix-y")],
    botId: A,
  });
  assert.deepEqual(h.attach.map((r) => [r.event, r.terminal]), [["attach", "t5"], ["detach", "t5"]]);
  assert.deepEqual(h.starts.map((r) => r.terminal), ["t5"]);
  assert.deepEqual(h.workers.map((r) => r.branch), ["fix-x"]);
});

test("botHistory: a session counts only while the bot held its terminal; the newest transcript wins", () => {
  const h = botHistory({
    attachRows: [attach("attach", A, "t5", 1), attach("detach", A, "t5", 3), attach("attach", B, "t5", 4)],
    ledgerRows: [seat(A, "t5", 1),
      session("t5", 2, "11111111-aaaa", "/x/one.jsonl"),
      session("t5", 5, "22222222-bbbb", "/x/other-bot.jsonl"), // B took t5 at minute 4
      session("t7", 6, "33333333-cccc", "/x/never.jsonl")], // A never played t7
    botId: A,
  });
  assert.deepEqual(h.sessions.map((r) => r.session), ["11111111-aaaa"]);
  assert.equal(h.transcript, "/x/one.jsonl");
  const b = botHistory({ attachRows: [attach("attach", B, "t5", 4)], ledgerRows: [session("t5", 5, "22222222-bbbb", "/x/b.jsonl")], botId: B });
  assert.equal(b.transcript, "/x/b.jsonl");
});

test("botHistory: no rows at all is an empty history, not an error", () => {
  assert.deepEqual(botHistory({ botId: A }), { bot: A, attach: [], starts: [], workers: [], sessions: [], transcript: null });
});

test("botHistory: each list keeps its last HISTORY_LIMIT rows", () => {
  const rows = Array.from({ length: HISTORY_LIMIT + 5 }, (_, i) => seat(A, `t${i + 1}`, i));
  const h = botHistory({ ledgerRows: rows, botId: A });
  assert.equal(h.starts.length, HISTORY_LIMIT);
  assert.equal(h.starts.at(-1).terminal, `t${HISTORY_LIMIT + 5}`);
});

test("historyLines: one timeline newest first, the workers newest first, the transcript", () => {
  const h = botHistory({
    attachRows: [attach("attach", A, "t5", 1), attach("end", A, "t5", 9, { by: "sweep", reason: "finished" })],
    ledgerRows: [seat(A, "t5", 1), session("t5", 2, "11111111-aaaa", "/x/one.jsonl"), worker(A, "t8", 3, "fix-x"), worker(A, "t9", 4, "fix-y")],
    botId: A,
  });
  const { timeline, workers, transcript } = historyLines(h);
  assert.deepEqual(timeline.map((e) => e.text), [
    "2026-11-03 10:09 ended in t5 · by sweep · finished",
    "2026-11-03 10:02 session 11111111 in t5",
    "2026-11-03 10:01 attached to t5 · by start",
    "2026-11-03 10:01 started in t5 · claude",
  ]);
  assert.deepEqual(workers, ["2026-11-03 10:04 fix-y · dev · codex · t9", "2026-11-03 10:03 fix-x · dev · codex · t8"]);
  assert.equal(transcript, "/x/one.jsonl");
});
