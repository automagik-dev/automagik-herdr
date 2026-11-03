// The am-quota decision, over plain data: quota windows in, one handoff decision out.
//
// No `herdr`, no `fs`, no network — `node --test` runs it, and the panel and any CLI share it.
// The rules it encodes, from the owner's rulings:
//   • one active account per client; a switch is a handoff, never balancing;
//   • switch when the active account is projected to run dry BEFORE its window resets;
//   • spend the account whose window would otherwise be wasted: the one that resets soonest;
//   • a reset returns headroom and re-ranks the account; an account close to its reset is held
//     (its remaining headroom is saved for after the reset);
//   • no reserve: nothing is kept back.

export const DEFAULTS = {
  /** Hand off this long before the projected exhaustion, at the latest. */
  marginMinutes: 30,
  /** Don't move onto an account that rolls over within this distance: wait for its fresh window
   *  instead of spending a client restart on a window that is about to change. */
  holdMinutes: 15,
  /** Headroom below this is unusable. */
  floorHeadroom: 0.02,
  /** Burn is measured over samples no older than this. */
  maxSampleAgeMinutes: 120,
  /** With no burn history, assume this share of a window per hour (conservative). */
  defaultBurnPerHour: 0,
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const t = (v) => (typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) : NaN);

/** 1 for an unused window, 0 for an exhausted one. */
export function headroom(win) {
  const used = num(win?.used_percent);
  if (used === null) return null;
  return clamp(1 - used / 100, 0, 1);
}

/** Minutes until this window resets; negative when it already has. */
export function minutesToReset(win, now) {
  const at = t(win?.reset_at);
  return Number.isFinite(at) ? (at - now) / 60000 : null;
}

