// A16: the labels a bot pane carries for the event envelope (launchArgs.js), over plain data.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  paneLabels, roleOf, labelWords, relabelWords, detachWords, relabelPlan, labelMoves, startArgs, SQUAD_MARK,
} from "../mods/spaces-agents/launchArgs.js";
import { parseBots, effectiveCategory } from "../mods/spaces-agents/model.js";

const ID = { main: "b-aaaaaaaaaa", cap: "b-bbbbbbbbbb", dev: "b-cccccccccc", test: "b-dddddddddd", plan: "b-eeeeeeeeee", pm: "b-ffffffffff" };
const bot = (id, kind, extra = {}) => ({ id, name: id.slice(2, 5), kind, look: { character: "star", colour: "blue" }, role: "r", instructions: "", agent: "claude", ...extra });
const FILE = {
  version: 1,
  categories: [{ id: "eng", title: "Engineering" }, { id: "shared", title: "Shared" }],
  bots: [
    bot(ID.main, "main", { rank: "owner" }),
    bot(ID.cap, "member", { category: "eng", rank: "dev" }),
    bot(ID.dev, "member", { lead: ID.cap, rank: "dev", category: "shared" }), // a deeper member ignores its own category
    bot(ID.test, "member", { lead: ID.cap }),
    bot(ID.pm, "member", { category: "gone", rank: "pm" }),
    bot(ID.plan, "member", { agent: undefined, planned: { wave: 2 }, rank: "tester" }),
  ],
};
const file = (f = FILE) => parseBots(JSON.stringify(f)).file;

test("roleOf: main for the main bot, captain for a bot that leads, else the rank, else none", () => {
  const f = file();
  assert.equal(roleOf(f, ID.main), "main"); // its rank (owner) doesn't count
  assert.equal(roleOf(f, ID.cap), "captain"); // leads dev and test; its rank (dev) doesn't count
  assert.equal(roleOf(f, ID.dev), "dev");
  assert.equal(roleOf(f, ID.test), null);
  assert.equal(roleOf(f, "b-nonenonene"), null);
});

test("effectiveCategory: a direct report's own; a deeper member takes its chain's; unknown and main: none", () => {
  const f = file();
  assert.equal(effectiveCategory(f, ID.cap), "eng");
  assert.equal(effectiveCategory(f, ID.dev), "eng");
  assert.equal(effectiveCategory(f, ID.test), "eng");
  assert.equal(effectiveCategory(f, ID.pm), null);
  assert.equal(effectiveCategory(f, ID.main), null);
});

test("paneLabels: bot, role, category; a pane's squad is kept; else the lead pane's is copied and marked", () => {
  const f = file();
  assert.deepEqual(paneLabels(f, ID.main), { bot: ID.main, role: "main" });
  assert.deepEqual(paneLabels(f, ID.cap), { bot: ID.cap, role: "captain", category: "eng" });
  assert.deepEqual(paneLabels(f, ID.dev), { bot: ID.dev, role: "dev", category: "eng" });
  assert.deepEqual(paneLabels(f, ID.test), { bot: ID.test, category: "eng" }); // no rank: no role
  assert.deepEqual(paneLabels(f, ID.pm), { bot: ID.pm, role: "pm" }); // unknown category: none
  // Squad from the lead's pane, marked as copied; never over the pane's own.
  assert.deepEqual(paneLabels(f, ID.dev, {}, { squad: "memory" }), { bot: ID.dev, role: "dev", category: "eng", squad: "memory", [SQUAD_MARK]: "1" });
  assert.deepEqual(paneLabels(f, ID.dev, { squad: "infra" }, { squad: "memory" }), { bot: ID.dev, role: "dev", category: "eng" });
  assert.deepEqual(paneLabels(f, ID.dev, {}, { role: "captain" }), { bot: ID.dev, role: "dev", category: "eng" }); // the lead has none
});

