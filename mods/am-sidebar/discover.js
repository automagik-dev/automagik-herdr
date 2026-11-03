// Bot discovery's schedule (bots.js discoverProjects), with no Herdr in it so it can be tested
// and timed apart: each machine's lookups run on their own, at most `limit` at once, this
// computer's first; a project is shown as soon as its machine has answered, and a machine
// that is slow or away holds back only its own projects. Apache-2.0.

/** Lookups in flight at once on one machine. */
export const DISCOVER_LIMIT = 8;
/** How long one call to another machine may take before that machine counts as away. */
export const CALL_TIMEOUT_MS = 5000;

/** The rejection of a call that took longer than its time (within). */
export class TimedOut extends Error {
  constructor(ms) { super(`no answer in ${ms} ms`); this.name = "TimedOut"; }
}

const id = (machine, key) => JSON.stringify([machine ?? null, key]);

/** A runner that starts at most `limit` of the functions handed to it at once, in that order. */
export function limiter(limit) {
  let active = 0;
  const queue = [];
  const next = () => {
    while (active < limit && queue.length) {
      const { fn, done, fail } = queue.shift();
      active += 1;
      Promise.resolve().then(fn).then(done, fail).finally(() => { active -= 1; next(); });
    }
  };
  return (fn) => new Promise((done, fail) => { queue.push({ fn, done, fail }); next(); });
}

/**
 * `p` (a promise or a value), or a TimedOut rejection once `sleep(ms)` resolves first (no
 * sleep, or no ms: no limit). `p` keeps running; its late rejection is swallowed.
 */
export function within(p, ms, sleep) {
  p = Promise.resolve(p);
  if (!sleep || !(ms > 0)) return p;
  p.catch(() => {});
  return Promise.race([p, sleep(ms).then(() => { throw new TimedOut(ms); })]);
}

/**
 * Every project with definitions, as bots.js discoverProjects returns them:
 * [{ key, machine, spaces, file, warnings }], in the order of the spaces (sidebar order),
 * then the remembered projects, then `listed` (this computer's); `spaces` the ids of the
 * spaces keyed to the project, in sidebar order.
 *   spaces: [{ id, folder, machine }], folder null: skipped (another machine's home);
 *   remembered: [{ key, machine }];
 *   io.listed() -> keys on this computer (never rejects);
 *   io.keyOf(folder, machine) -> key; a rejection skips the space this time (TimedOut: the
 *     machine is away; io.keyOf bounds its own calls, a lookup being several);
 *   io.read({ key, machine, remembered }) -> { file, warnings }, or null (not shown);
 *     rejects when the machine can't answer;
 *   io.last({ key, machine }) -> the last good { file, warnings }, or undefined.
 * A read that rejects or takes longer than `timeoutMs` (another machine only, timed with
 * `sleep`) shows io.last; after one call to a machine timed out, its other calls this time
 * don't wait. `onUpdate(list)` gets the list each time a machine is done but the last, a
 * project still being read showing io.last; the last list is the one returned.
 */
export async function discover({ spaces, remembered = [] }, io, { limit = DISCOVER_LIMIT, timeoutMs = CALL_TIMEOUT_MS, sleep = null, onUpdate = null } = {}) {
  const keyed = new Map(); // space index -> project key
  const read = new Map(); // project id -> { file, warnings } | null
  let listed = [];

  const assemble = () => {
    const found = new Map();
    const add = (key, machine, space) => {
      const k = id(machine, key);
      const p = found.get(k) ?? { key, machine: machine ?? null, spaces: [] };
      if (space) p.spaces.push(space);
      found.set(k, p);
    };
    spaces.forEach((s, i) => { if (keyed.has(i)) add(keyed.get(i), s.machine, s.id); });
    for (const p of remembered) add(p.key, p.machine, null);
    for (const key of listed) add(key, null, null);
    const out = [];
    for (const [k, p] of found) {
      const r = read.has(k) ? read.get(k) : io.last(p);
      if (r) out.push({ key: p.key, machine: p.machine, spaces: p.spaces, ...r });
    }
    return out;
  };

  const machines = [null, ...new Set([...spaces, ...remembered].map((s) => s.machine).filter(Boolean))];
  let left = machines.length;
  const side = async (machine) => {
    const run = limiter(limit);
    const remote = machine !== null;
    let away = false;
    // One call: its answer, else `fallback()` (the machine away, slow or saying no). A key
    // lookup is several calls in a row: io.keyOf times each itself (`timed` false).
    const call = (ask, fallback, timed = true) => run(async () => {
      if (away) return fallback();
      try { return await within(ask(), remote && timed ? timeoutMs : 0, sleep); } catch (e) {
        if (e instanceof TimedOut) away = true;
        return fallback();
      }
    });
    // Each project read once, as soon as its key is known (a slow lookup holds back no other
    // project's read).
    const kept = new Set(remembered.filter((p) => (p.machine ?? null) === machine).map((p) => p.key));
    const asked = new Set();
    const reads = [];
    const want = (key) => {
      const k = id(machine, key);
      if (asked.has(k)) return;
      asked.add(k);
      const p = { key, machine, remembered: kept.has(key) };
      reads.push(call(() => io.read(p), () => io.last(p) ?? null).then((r) => read.set(k, r ?? null)));
    };
    for (const key of kept) want(key);
    const cli = remote ? null : call(() => io.listed(), () => []).then((keys) => { listed = keys; for (const key of keys) want(key); });
    const mine = [];
    spaces.forEach((s, i) => { if ((s.machine ?? null) === machine && s.folder) mine.push(i); });
    await Promise.all([cli, ...mine.map((i) => call(() => io.keyOf(spaces[i].folder, machine), () => undefined, false)
      .then((key) => { if (typeof key === "string") { keyed.set(i, key); want(key); } }))]);
    await Promise.all(reads);
    left -= 1;
    if (onUpdate && left > 0) try { onUpdate(assemble()); } catch {}
  };
  await Promise.all(machines.map(side));
  return assemble();
}
