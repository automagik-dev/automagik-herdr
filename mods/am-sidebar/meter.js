// The sidebar's usagemeter run (Group 6c): `usagemeter sync` once METER_FIRST_MS after load, then
// every METER_EVERY_MS while Herdr is open. No LaunchAgent and no daemon: Herdr's exec runs the
// one shared binary install.sh put in ~/.local/bin (Herdr started from the Dock may lack that
// folder on its PATH, so the path is absolute). One run at a time, never more often than
// usagemeter's own 10-minute freshness check: the start time is shared across sidebar copies,
// and a copy never starts a run while its last one is still going. A missing binary is silent.
// Pure: no `herdr` import (exec, the shared value and the clock are passed in), so `node --test`
// runs it; main.js wires it to Herdr's exec, shared and timer. Apache-2.0.

export const METER_FIRST_MS = 30_000;
export const METER_EVERY_MS = 10 * 60 * 1000;
/** The shared value (Herdr's shared/setShared) holding when the last run started (ms). */
export const METER_KEY = "am.sidebar.meter-started";

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
 * Resolves `{ ran, why?, code?, wait }`: wait is when to look again (ms).
 */
export async function syncMeter({ exec, now = Date.now, bin, get = () => null, set = () => {}, state = {} }) {
  if (state.busy) return { ran: false, why: "busy", wait: METER_EVERY_MS };
  const at = now();
  const last = Number(get(METER_KEY));
  const age = at - last;
  if (Number.isFinite(last) && last > 0 && age >= 0 && age < METER_EVERY_MS) return { ran: false, why: "fresh", wait: METER_EVERY_MS - age };
  state.busy = true;
  try { set(METER_KEY, at); } catch {}
  try {
    const result = await exec(bin, ["sync"]);
    return { ran: true, code: result?.code ?? null, wait: METER_EVERY_MS };
  } catch {
    return { ran: false, why: "missing", wait: METER_EVERY_MS };
  } finally {
    state.busy = false;
  }
}