test("startArgs carries the labels after the bot label, skipping empty ones", () => {
  const args = startArgs({ botId: ID.dev, name: "dev", cwd: "/p", parent: ["--no-parent"], argv: ["claude"],
    labels: { bot: ID.dev, role: "dev", category: "", squad: "memory", [SQUAD_MARK]: "1" } });
  assert.deepEqual(args.slice(args.indexOf("--cwd")), ["--cwd", "/p", "--label", `bot=${ID.dev}`, "--label", "role=dev",
    "--label", "squad=memory", "--label", `${SQUAD_MARK}=1`, "--no-parent", "--", "claude"]);
});

test("labelWords sets what differs; detachWords takes off bot, role, category and only a copied squad", () => {
  assert.deepEqual(labelWords({ bot: ID.dev, role: "dev", category: "eng" }, { bot: ID.dev, role: "pm" }), ["role=dev", "category=eng"]);
  assert.deepEqual(labelWords({ bot: ID.dev }, { bot: ID.dev }), []);
  assert.deepEqual(detachWords({ bot: ID.dev, role: "dev", category: "eng", squad: "infra" }), ["bot=", "role=", "category="]);
  assert.deepEqual(detachWords({ bot: ID.dev, squad: "memory", [SQUAD_MARK]: "1" }), ["bot=", "squad=", `${SQUAD_MARK}=`]);
  assert.deepEqual(detachWords(), ["bot="]);
  // Attach: an old holder loses what Detach takes off.
  assert.deepEqual(labelMoves(["t1", "t2"], "t2", ID.dev, (t) => (t === "t1" ? { bot: ID.dev, role: "dev" } : {})),
    [["label", "t1", "bot=", "role="], ["label", "t2", `bot=${ID.dev}`]]);
});

test("relabelPlan + relabelWords: rank, lead and category edits, and a lead's captain status", () => {
  const before = file();
  // Test moves from the captain to the main bot (into shared); dev gets rank reviewer.
  const edited = JSON.parse(JSON.stringify(FILE));
  const t = edited.bots.find((b) => b.id === ID.test);
  delete t.lead; t.category = "shared";
  edited.bots.find((b) => b.id === ID.dev).rank = "reviewer";
  let plan = relabelPlan(before, file(edited));
  assert.deepEqual(plan.map((p) => p.id).sort(), [ID.dev, ID.test].sort());
  const test_ = plan.find((p) => p.id === ID.test);
  assert.equal(test_.leadChanged, true);
  assert.deepEqual(relabelWords(test_.before, test_.after, { bot: ID.test, category: "eng" }), ["category=shared"]);
  // Dev leaves too: the captain leads nobody, so its role falls back to its rank.
  delete edited.bots.find((b) => b.id === ID.dev).lead;
  plan = relabelPlan(before, file(edited));
  const cap = plan.find((p) => p.id === ID.cap);
  assert.deepEqual([cap.before.role, cap.after.role], ["captain", "dev"]);
  assert.deepEqual(relabelWords(cap.before, cap.after, { bot: ID.cap, role: "captain", category: "eng" }), ["role=dev"]);
  // A rank cleared: the role the old file gave comes off, a role someone else set stays.
  const cleared = JSON.parse(JSON.stringify(FILE));
  delete cleared.bots.find((b) => b.id === ID.pm).rank;
  const pm = relabelPlan(before, file(cleared)).find((p) => p.id === ID.pm);
  assert.deepEqual(relabelWords(pm.before, pm.after, { bot: ID.pm, role: "pm" }), ["role="]);
  assert.deepEqual(relabelWords(pm.before, pm.after, { bot: ID.pm, role: "owner" }), []);
  // A squad is only ever added.
  assert.deepEqual(relabelWords({ bot: ID.dev }, { bot: ID.dev, squad: "memory", [SQUAD_MARK]: "1" }, { bot: ID.dev }), ["squad=memory", `${SQUAD_MARK}=1`]);
  // Nothing changed, nothing planned; planned bots never.
  assert.deepEqual(relabelPlan(before, file()), []);
  const planned = JSON.parse(JSON.stringify(FILE));
  planned.bots.find((b) => b.id === ID.plan).rank = "pm";
  assert.deepEqual(relabelPlan(before, file(planned)), []);
});
