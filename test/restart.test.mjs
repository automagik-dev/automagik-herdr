// Restart over plain data (restart.js, models.js resumeArgs): what the replacement runs per
// agent (resume, fresh, swap), the refusals (a turn in progress, helpers that end with the
// pane) and the labels carried over. The hc side is in cli.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";

import { canResume, resumeArgs } from "../mods/am-sidebar/models.js";
import { carriedLabels, planText, restartAnswer, restartCall, restartPlan, restartRefusal, sessionOf } from "../mods/am-sidebar/restart.js";

const claude = { agent: "claude", model: "claude-opus-5-5" };

test("resumeArgs: claude by session id, else --continue; codex resume --last; --continue for pi, omp, kimi, agy, hermes; none for the rest", () => {
  assert.deepEqual(resumeArgs("claude", "s-1"), ["--resume", "s-1"]);
  assert.deepEqual(resumeArgs("claude", null), ["--continue"]);
  assert.deepEqual(resumeArgs("claude", "  "), ["--continue"]);
  assert.deepEqual(resumeArgs("codex"), ["resume", "--last"]);
  for (const k of ["pi", "omp", "kimi", "antigravity", "hermes"]) assert.deepEqual(resumeArgs(k), ["--continue"], k);
  for (const k of ["opencode", "cursor", "copilot", "amp", "grok", "kiro", "qoder", "crush", "nope"]) {
    assert.equal(resumeArgs(k), null, k);
    assert.equal(canResume(k), false, k);
  }
});

test("restartPlan resume: claude with the pane's session and the bot's pin; --continue without one; codex resume before its model flag", () => {
  const withId = restartPlan({ bot: claude, run: ["claude"], runningAgent: "claude", session: "s-9" });
  assert.equal(withId.mode, "resume");
  assert.deepEqual(withId.argv, ["claude", "--resume", "s-9", "--model", "claude-opus-5-5"]);
  assert.equal(planText(withId, "s-9"), "resuming session s-9");
  const latest = restartPlan({ bot: claude, run: ["claude"], runningAgent: "claude" });
  assert.deepEqual(latest.argv, ["claude", "--continue", "--model", "claude-opus-5-5"]);
  assert.match(planText(latest, null), /--continue/);
  const codex = restartPlan({ bot: { agent: "codex", model: "gpt-5.5" }, run: ["codex", "--yolo"], runningAgent: "codex", session: "ignored" });
  assert.deepEqual(codex.argv, ["codex", "--yolo", "resume", "--last", "--model", "gpt-5.5"]);
  assert.equal(planText(codex), "resuming its last conversation (resume --last)");
  const pi = restartPlan({ bot: { agent: "pi" }, run: ["pi"], runningAgent: "pi" });
  assert.deepEqual(pi.argv, ["pi", "--continue"]);
});

