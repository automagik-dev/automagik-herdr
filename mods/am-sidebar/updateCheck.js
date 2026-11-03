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
 * Herdr. `command`: "apply" installs the latest release the same way (update.mjs apply, what
 * `automagik-herdr update` runs: checksum checked, the replaced set kept), with `extra`
 * ["--expect", v] so only the confirmed version goes in; pass no sleep then, a download takes as
 * long as it takes. Resolves `{ node, result }`, node null when none answered.
 */
export async function runCheck(exec, script, last = null, { mods = null, sleep = null, timeoutMs = EXEC_TIMEOUT_MS, command = "check", extra = [] } = {}) {
  const args = [script, command, ...extra, ...(mods ? ["--mods", mods] : [])];
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

// ---- The status bar's view of the check (am-status) ----
// Herdr refuses an import from another mod folder, so am-status can't run a check itself: the
// sidebar runs every check and every install, and the two talk through two shared values.
// STATE_KEY (written here): the last answer plus `busy`, the lock that keeps one check or install
// at a time across sidebar copies (Herdr runs mods on one thread, so a read then a write of a
// shared value can't interleave). REQUEST_KEY (written by am-status): "check now" or "install".

/** The last check or install, and `busy` while one runs: `{ kind, current, latest, update, why,
 *  at, request, applyError, from, busy: { what, since, id, request?, to? } | null }`. */
export const STATE_KEY = "am.update.state";
/** What am-status asks for: `{ id, what: "check" | "apply", at }`. */
export const REQUEST_KEY = "am.update.request";
/** A check holds the lock at most this long (every node timing out, plus slack), an install
 *  APPLY_STALE_MS: then a holder that was reloaded or closed mid-run no longer blocks the next. */
export const CHECK_STALE_MS = NODE_PATHS.length * EXEC_TIMEOUT_MS + 30_000;
export const APPLY_STALE_MS = 10 * 60_000;
/** A request older than this is dropped unanswered (a reload, or Herdr restarted with it saved). */
export const REQUEST_FRESH_MS = 2 * 60_000;

const objectOr = (value, fallback) => (value && typeof value === "object" && !Array.isArray(value) ? value : fallback);

/** The shared state as an object (`{}` when unset or not one). */
export const stateFrom = (value) => objectOr(value, {});

/** The lock in `state` while it is held and not stale at `now`, else null. */
export function busyOf(state, now) {
  const busy = objectOr(state?.busy, null);
  if (!busy || typeof busy.since !== "number" || typeof busy.id !== "string") return null;
  const stale = busy.what === "apply" ? APPLY_STALE_MS : CHECK_STALE_MS;
  return now - busy.since < stale ? busy : null;
}

/**
 * Takes the lock for one check or install (`what`), or returns null while another runs: one at a
 * time across every sidebar copy, whoever asked (the 4-hour timer, a reload, a click).
 * `get`/`set`: Herdr's shared/setShared. `extra` is kept on the lock (`request`, `to`).
 * Returns the lock's id, which `finish` needs.
 */
export function claim(get, set, what, now, extra = {}) {
  const state = stateFrom(get(STATE_KEY));
  if (busyOf(state, now)) return null;
  const id = `${what}-${now}-${Math.random().toString(36).slice(2, 8)}`;
  set(STATE_KEY, { ...state, busy: { ...extra, what, since: now, id } });
  return id;
}

/** Records a run's answer (`patch`) and frees the lock if `id` still holds it (a run whose lock
 *  went stale and was taken over records its answer but leaves the newer lock alone). */
export function finish(get, set, id, patch) {
  const state = stateFrom(get(STATE_KEY));
  const busy = objectOr(state.busy, null);
  set(STATE_KEY, { ...state, ...patch, busy: busy && busy.id !== id ? busy : null });
}

/** A check's answer as STATE_KEY fields: readCheck's kind (and update or why), plus the installed
 *  and latest versions update.mjs reported, when it did. */
export function checkPatch(result, now) {
  const check = readCheck(result);
  const answer = answerOf(result?.stdout) ?? {};
  const version = (v) => (typeof v === "string" && v !== "" ? v : null);
  return { kind: check.kind, update: check.update ?? null, why: check.why ?? null, current: version(answer.current),
    latest: version(answer.latest), at: now, applyError: null };
}

/**
 * An install's answer (`node update.mjs apply`) as STATE_KEY fields over the `state` before it:
 * `{ kind: "installed", from, current, latest }` when a release went in; the check's own answer
 * when there was nothing to install; else the state as it was with `applyError` (why it failed),
 * so the bar still offers the update.
 */
export function applyPatch(result, state, now) {
  const answer = answerOf(result?.stdout);
  const version = answer?.installed?.version;
  if (result?.code === 0 && typeof version === "string") {
    return { kind: "installed", from: answer.current ?? state.current ?? null, current: version, latest: version, update: null,
      why: null, applyError: null, at: now };
  }
  if (result?.code === 0 && answer?.refused) {
    // The latest moved on after the confirm: offer the new one, nothing installed.
    return { ...checkPatch(result, now), applyError: `${answer.refused.latest} is out now, not ${answer.refused.expected}: confirm again` };
  }
  if (result?.code === 0 && answer && !answer.error && answer.installed === null) return checkPatch(result, now);
  const why = typeof answer?.error === "string" ? answer.error : result ? `exit ${result.code}` : "node not found";
  return { applyError: why, at: now };
}

/** The install's notice: done (reload the mods to use it), or why it wasn't. */
export function applyNotice(patch) {
  if (patch.kind === "installed") {
    return { title: "Automagik Herdr updated", level: "success", body: `${patch.from ?? "?"} → ${patch.current}. The replaced pack is kept`
      + " (`automagik-herdr update --rollback` puts it back). Reload Herdr's mods to use it." };
  }
  if (patch.applyError) return { title: "Automagik Herdr not updated", level: "error", body: patch.applyError };
  return null;
}

/** Manual checks ("check now" in the status bar) at most once a minute: GitHub answers 60
 *  unauthenticated requests an hour. A click inside it is answered with the last check. */
export const MANUAL_CHECK_COOLDOWN_MS = 60_000;

/** True while a manual check would repeat one that finished less than the cooldown ago. */
export const coolingDown = (state, now) => typeof state?.at === "number" && now - state.at < MANUAL_CHECK_COOLDOWN_MS && now >= state.at;

/**
 * An install request against what the state offers: null when it may run, else why not. The
 * request carries the version the person confirmed (`to`); one that no longer matches the
 * offered update is refused, so the bar asks again with the new version.
 */
export function applyRefusal(request, state) {
  const offered = state?.kind === "update" ? (state.update?.version ?? state.latest ?? null) : null;
  const to = typeof request?.to === "string" && request.to !== "" ? request.to : null;
  if (!to) return "no confirmed version";
  if (!offered) return `nothing to install (the last check found no update over ${state?.current ?? "the installed pack"})`;
  if (to !== offered) return `${offered} is out now, not ${to}: confirm again`;
  return null;
}

/** What a request asks for ("check" | "apply") when it is new to this copy (`seen`: the last id it
 *  handled) and fresh at `now`, else null. */
export function requestDue(value, seen, now) {
  const r = objectOr(value, null);
  if (!r || typeof r.id !== "string" || r.id === seen || typeof r.at !== "number") return null;
  if (r.what !== "check" && r.what !== "apply") return null;
  return now - r.at <= REQUEST_FRESH_MS && r.at - now <= 5_000 ? r.what : null;
}
