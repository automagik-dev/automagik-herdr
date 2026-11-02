// The mod's update check (A14) over plain data: which node runs `update.mjs check` (Herdr
// started from the Dock may lack /opt/homebrew/bin on its PATH), what its answer means, when
// to look again and what notice to post. A failed check is never an error to the user: it is
// "no update", tried again after RETRY_MS. Pure: no `herdr` import (exec is passed in), so
// `node --test` runs it; main.js wires it to Herdr's exec, timer and notify. Apache-2.0.

import { CHECK_EVERY_MS, FIRST_CHECK_MS, RETRY_MS, noticeText } from "./release.js";

export { CHECK_EVERY_MS, FIRST_CHECK_MS, RETRY_MS };

/** The shared value (Herdr's `shared`/`setShared`) holding the version already announced, so a
 *  mod reload or a second sidebar view doesn't announce it again. */
export const SHOWN_KEY = "am.sidebar.update-shown";

/** The announced version from the shared value, or null when it isn't one. */
export const shownFrom = (value) => (typeof value === "string" && value !== "" ? value : null);

/** How long one `node update.mjs check` may take before the next node is tried (ms). */
export const EXEC_TIMEOUT_MS = 30_000;
const TIMED_OUT = Symbol("timed out");

/** Where node is looked for, in order: PATH, then Homebrew on Apple silicon, then on Intel. */
export const NODE_PATHS = Object.freeze(["node", "/opt/homebrew/bin/node", "/usr/local/bin/node"]);

/** NODE_PATHS, with the one that worked last time first. */
export function nodeOrder(last = null) {
  return last && NODE_PATHS.includes(last) ? [last, ...NODE_PATHS.filter((p) => p !== last)] : [...NODE_PATHS];
}

// update.mjs prints one JSON line; the last line that parses as an object is its answer.
function answerOf(stdout) {
  const lines = String(stdout ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const v = JSON.parse(lines[i]);
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
    } catch {}
  }
  return null;
}

/**
 * Runs `<node> <script> check [--mods <mods>]` with the first node that starts and answers.
 * `exec(command, args)` resolves `{ code, stdout, stderr }` and rejects when the program can't
 * start (Herdr's exec). A node that starts but gives no answer of update.mjs's (too old to load
 * it, say), or takes longer than `timeoutMs`, is passed over too. `sleep(ms)` resolves after
 * ms (the mod builds it on Herdr's timer, which has no setTimeout); without it nothing is timed.
 * `mods`: the app home's mods folder, so update.mjs reads the installed version from the same
 * Herdr. Resolves `{ node, result }`, node null when none answered.
 */
export async function runCheck(exec, script, last = null, { mods = null, sleep = null, timeoutMs = EXEC_TIMEOUT_MS } = {}) {
  const args = [script, "check", ...(mods ? ["--mods", mods] : [])];
  let fallback = null;
  for (const node of nodeOrder(last)) {
    let result;
    try {
      const run = exec(node, args);
      result = sleep ? await Promise.race([run, sleep(timeoutMs).then(() => TIMED_OUT)]) : await run;
    } catch { continue; }
    if (result === TIMED_OUT) continue;
    if (answerOf(result?.stdout)) return { node, result };
    fallback ??= { node: null, result };
  }
  return fallback ?? { node: null, result: null };
}

/**
 * What a check's result means: `{ kind: "update", update }`, `{ kind: "current" }`,
 * `{ kind: "off" }` (AUTOMAGIK_HERDR_NO_UPDATE set where update.mjs runs), or
 * `{ kind: "retry", why }` for anything else: no node, a non-zero exit, no answer, an
 * `{ error }` answer (the network down, GitHub refusing).
 */
export function readCheck(result) {
  if (!result) return { kind: "retry", why: "node not found" };
  const answer = answerOf(result.stdout);
  if (result.code !== 0 || !answer) return { kind: "retry", why: answer?.error ?? `exit ${result.code}` };
  if (typeof answer.error === "string") return { kind: "retry", why: answer.error };
  if (answer.disabled === true) return { kind: "off" };
  const u = answer.update;
  if (u && typeof u.version === "string" && typeof u.page === "string") return { kind: "update", update: u };
  return { kind: "current" };
}

/** How long until the next check (ms), or null for none (updates are off). */
export function nextCheckIn(kind) {
  if (kind === "off") return null;
  return kind === "retry" ? RETRY_MS : CHECK_EVERY_MS;
}

/** The notice for a check, once per version: null when there is no update or it was shown
 *  (`shownVersion`: shownFrom(shared(SHOWN_KEY)), kept across reloads and views). */
export function noticeFor(check, shownVersion = null) {
  if (check?.kind !== "update" || check.update.version === shownVersion) return null;
  return { title: "Automagik Herdr update", body: noticeText(check.update), level: "info" };
}

/**
 * Posts a check's notice once per version across reloads and sidebar views: reads the
 * announced version with `get(SHOWN_KEY)`, and when the check found a newer one, stores it
 * with `set(SHOWN_KEY, version)` and posts the notice. The mod passes Herdr's shared,
 * setShared and notify. Returns the notice posted, or null.
 */
export function announce(check, get, set, notify) {
  const note = noticeFor(check, shownFrom(get(SHOWN_KEY)));
  if (!note) return null;
  set(SHOWN_KEY, check.update.version);
  notify(note);
  return note;
}