test("restartPlan fresh: --fresh, an agent with no resume, a pane running another agent (each says why)", () => {
  const fresh = restartPlan({ bot: claude, run: ["claude"], runningAgent: "claude", session: "s-9", fresh: true });
  assert.deepEqual([fresh.mode, fresh.argv, fresh.note], ["fresh", ["claude", "--model", "claude-opus-5-5"], null]);
  const amp = restartPlan({ bot: { agent: "amp" }, run: ["amp"], runningAgent: "amp" });
  assert.equal(amp.mode, "fresh");
  assert.deepEqual(amp.argv, ["amp"]);
  assert.match(amp.note, /amp has no resume this pack knows/);
  assert.match(planText(amp), /a new conversation \(amp has no resume/);
  const crossed = restartPlan({ bot: claude, run: ["claude"], runningAgent: "codex", session: "s-9" });
  assert.equal(crossed.mode, "fresh");
  assert.match(crossed.note, /runs codex, not claude/);
});

test("restartPlan swap: --agent starts fresh on the agent's default (the old pin left behind); --model alone keeps the agent; always new", () => {
  const toCodex = restartPlan({ bot: claude, run: ["codex"], runningAgent: "claude", session: "s-9", agent: "codex" });
  assert.deepEqual([toCodex.mode, toCodex.agent, toCodex.model, toCodex.argv], ["swap", "codex", null, ["codex"]]);
  const pinned = restartPlan({ bot: claude, run: ["codex"], agent: "codex", model: "gpt-5.5" });
  assert.deepEqual(pinned.argv, ["codex", "--model", "gpt-5.5"]);
  assert.equal(planText(pinned), "on codex (gpt-5.5), a new conversation");
  const sonnet = restartPlan({ bot: claude, run: ["claude"], runningAgent: "claude", session: "s-9", model: "claude-sonnet-5-5" });
  assert.deepEqual([sonnet.mode, sonnet.argv], ["swap", ["claude", "--model", "claude-sonnet-5-5"]]);
  // An empty model (the CLI's "no pin") starts on the default.
  assert.deepEqual(restartPlan({ bot: claude, run: ["claude"], agent: "claude", model: "" }).argv, ["claude"]);
});

test("restartRefusal: a working pane, then helpers that die with it; outliving helpers and finished ones don't count; --force passes", () => {
  const idle = { address: "t5", status: { state: "idle" } };
  const working = { address: "t5", status: { state: "working" } };
  assert.match(restartRefusal({ name: "Genie", old: working }), /Genie is working in t5; restarting now would cut its turn in half\. .*--force/);
  assert.equal(restartRefusal({ name: "Genie", old: working, force: true }), null);
  const helpers = [
    { address: "t7", state: "live", die_with_parent: true },
    { address: "t8", state: "live", die_with_parent: false }, // a member bot, --outlive-parent
    { address: "t9", state: "finished", die_with_parent: true },
  ];
  assert.match(restartRefusal({ name: "Genie", old: idle, helpers }), /t5 has a helper that ends with it: t7\. .*--force/);
  assert.equal(restartRefusal({ name: "Genie", old: idle, helpers: helpers.slice(1) }), null);
  assert.equal(restartRefusal({ name: "Genie", old: idle, helpers, force: true }), null);
  assert.equal(restartRefusal({ name: "Genie", old: idle }), null);
});

test("carriedLabels keeps the old pane's squad and its mark; sessionOf reads agent.session", () => {
  assert.deepEqual(carriedLabels({ labels: { bot: "b", squad: "s1", "automagik-herdr.squad": "s1", "herdr.space": "sp" } }),
    { squad: "s1", "automagik-herdr.squad": "s1" });
  assert.deepEqual(carriedLabels({ labels: { squad: "theirs" } }), { squad: "theirs" });
  assert.deepEqual(carriedLabels(null), {});
  assert.equal(sessionOf({ labels: { "agent.session": "s-1" } }), "s-1");
  assert.equal(sessionOf({ labels: {} }), null);
  assert.equal(sessionOf(null), null);
});

test("the sidebar's Restart: hc exec of the pack's CLI in herdr-core's environment; its answer read back", () => {
  assert.deepEqual(restartCall({ appHome: "/a", botId: "b-1", projectKey: "/p" }), ["exec", "--env", "HERDR_APP_HOME=/a", "--cwd", "/p", "--timeout", "120", "--",
    "sh", "/a/mods/am-sidebar/bin/run.sh", "/a/mods/am-sidebar/bin/automagik-herdr.mjs", "restart", "b-1", "--project", "/p", "--json"]);
  assert.deepEqual(restartCall({ appHome: "/a", botId: "b-1", projectKey: "/p", agent: "codex", force: true }).slice(-3), ["--agent", "codex", "--force"]);
  assert.deepEqual(restartAnswer({ code: 0, stdout: JSON.stringify({ terminal: "t100", replaced: "t5", warnings: ["w"] }), stderr: "" }),
    { terminal: "t100", replaced: "t5", warnings: ["w"] });
  const working = restartAnswer({ code: 1, stdout: "", stderr: "automagik-herdr: a warning\nautomagik-herdr: Genie is working in t5; restarting now would cut its turn in half. Wait until it is idle, or pass --force.\n" });
  assert.match(working.refused, /^Genie is working in t5/);
  assert.equal(working.forceable, true);
  assert.deepEqual(restartAnswer({ code: 1, stdout: "", stderr: "automagik-herdr: No bot x in this project.\n" }), { refused: "No bot x in this project.", forceable: false });
  assert.deepEqual(restartAnswer({ code: 127, stdout: "", stderr: "" }), { refused: "Restart failed (exit 127).", forceable: false });
});
