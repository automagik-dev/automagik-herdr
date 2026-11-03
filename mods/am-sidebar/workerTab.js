// A click on a bot's helper or worker row in the sidebar: its pane when it has one; else it
// opens as a tab in its bot's space, right after the bot's own tab, named after the worker.
// No bot pane, or a terminal on another machine: a peek, as before. Pure: no `herdr` or
// `gpui-*` import; the view passes run, panes, spaces, hc and sleep in, so tests use fakes.
// Apache-2.0.

const local = (id) => String(id ?? "").split("/").pop();

/** A worker's tab name: its branch when it has one, else its row name (hc name first). */
export const workerTabName = (helper) => helper?.branch || helper?.name || helper?.terminal || null;

/**
 * The worker a sidebar row's click is about, or null: a helper row's helper under its bot's
 * live terminal; a live bot row's own terminal under its hc parent, named after the bot. A
 * member bot started by another bot's agent (a captain under the main bot) is that agent's
 * worker too, so a click without a pane opens it as a tab after its starter's tab.
 */
export function rowWorker(r) {
  if (r?.kind === "helper") return { terminal: r.helper.terminal, botTerminal: r.ownerTerminal ?? null, name: workerTabName(r.helper) };
  const live = r?.node?.planned ? null : r?.node?.live;
  if (!live?.terminal) return null;
  return { terminal: live.terminal, botTerminal: live.parent ?? null, name: r.node.bot?.name || live.terminal };
}

/**
 * What a helper row's click does. `terminal`: the helper; `botTerminal`: its bot's live
 * terminal (null: none); `panes` / `spaces`: panes() and spaces() rows, read at click time.
 * { kind: "focus" } when a pane shows it; { kind: "open", space, tab, index, name } when its
 * bot has a pane in a space here (`tab` the bot's tab, `index` the slot after it, from 1);
 * else { kind: "peek" } (another machine's terminal, a bot without a pane or space).
 */
export function workerClick({ terminal, botTerminal, name, panes, spaces }) {
  const ps = panes ?? [];
  if (ps.some((p) => p?.terminal === terminal)) return { kind: "focus", terminal };
  const peek = { kind: "peek", terminal };
  if (String(terminal).includes("/")) return peek;
  const bot = botTerminal ? ps.find((p) => p?.terminal === botTerminal) : null;
  const space = bot ? (spaces ?? []).find((s) => (s?.tabs ?? []).some((t) => t.id === bot.tab)) : null;
  if (!space) return peek;
  const tab = space.tabs.find((t) => t.id === bot.tab);
  return { kind: "open", terminal, space: space.id, tab: tab.id, index: tab.index + 1, name: name || null };
}

/**
 * The commands once the kept worker has its pane: its tab moved after the bot's tab (that
 * tab's index read again now; not when the pane landed in another space, as tab.move stays
 * in one), renamed, and the worker focused. Neither move nor rename when the pane landed in
 * the bot's own tab: that tab keeps its name. Plus the `hc label` words that mark the tab as
 * the worker's (herdr.space / herdr.tab, ids local to its machine), both from where the pane
 * is now; null when no space holds its tab, so a pair never contradicts itself.
 */
export function keptSteps(plan, pane, spaces) {
  const holder = (spaces ?? []).find((s) => (s?.tabs ?? []).some((t) => t.id === pane.tab));
  const steps = [];
  if (pane.tab !== plan.tab) {
    const botTab = holder?.id === plan.space ? holder.tabs.find((t) => t.id === plan.tab) : null;
    if (botTab) steps.push(["tab.move", { id: pane.tab, index: botTab.index + 1 }]);
    if (plan.name) steps.push(["tab.rename", { id: pane.tab, name: plan.name }]);
  }
  steps.push(["agent.focus", { terminal: plan.terminal }]);
  const label = holder ? ["label", plan.terminal, `herdr.space=${local(holder.id)}`, `herdr.tab=${local(pane.tab)}`] : null;
  return { steps, label };
}

/**
 * Opens a worker as a tab: its bot's space and tab selected, terminal.keep with place "tab"
 * (keep finishes in the background), then, once panes() shows it (polled every `stepMs`,
 * at most `waitMs`), keptSteps' commands and label. Returns the new tab's id, or null when
 * no pane came in time: a notice says the tab is still opening (Herdr toasts a failed keep;
 * a late one stays where Herdr put it, with Herdr's name).
 */
export async function openWorkerTab(plan, { run, panes, spaces, hc, sleep, notify, waitMs = 5000, stepMs = 250 }) {
  run("space.select", { id: plan.space });
  run("tab.select", { id: plan.tab });
  run("terminal.keep", { terminal: plan.terminal, place: "tab" });
  for (let waited = 0; ; waited += stepMs) {
    const pane = (panes() ?? []).find((p) => p?.terminal === plan.terminal);
    if (pane) {
      const { steps, label } = keptSteps(plan, pane, spaces());
      for (const [command, args] of steps) run(command, args);
      if (label) try { await hc(label); } catch { /* the tab is open; the label is a marker only */ }
      return pane.tab;
    }
    if (waited >= waitMs) {
      try {
        notify?.({ title: "Worker tab still opening", body: `${plan.name || plan.terminal} will appear when Herdr has kept it.`, level: "info", timeout: 5000 });
      } catch { /* a notice only */ }
      return null;
    }
    await sleep(stepMs);
  }
}
