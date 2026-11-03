// The attach ledger: which terminal plays which bot, as an append-only file the
// automagik-herdr CLI alone writes (`<app home>/automagik-herdr/attach.jsonl`, beside the
// workers ledger). The `bot=` label is a display hint; this file is the authority, so a
// relabel (`hc label`) moves nothing. Pure: no `herdr`, no `node:` import, so the CLI, the
// briefing hook and the tests share it. Apache-2.0.
//
// A row (one JSON object per line, one O_APPEND write each):
//   { v: 1, event: "attach" | "detach" | "end", bot: "b-…" | "session-…",
//     project: "<absolute main-checkout path>", terminal: "t…", core: "<hc core id>",
//     created_ms: <the terminal's hc created_ms>, machine: null | "<name>", at: "<ISO time>",
//     by: "start" | "attach" | "detach" | "sweep" | "import", reason?: "finished" | "moved" | "replaced" }
//
// The fold (foldAttach), over the rows in file order, keyed by (core, terminal, created_ms):
//   attach: ends any earlier binding of the same bot and any binding of the same key, then
//           binds the key to the row's bot;
//   detach: unbinds the key when it is bound to the row's bot (another bot's row is ignored);
//   end:    unbinds the key, whatever bot it held.
// What is left binds each bot to at most one key and each key to at most one bot. A binding
// is an attachment only once hc confirms it (confirmBindings): the core is this computer's
// (`hc server status` core.id), and `hc get <terminal>` is live with the same created_ms. A
// finished or vanished terminal reads as ended ("finished"), and a terminal id reused after
// an hc restart, a new created_ms, as ended too ("replaced"), before any end row is written.

export const ATTACH_FILE = "automagik-herdr/attach.jsonl";
export const attachPath = (appHome) => `${String(appHome).replace(/\/+$/, "")}/${ATTACH_FILE}`;

export const ATTACH_EVENTS = ["attach", "detach", "end"];
export const ATTACH_BY = ["start", "attach", "detach", "sweep", "import"];
export const ATTACH_REASONS = ["finished", "moved", "replaced"];
const BOT_SHAPE = /^(b-[a-z2-7]{10}|session-[A-Za-z0-9._-]+)$/;
// hc's addresses are `t7`, `t1b`; any one word without a slash (another machine's) is read.
const TERMINAL_SHAPE = /^[A-Za-z0-9._-]+$/;

/** The mode bits that make the file unsafe to read: group- or world-writable. */
export const UNSAFE_MODE = 0o022;
/** Why a ledger of `mode` (stat's mode) must not be read, or null. */
export function modeProblem(path, mode) {
  if (!(mode & UNSAFE_MODE)) return null;
  const octal = (mode & 0o777).toString(8).padStart(3, "0");
  return `${path} is group- or world-writable (mode ${octal}), so anyone could have written who plays which bot; `
    + `it was not read. Check its rows, then make it the owner's alone: chmod 600 ${path}`;
}

/** A row, its fields in the documented order; `reason` only when given. */
export function attachRow({ event, bot, project, terminal, core, created_ms, machine = null, by, reason, at }) {
  const row = { v: 1, event, bot, project: project ?? null, terminal, core, created_ms, machine: machine ?? null,
    at: new Date(at ?? Date.now()).toISOString(), by };
  if (reason) row.reason = reason;
  return row;
}

/** The row an end or detach of `binding` writes. */
export const closingRow = (binding, event, by, reason, at) => attachRow({ ...binding, event, by, reason, at });

export const attachLine = (row) => `${JSON.stringify(row)}\n`;

/** Whether `row` is one the fold reads: every field the key and the event need, well formed. */
export function validRow(row) {
  return Boolean(row) && typeof row === "object" && row.v === 1 && ATTACH_EVENTS.includes(row.event)
    && typeof row.bot === "string" && BOT_SHAPE.test(row.bot)
    && typeof row.terminal === "string" && TERMINAL_SHAPE.test(row.terminal)
    && typeof row.core === "string" && row.core !== ""
    && Number.isSafeInteger(row.created_ms)
    && (row.machine === null || row.machine === undefined || typeof row.machine === "string");
}

/** The rows of a ledger's text: { rows, skipped } (a torn or foreign line is skipped and counted). */
export function readAttach(text) {
  const rows = [];
  let skipped = 0;
  for (const line of String(text ?? "").split("\n")) {
    if (!line.trim()) continue;
    let row = null;
    try { row = JSON.parse(line); } catch { row = null; }
    if (validRow(row)) rows.push(row); else skipped += 1;
  }
  return { rows, skipped };
}

/** A binding's fold key. */
export const attachKey = ({ core, terminal, created_ms }) => `${core}\n${terminal}\n${created_ms}`;

/**
 * The fold (see the top of this file): { byBot: Map bot -> binding, byKey: Map key -> binding },
 * a binding being the attach row that made it.
 */
export function foldAttach(rows) {
  const byKey = new Map();
  const byBot = new Map();
  const unbind = (key) => {
    const b = byKey.get(key);
    if (!b) return;
    byKey.delete(key);
    if (byBot.get(b.bot) === b) byBot.delete(b.bot);
  };
  for (const row of rows) {
    if (!validRow(row)) continue;
    const key = attachKey(row);
    if (row.event === "attach") {
      const held = byBot.get(row.bot);
      if (held) unbind(attachKey(held));
      unbind(key);
      byKey.set(key, row);
      byBot.set(row.bot, row);
    } else if (row.event === "detach") {
      if (byKey.get(key)?.bot === row.bot) unbind(key);
    } else unbind(key);
  }
  return { byBot, byKey };
}

/**
 * Checks bindings against hc. `core` is this computer's core id; `ask(args)` resolves with
 * `hc <args> --json` parsed, null when hc says there is no such terminal, or `unanswered`
 * when it gave no answer (it may also throw: a failed hc never reads as "ended").
 * Resolves { live: [{ binding, get }], ended: [{ binding, reason }], unknown: [binding] }:
 * another core's or machine's row is ended ("finished": this core no longer runs it) unless
 * `machine` is set, which this pack never writes yet; those stay unknown.
 */
export async function confirmBindings(bindings, core, ask, unanswered = undefined) {
  const live = [];
  const ended = [];
  const unknown = [];
  await Promise.all(bindings.map(async (binding) => {
    if (binding.machine) { unknown.push(binding); return; }
    if (binding.core !== core) { ended.push({ binding, reason: "finished" }); return; }
    const get = await ask(["get", binding.terminal]);
    if (unanswered !== undefined && get === unanswered) { unknown.push(binding); return; }
    const verdict = verdictOf(binding, get);
    if (verdict === "live") live.push({ binding, get });
    else ended.push({ binding, reason: verdict });
  }));
  return { live, ended, unknown };
}

/** "live", "finished" (no terminal, or not live) or "replaced" (same id, another created_ms). */
export function verdictOf(binding, get) {
  if (!get || typeof get !== "object" || get.state !== "live") return "finished";
  if (get.created_ms !== binding.created_ms) return "replaced";
  return "live";
}