/** Burn in used-share per hour, from two samples of the same window id. */
export function burnPerHour(prev, curr, { maxSampleAgeMinutes = DEFAULTS.maxSampleAgeMinutes } = {}) {
  const a = num(prev?.used_percent), b = num(curr?.used_percent);
  const ta = t(prev?.at ?? prev?.fetched_at), tb = t(curr?.at ?? curr?.fetched_at);
  if (a === null || b === null || !Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  const hours = (tb - ta) / 3600000;
  if (!(hours > 0) || hours * 60 > maxSampleAgeMinutes) return null;
  const delta = (b - a) / 100;
  if (delta <= 0) return 0; // a reset or a flat window: no measurable burn
  return delta / hours;
}

/** Minutes until the window is dry at this burn rate; null without a rate. */
export function minutesToDry(win, ratePerHour) {
  const left = headroom(win);
  if (left === null) return null;
  if (left <= DEFAULTS.floorHeadroom) return 0;      // at the floor it is already unusable
  const rate = num(ratePerHour);
  if (rate === null) return null;                     // no history: nothing to project
  if (rate <= 0) return Infinity;                     // flat: it will not run dry on its own
  return (left / rate) * 60;
}

/** The window that binds an account now: closest to dry (highest used), then earliest reset. */
export function bindingWindow(account) {
  const windows = (account?.windows ?? []).filter((w) => headroom(w) !== null);
  if (!windows.length) return null;
  return [...windows].sort((a, b) => {
    const used = (num(b.used_percent) ?? 0) - (num(a.used_percent) ?? 0);
    if (used) return used;
    const ra = t(a.reset_at) || Number.POSITIVE_INFINITY;
    const rb = t(b.reset_at) || Number.POSITIVE_INFINITY;
    return ra - rb || String(a.id).localeCompare(String(b.id));
  })[0];
}

/** Whether the proxy currently considers this credential usable at all. */
export function usable(account) {
  if (!account || account.disabled) return false;
  if (account.requires_sign_in) return false;
  if (account.failed) return false;
  if (account.credential_state && account.credential_state !== "active") return false;
  if (account.status && account.status !== "active") return false;
  return true;
}

/**
 * The decision for one provider.
 *
 * accounts: [{ id, name, provider, status?, disabled?, failed?, requires_sign_in?, credential_state?,
 *              windows: [{ id, used_percent, reset_at }], previous?: { [windowId]: { used_percent, at } } }]
 * options: { provider, now, activeId, marginMinutes?, holdMinutes?, floorHeadroom?, maxSampleAgeMinutes? }
 *
 * `previous` is the account's earlier reading of the same window, supplied across polls by
 * `proxy.carrySamples` — without it there is no burn rate and nothing to project.
 *
 * Returns { action: "keep" | "switch" | "none", to, reason, facts }.
 */
export function choose(accounts, options = {}) {
  const now = num(options.now) ?? Date.now();
  const opts = { ...DEFAULTS, ...options };
  const provider = options.provider;
  const activeId = options.activeId ?? null;

  const mine = (accounts ?? []).filter((a) => !provider || a.provider === provider);
  const facts = [];
  const examined = mine.map((account) => {
    const win = bindingWindow(account);
    // The previous sample is the account's own earlier reading of this window; the current one is
    // this snapshot, taken at `now` (or the proxy's own observed_at when it gives one).
    const sampleAt = num(account.fetched_at) ?? account.fetched_at ?? now;
    const rate = win && account.previous?.[win.id]
      ? burnPerHour(account.previous[win.id], { ...win, at: sampleAt }, { maxSampleAgeMinutes: opts.maxSampleAgeMinutes })
      : null;
    const left = headroom(win);
    const reset = minutesToReset(win, now);
    const dry = minutesToDry(win, rate);
    const fact = {
      id: account.id,
      name: account.name ?? account.id,
      usable: usable(account),
      window: win?.id ?? null,
      headroom: left,
      minutesToReset: reset,
      burnPerHour: rate,
      minutesToDry: dry,
      held: reset !== null && reset <= opts.holdMinutes,
    };
    facts.push(fact);
    return { account, fact, win };
  });

  const byId = (id) => examined.find((e) => e.fact.id === id) ?? null;
  const active = activeId ? byId(activeId) : null;

  // Nothing to say about an account we cannot see.
  if (!examined.length) {
    return { action: "none", to: null, reason: "no accounts for this provider", facts };
  }

  // 1. An active account that cannot be used at all: switch at once.
  if (active && !active.fact.usable) {
    const pick = bestCandidate(examined, { active, now, opts });
    if (!pick) return { action: "none", to: null, reason: `${active.fact.name} is unusable and nothing else has headroom`, facts };
    return { action: "switch", to: pick.fact.id, reason: `${active.fact.name} is unusable; moving to ${pick.fact.name}`, facts };
  }

  // 2. An active account with no window: nothing to project, keep it.
  if (active && active.fact.window === null) {
    return { action: "keep", to: active.fact.id, reason: `${active.fact.name} reports no window to project`, facts };
  }

  // 3. Projected exhaustion before the reset (plus margin): hand off.
  if (active) {
    const dry = active.fact.minutesToDry;
    const reset = active.fact.minutesToReset;
    const due = dry !== null && reset !== null && dry <= reset + opts.marginMinutes;
    if (due) {
      const pick = bestCandidate(examined, { active, now, opts });
      if (!pick) {
        return {
          action: "none",
          to: null,
          reason: `${active.fact.name} runs dry before its reset and no other account has headroom`,
          facts,
        };
      }
      return {
        action: "switch",
        to: pick.fact.id,
        reason: `${active.fact.name} runs dry in ${Math.round(dry)}m, its reset is in ${Math.round(reset)}m; ${pick.fact.name} resets in ${Math.round(pick.fact.minutesToReset)}m`,
        facts,
      };
    }
    return {
      action: "keep",
      to: active.fact.id,
      reason: dry === null
        ? `${active.fact.name} has no burn history yet`
        : `${active.fact.name} lasts ${Math.round(dry)}m, resets in ${Math.round(reset)}m`,
      facts,
    };
  }

  // 4. No active account recorded: say which one the rule would pick.
  const pick = bestCandidate(examined, { active: null, now, opts });
  return pick
    ? { action: "switch", to: pick.fact.id, reason: `nothing is active; ${pick.fact.name} has the soonest reset with headroom`, facts }
    : { action: "none", to: null, reason: "no account has headroom", facts };
}

// The account to move to: usable, above the floor, not the active one. A held account (its reset
// is close) is only used when nothing else is left — its headroom is worth more after the reset.
// Among equals, the soonest reset wins: that is the window that would otherwise be wasted.
function bestCandidate(examined, { active, opts }) {
  const pool = examined.filter((e) =>
    e.fact.usable
    && e.fact.headroom !== null
    && e.fact.headroom > opts.floorHeadroom
    && e.fact.window !== null
    && (active === null || e.fact.id !== active.fact.id));
  if (!pool.length) return null;
  const order = (a, b) => {
    if (a.fact.held !== b.fact.held) return a.fact.held ? 1 : -1;
    const ra = a.fact.minutesToReset ?? Number.POSITIVE_INFINITY;
    const rb = b.fact.minutesToReset ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    if (a.fact.headroom !== b.fact.headroom) return b.fact.headroom - a.fact.headroom;
    return String(a.fact.id).localeCompare(String(b.fact.id));
  };
  return [...pool].sort(order)[0];
}
