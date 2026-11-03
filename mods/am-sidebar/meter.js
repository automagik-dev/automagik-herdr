// The sidebar's usagemeter run (Group 6c): `usagemeter sync` once METER_FIRST_MS after load, then
// every METER_EVERY_MS while Herdr is open. No LaunchAgent and no daemon: Herdr's exec runs the
// one shared binary install.sh put in ~/.local/bin (Herdr started from the Dock may lack that
// folder on its PATH, so the path is absolute). One run at a time, never more often than
// usagemeter's own 10-minute freshness check: the start time is shared across sidebar copies,
// and a copy never starts a run while its last one is still going. A missing binary is silent.
// Then the same on each connected linked machine (SYNC through exec's `on`), one at a
// time: each machine's sync writes its own `herdr-meter` doc, which the phone reads there.
// Pure: no `herdr` import (exec, the shared value and the clock are passed in), so `node --test`
// runs it; main.js wires it to Herdr's exec, shared and timer. Apache-2.0.

export const METER_FIRST_MS = 30_000;
export const METER_EVERY_MS = 10 * 60 * 1000;
/**
 * The most one linked machine's sync may take (Herdr's exec ends a program at 30 s too): a machine
 * that hangs past it is left behind, the run goes on to the next one and ends, and the next run
 * is scheduled as usual. Timed with the caller's `sleep(ms)` (a mod has no timer functions: main.js
 * builds it on cx.timer, launch.js sleepOf); without one, only Herdr's own cap applies.
 */
export const METER_EXEC_LIMIT_MS = 30_000;
const TIMED_OUT = Symbol("timed out");

/** The shared value (Herdr's shared/setShared) holding when the last run started (ms). */
export const METER_KEY = "am.sidebar.meter-started";

/** Run as `sh -c SYNC` on a linked machine: its own usagemeter sync; no binary there is silent. */
export const SYNC = `m=$HOME/.local/bin/usagemeter
[ -x "$m" ] || exit 0
exec "$m" sync`;

/**
 * The linked machines a run syncs: the connected ones of `hc machine ls` (the sidebar's list, no
 * temporary ones) when the person agreed to all of them (meterFleet.js meterScope `all`); else only
 * those `owned` names (the record's usagemeter-machines: a `meter install --machine M` put it
 * there), and none at all with `none`.
 */
export const syncTargets = (machines, scope = null, owned = []) => (scope === "none" ? [] : (machines ?? [])
  .filter((m) => m && m.state === "connected" && !m.temporary && typeof m.name === "string" && m.name)
  .filter((m) => scope === "all" || owned.includes(m.name)).map((m) => m.name));

/** The one shared usagemeter path, under the person's home (Herdr's `home()`). */
export const meterBin = (home) => `${home}/.local/bin/usagemeter`;

/**
 * One due `usagemeter sync`: `exec(bin, ["sync"])` (Herdr's exec: resolves `{ code, stdout,
 * stderr }`, rejects when the program can't start), unless this copy's run is still going
 * (`state.busy`) or a run started less than METER_EVERY_MS ago (`get(METER_KEY)`, from any copy).
 * The start is stored with `set(METER_KEY, now())` before the run, so a second caller in the
 * meantime finds it fresh. No timeout of its own: Herdr's exec gives a program at most 30 s, and
 * usagemeter ends itself within its 20-second budget; a copy never starts a second run while one
 * it started is still going.
 * `machines`: the connected linked machines to sync after this computer, one at a time, within the
 * same run (`exec("sh", ["-c", SYNC], { on })`; a rejection or a failure there is silent), each
 * within METER_EXEC_LIMIT_MS when `sleep` (the caller's timer) is given.
 * Resolves `{ ran, why?, code?, on?, wait }`: wait is when to look again (ms); on: { machine: code,
 * null when it could not run, "timed out" past the limit }.
 */
export async function syncMeter({ exec, now = Date.now, bin, get = () => null, set = () => {}, state = {}, machines = [], sleep = null }) {
  if (state.busy) return { ran: false, why: "busy", wait: METER_EVERY_MS };
  const at = now();
  const last = Number(get(METER_KEY));
  const age = at - last;
  if (Number.isFinite(last) && last > 0 && age >= 0 && age < METER_EVERY_MS) return { ran: false, why: "fresh", wait: METER_EVERY_MS - age };
  state.busy = true;
  try { set(METER_KEY, at); } catch {}
  try {
    let here;
    try {
      const result = await exec(bin, ["sync"]);
      here = { ran: true, code: result?.code ?? null, wait: METER_EVERY_MS };
    } catch {
      here = { ran: false, why: "missing", wait: METER_EVERY_MS };
    }
    if (!machines.length) return here;
    const on = {};
    for (const machine of machines) {
      try {
        const run = exec("sh", ["-c", SYNC], { on: machine });
        const r = await (sleep ? Promise.race([run, sleep(METER_EXEC_LIMIT_MS).then(() => TIMED_OUT)]) : run);
        on[machine] = r === TIMED_OUT ? "timed out" : r?.code ?? null;
      } catch { on[machine] = null; }
    }
    return { ...here, on };
  } finally {
    state.busy = false;
  }
}
