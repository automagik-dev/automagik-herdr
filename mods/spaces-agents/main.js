// Workspace spaces: stable colored avatars, worktrees under their checkout,
// grouped by machine when more than one is known. After a space's name, the repo
// its first terminal is in now, only where unusual: branch, ahead/behind. Click to
// switch, right-click for its menu, drag to reorder. Under each space, its agents
// as the agents list names them (sub-agents beneath); click one to focus it.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, machines, panes, agents, terminals, focused, setAgentOrder, run, openOverlay, exec, hc, theme, shared, setShared, watchFolder, window, nextCommand, readTextFile, appHome, knownAgents, notify } from "herdr";
import * as fs from "fs/promises";
import { isPng, keysFor, remote } from "./paste.js";
import { command } from "./argv.js";

// Agent naming, as in the agents mod.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
function lead(tab, all) {
  const mine = all.filter(p => p.tab === tab.id && p.terminal);
  return mine.find(p => p.program?.agent) ?? mine.find(p => p.focused) ?? mine[0];
}
function title(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  const telling = live && live !== prog && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return tab.name === prog && telling ? live : tab.name;
}
// A sub-agent without a pane isn't in agents(): its raw word, error counting as blocked.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}
// The clipboard holds an image and no text: its type list only, never its contents.
// The clipboard image, as a PNG checked by its bytes, put beside `address` on its machine
// and its path typed there (no Enter). Any failure says so and pastes nothing else:
// the native paste would send the image as it is (often TIFF).
async function pngPaste(address) {
  const dir = `${appHome()}/paste-tmp`;
  const file = `${dir}/paste-${Date.now()}.png`;
  try {
    await fs.mkdir(dir, { recursive: true });
    const r = await exec("osascript", ["-l", "JavaScript", `${appHome()}/mods/spaces-agents/clipboard-png.jxa`, file]);
    if (r.code !== 0) throw new Error("Couldn't turn the clipboard image into a PNG.");
    if (!isPng(await fs.readFile(file))) throw new Error("The converted image isn't a PNG.");
    const put = await hc(["put", "--json", address, file]);
    if (put.code !== 0) throw new Error(`Couldn't send the PNG to ${address}.`);
    const landed = JSON.parse(put.stdout).path;
    const keys = keysFor(landed);
    if (!keys) throw new Error(`The PNG is at ${landed} on ${address.split("/")[0]}, but that path can't be typed.`);
    const k = await hc(["keys", address, ...keys]);
    if (k.code !== 0) throw new Error(`The PNG is at ${landed}, but typing its path failed.`);
  } catch (e) {
    notify({ title: "Image not pasted", body: e?.message ?? String(e), level: "warning", timeout: 6000 });
  } finally {
    await fs.unlink(file).catch(() => {});
  }
}

async function imageOnly() {
  try {
    const r = await exec("osascript", ["-e", "clipboard info"]);
    const info = r.stdout;
    const pic = /«class (PNGf|TIFF|JPEG|GIFf|8BPS|BMP )»|TIFF picture|JPEG picture|GIF picture/.test(info);
    const text = /(^|, )(string|Unicode text|«class utf8»|«class ut16»)(?=,|$)/.test(info);
    return r.code === 0 && pic && !text;
  } catch { return false; }
}

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
const rowHeight = ({ tree }) => (tree ? 28 : 30);
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;

// What a stored color name looks like on an avatar (the same in every mod
// that draws space avatars): one strong color per hue, light and dark alike.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

export default class Spaces extends View {
  init(_props, cx) {
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Set(); // local repos' git folders
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null;
    this.over = null;
    this.machines = [];
    this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
    this.refreshMachines(cx);
    // Hermes reports no status to the core: read its screen for the question footer.
    this.screen = {}; // terminal address -> "blocked" | null
    cx.timer.every(2500, (cx) => this.scanHermes(cx));
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // `git status` walks the whole tree, on another machine a process there:
    // only when its answer could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
    // Cmd+V ("spaces-agents.paste") and Ctrl+V ("spaces-agents.paste_image"). An image
    // alone, into a terminal on another machine: sent there as a real PNG (pngPaste).
    // Otherwise as before: Cmd+V pastes text, or gives a local agent its Ctrl+V for an
    // image; Ctrl+V stays terminal.paste_image. The terminal is the one focused at the key.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "paste" || c === "paste_image") {
          const address = focused()?.terminal;
          const image = await imageOnly();
          if (image && remote(address)) await pngPaste(address);
          else run(c === "paste" && !image ? "terminal.paste" : "terminal.paste_image", {});
        }
        cx.notify();
      }
    });
    // Names for terminals listed though they report no status: sidebar-agents.json, by
    // full address ({name, program, tab}). Saving it reloads this mod.
    this.extra = {};
    // Hermes's own icon from the program table (its process shows as Python).
    this.hermes = { key: "hermes", name: "Hermes", icon: "icons/hermes.svg", tint: true };
    cx.spawn(async (cx) => {
      try { this.extra = JSON.parse((await readTextFile(`${appHome()}/mods/spaces-agents/sidebar-agents.json`)) ?? "{}"); } catch { this.extra = {}; }
      try { this.known = await knownAgents(); this.hermes = this.known.find((a) => a.key === "hermes" && a.icon) ?? this.hermes; } catch {}
      cx.notify();
    });
  }

  // The core terminal behind a pane: by address; else, for a machine renamed in the app
  // whose terminals still carry its old name (server/t2 behind hx470/t2), the one with
  // the same local id and the core's own herdr.tab label for that pane's tab.
  coreTerminal(p) {
    if (!p?.terminal) return null;
    const exact = this.all.find((k) => k.address === p.terminal);
    if (exact || !p.terminal.includes("/")) return exact ?? null;
    const local = (id) => (id ?? "").split("/").pop();
    const names = new Set(machines().map((m) => m.name).filter(Boolean));
    const hits = this.all.filter((k) => k.address?.includes("/") && !names.has(k.address.split("/")[0])
      && local(k.address) === local(p.terminal) && k.labels?.["herdr.tab"] === local(p.tab));
    return hits.length === 1 ? hits[0] : null;
  }

  // Agents agents() misses because of that rename: their pane joins no terminal there.
  // Shown with the core's own reported status; never one that reports nothing.
  aliased(ps) {
    const listed = new Set(this.agentList.map((a) => a.address));
    const listedPanes = new Set(this.agentList.map((a) => a.pane));
    const spaceOf = new Map(spaces().flatMap((s) => (s.tabs ?? []).map((c) => [c.id, s])));
    return ps.flatMap((p) => {
      if (!p.terminal || listed.has(p.terminal) || listedPanes.has(p.pane)) return [];
      const k = this.coreTerminal(p);
      if (!k || k.address === p.terminal || k.state !== "live" || !k.report?.app) return [];
      if (!["working", "blocked", "idle", "done"].includes(k.status)) return [];
      const s = spaceOf.get(p.tab);
      const app = k.report.app;
      const program = (this.known ?? []).find((x) => x.key === app || app.startsWith(`${x.key}-`)) ?? p.program;
      return [{ alias: true, core: k.address, address: p.terminal, pane: p.pane, tab: p.tab, status: k.status, app,
        program, focused: p.focused, title: p.title, space: s?.id, space_name: s?.name ?? "", seq: 0 }];
    });
  }

  // Hermes terminals agents() leaves out (they report no status): live, with a pane,
  // and Hermes by their argv, never by a title. Their status is unknown, never guessed.
  // Name: sidebar-agents.json's, else the tab's name, else the pane's title.
  extras(ps) {
    const listed = new Set(this.agentList.map((a) => a.address));
    const listedPanes = new Set(this.agentList.map((a) => a.pane));
    const tabs = new Map(spaces().flatMap((s) => s.tabs ?? []).map((c) => [c.id, c]));
    const rows = ps.flatMap((p) => {
      if (!p.terminal || listed.has(p.terminal) || listedPanes.has(p.pane)) return [];
      const core = this.coreTerminal(p);
      const term = core?.state === "live" ? core : null;
      if (command(term?.argv) !== "hermes") return [];
      const e = this.extra[p.terminal];
      const named = e?.name && (!e.tab || e.tab === p.tab) ? e.name : null;
      return [{ extra: true, address: p.terminal, pane: p.pane, tab: p.tab, named, status: this.screen?.[p.terminal] ?? null, program: this.hermes, focused: p.focused }];
    });
    // A tab's name says which only when it holds one of them.
    const perTab = {};
    for (const r of rows) perTab[r.tab] = (perTab[r.tab] ?? 0) + 1;
    for (const r of rows) {
      const tab = tabs.get(r.tab)?.name;
      const tabName = tab && !/^\d+$/.test(tab) && perTab[r.tab] === 1 ? tab : null;
      const p = ps.find((x) => x.pane === r.pane);
      r.name = r.named ?? tabName ?? (clean(p?.title) || tab || this.hermes.name);
    }
    return rows;
  }

  // The agents mod's status marks.
  status(t, a) {
    const color = t[a.status] ?? t.dim;
    if (a.status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    if (a.status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none().rounded(4).bg(a.status === "done" ? color : t.dim + "00");
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  kids(addr, lines = []) {
    const kids = this.all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [{ k, lines: [...lines, last ? "└" : "├"] }, ...this.kids(k.address, [...lines, last ? "" : "│"])];
    });
  }

  // A space's agents, in agents() order, then their sub-agents.
  agentRows(w, tree, t) {
    const tabs = new Set((w.tabs ?? []).map((c) => c.id));
    const indent = tree ? 44 : 20;
    const shown = focused()?.agent;
    return [...this.agentList, ...this.extraList].filter((a) => tabs.has(a.tab)).flatMap((a) => {
      if (!a.extra) this.order.push(a.address);
      const pic = icon(a.program, 14, t.foreground);
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      const idle = a.status === "idle" && !a.focused;
      const row = h_flex().id(`ag-${a.address}`).h(26).flex_none().pl(indent).pr(8).gap(8).items_center().rounded(8).text_size(12.5)
        .cursor_pointer()
        .when(a.focused, (el) => el.bg(t.selected))
        .when(!a.focused, (el) => el.hover((s) => s.bg(t.hover)))
        // Not in agents() (no status, or a renamed machine): agent.focus wouldn't know it; its pane does.
        .on_click(() => (a.extra || a.alias ? run("pane.focus", { pane: a.pane }) : run("agent.focus", { terminal: a.address })))
        .when(Boolean(pic), (el) => el.child(pic))
        .child(div().flex_1().min_w(0).truncate().text_color(idle ? t.muted : t.foreground).child(a.extra ? a.name : this.agentName(a)))
        .when(Boolean(machine), (el) => el.child(div().flex_none().text_size(10).text_color(t.dim).child(machine)))
        .child(a.extra && !a.status
          ? div().id(`unknown-${a.address}`).size(7).mx(3).flex_none().rounded(4).bg(t.unknown).tooltip("No status reported")
          : this.status(t, a));
      const subs = this.kids(a.core ?? a.address).map(({ k, lines }) => {
        const on = k.address === shown;
        const kpic = icon(k.program, 13, t.foreground);
        return h_flex().id(`sub-${k.address}`).h(24).flex_none().pl(indent + 4).pr(8).items_center().rounded(8).text_size(12)
          .cursor_pointer()
          .when(on, (el) => el.bg(t.raised))
          .hover((s) => s.bg(t.hover))
          .on_click(() => run("agent.focus", { terminal: k.address }))
          .children(lines.map((l) => div().self_start().mt(-4).w(8).h(16).mr(3).flex_none()
            .when(Boolean(l), (el) => el.border_l(1.5).border_color(t.input))
            .when(l === "└" || l === "├", (el) => el.border_b(1.5).rounded_bl(6))))
          .when(Boolean(kpic), (el) => el.child(div().mr(7).child(kpic)))
          .child(div().flex_1().min_w(0).truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address))
          .child(this.status(t, { status: kidStatus(k, this.listed) }));
      });
      return [row, ...subs];
    });
  }

  // The agents list's grouped-view name: a tab someone named or the agent's own
  // title; an automatic tab number only when two of a space's rows would read the same.
  prepareAgents() {
    this.all = terminals();
    const ps = panes();
    this.agentList = agents();
    this.agentList = [...this.agentList, ...this.aliased(ps)];
    this.listed = new Map(this.agentList.map((a) => [a.address, a.status]));
    this.order = [];
    this.extraList = this.extras(ps);
    const tabs = spaces().flatMap((s) => s.tabs ?? []);
    const label = (a) => {
      const tab = tabs.find((tab) => tab.id === a.tab);
      return tab ? title(tab, lead(tab, ps)) : a.title || a.program?.name || "";
    };
    const labels = new Map(this.agentList.map((a) => [a.address, label(a)]));
    const detail = new Map(this.agentList.map((a) => [a.address, /^\d+$/.test(labels.get(a.address)) ? null : labels.get(a.address)]));
    const seen = {};
    for (const a of this.agentList) { const k = `${a.space_name}\u0000${detail.get(a.address) ?? ""}`; seen[k] = (seen[k] ?? 0) + 1; }
    for (const a of this.agentList) if (detail.get(a.address) == null && seen[`${a.space_name}\u0000`] > 1) detail.set(a.address, labels.get(a.address));
    // Two of a space's rows still reading the same (one tab's split): each its own title.
    for (const a of this.agentList) {
      const d = detail.get(a.address), own = clean(a.title);
      if (d != null && own && seen[`${a.space_name}\u0000${d}`] > 1) detail.set(a.address, own);
    }
    this.agentName = (a) => {
      const l = labels.get(a.address);
      return detail.get(a.address) ?? (/^\d+$/.test(l) ? a.program?.name || l : l);
    };
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id))) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  scanHermes(cx) {
    const rows = (this.extraList ?? []).filter((a) => a.extra);
    if (!rows.length || this.scanning) return;
    this.scanning = true;
    cx.spawn(async (cx) => {
      try {
        const next = {};
        await Promise.all(rows.map(async (a) => {
          try {
            const r = await hc(["read", a.address]);
            if (r.code !== 0) return;
            const tail = r.stdout.split("\n").slice(-14).join("\n");
            // Hermes's clarify/ask footer: "0/1 answered · ↑/↓ select · Enter confirm".
            next[a.address] = /\d+\/\d+ answered\b.*(select|confirm)/.test(tail) ? "blocked" : null;
          } catch {}
        }));
        const changed = JSON.stringify(next) !== JSON.stringify(this.screen);
        this.screen = next;
        if (changed) cx.notify();
      } finally { this.scanning = false; }
    });
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        for (const key of keys) await this.check(key, cx);
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // No optional locks: a status that touched the index would wake the watch again.
      const r = await exec("git", ["--no-optional-locks", "status", "--porcelain=v2", "--branch"], { cwd, on });
      if (r.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.stderr)) this.unsure.add(key);
        this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
      const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on });
      const repo = common.stdout.trim();
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const info = { name, branch: null, ahead: 0, behind: 0, repo: JSON.stringify([on, repo]), linked: repo !== `${top.stdout.trim()}/.git` };
      for (const line of r.stdout.split("\n")) {
        if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
        else if (line.startsWith("# branch.ab ")) {
          const [a, b] = line.slice(12).split(" ");
          info.ahead = Math.abs(parseInt(a, 10)) || 0;
          info.behind = Math.abs(parseInt(b, 10)) || 0;
        }
      }
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }

  menu(w) {
    // A popup is as tall as its items; height is only the most.
    openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: w.id } } });
  }

  // Spaces in order, each worktree space moved under its main checkout's.
  ordered() {
    const sp = spaces(), ps = panes();
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null })).filter((r) => this.shown.has(r.w.id));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of list) {
      if (nested(r)) continue;
      out.push({ ...r, tree: null });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
      kids.forEach((k, n) => out.push({ ...k, tree: n === kids.length - 1 ? "└─" : "├─" }));
    }
    return out;
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t, collapsed) {
    const rows = this.ordered();
    // A space's row, then (expanded) its agents beneath it.
    const draw = (r) => (collapsed ? [this.compact(r, t)] : [this.row(r, t), ...this.agentRows(r.w, r.tree, t)]);
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name)])].sort();
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || spaces().some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = m => div().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(8).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    if (!remote.length) return loading(null) && !rows.length ? [loadingRow(null)] : rows.flatMap(draw);
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const machine = this.machines.find(k => k.name === m);
      const connected = !m || machine?.state === "connected";
      const folded = this.folded.has(m);
      const head = h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(collapsed ? 2 : 8).gap(7).items_center().text_size(11).text_color(t.dim)
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => {
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).flex_none())
        .when(!collapsed, el => el.child(div().flex_1().truncate().child(m ?? "This computer"))
          .when(!connected, el => el.child(div().flex_none().child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).rounded(4).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", m ? { machine: m } : {}); }).child("+")))
          .child(div().size(6).rounded(3).flex_none().bg(connected ? t.ansi2 : t.dim))
          .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none()));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(8).gap(7).items_center().rounded(7)
        .text_size(12).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => run("space.new", m ? { machine: m } : {}))
        .child(svg("mods/workspace-chrome/plus.svg").size(12)).when(!collapsed, el => el.child("New space there"));
      return [head, ...(folded ? [] : mine.length ? mine.flatMap(draw) : [loading(m) ? loadingRow(m) : empty])];
    });
  }

  // Only what's unusual, after the name: "herdr \u00b7 spike \u21912 \u21931". The repo or
  // branch goes when the name already says it (a worktree is named after its branch),
  // and master/main go: nearly every space is on one.
  gitTail(g, tree, name, t) {
    const raw = g.branch ?? "detached";
    const same = (a) => a.toLowerCase() === name.toLowerCase();
    const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
    const repo = tree || same(g.name) ? "" : g.name;
    const where = [repo, branch].filter(Boolean).join(" \u00b7 ");
    return h_flex()
      .flex_1()
      .min_w(0)
      .gap(5)
      .justify_end()
      .items_center()
      .text_size(11.5)
      .text_color(t.dim)
      .when(Boolean(where), (el) => el.child(div().min_w(0).truncate().child(where)))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`\u2191${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`\u2193${g.behind}`)));
  }

  row({ w, i, g, tree }, t) {
    const on = w.active;
    const colors = shared("space.colors") ?? {};
    const color = colors[w.id] ?? "ansi6";
    const fill = color === "transparent" ? null : color.startsWith("#") ? color : (MARK[color] ?? t[color]);
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      .px(8)
      .h(rowHeight({ tree }))
      .flex_none()
      .justify_center()
      .rounded(8)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .when(this.pressed !== null && this.over === i && this.pressed !== i, (el) => el.border_t(2).border_color(t.accent))
      .on_mouse_down("left", () => {
        this.pressed = i;
        this.over = i;
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        this.pressed = null;
        if (from !== null && from !== i) run("space.move", { id: spaces()[from].id, index: i + 1 });
        else run("space.select", { id: w.id });
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w))
      .on_hover((over, cx) => {
        const next = over ? w.id : this.hoverSpace === w.id ? null : this.hoverSpace;
        if (next === this.hoverSpace) return;
        this.hoverSpace = next;
        cx.notify();
      })
      .child(
        h_flex()
          .gap(9)
          .items_center()
          .when(Boolean(tree), el => el.pl(22).child(svg("mods/workspace-chrome/branch.svg").size(13).text_color(t.dim)))
          .when(!tree, el => el.child(this.avatar(w, fill, t)))
          .child(div().flex_shrink(0).max_w(150).truncate().text_color(t.foreground).child(w.name))
          .child(g ? this.gitTail(g, tree, w.name, t) : div().flex_1())
          .child(this.addButton(w, t)),
      );
  }

  // The row's + (new agent in this space): always there at the same size, so hovering
  // changes no layout; seen and pressable only while the row is hovered.
  addButton(w, t) {
    const el = div().id(`space-add-${w.id}`).flex_none().w(20).h(20).rounded(5).flex().items_center().justify_center()
      .text_size(13).text_color(t.dim).child("+");
    if (this.hoverSpace !== w.id) return el.opacity(0);
    return this.ownPress(el.hover(s => s.bg(t.raised).text_color(t.foreground)).tooltip("New agent here"),
      () => openOverlay({ mod: "new-menu-tui", kind: "popup", width: 250, height: 512, props: { space: w.id } }));
  }

  // A control inside a row: its press neither selects nor drags the row (a drag from
  // another row that ends here still moves it there).
  ownPress(el, action) {
    return el.cursor_pointer()
      .on_mouse_down("left", (_e, cx) => { if (this.pressed === null) cx.stop_propagation(); })
      .on_mouse_up("left", (_e, cx) => { if (this.pressed !== null) return; cx.stop_propagation(); action(); });
  }

  // The space's icon: an emoji or an uploaded image (space-icon dialog, shared
  // "spaces-agents.icons" by full space id), else its letter on its color. Click to change.
  avatar(w, fill, t) {
    const held = (shared("spaces-agents.icons") ?? {})[w.id];
    const pic = typeof held === "string" ? held : held?.kind === "image" ? held.file : null;
    const emoji = held && typeof held === "object" && held.kind === "emoji" ? held.char : null;
    return this.ownPress(div().id(`space-icon-${w.id}`).size(18).flex_none().rounded(5).tooltip("Change icon")
      .child(pic
        ? image(pic).size(18).rounded(5)
        : emoji
          ? h_flex().size(18).rounded(5).when(Boolean(fill), (el) => el.bg(fill)).items_center().justify_center().text_size(12).child(emoji)
          : h_flex().size(18).rounded(5).when(Boolean(fill), (el) => el.bg(fill)).items_center().justify_center()
            .text_size(10.5).font_bold().text_color(fill ? "#ffffff" : t.foreground).child(w.name[0]?.toUpperCase() ?? "?")),
      () => openOverlay({ mod: "space-icon", kind: "dialog", width: 440, height: 520, props: { space: w.id } }));
  }

  compact({ w, i }, t) {
    return h_flex()
      .id(`space-${w.id}`)
      .h(26)
      .flex_none()
      .justify_center()
      .gap(4)
      .when(w.active, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => run("space.select", { id: w.id }))
      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
      .child(div().text_color(tone(t, w.status)).child(glyph(w.status)));
  }

  render() {
    const t = theme();
    const collapsed = shared("sidebar.collapsed") === true;
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const sp = spaces();
    const ids = new Set(sp.map(p => p.id));
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = c => Object.values(kept).filter(v => v === c).length;
      kept[p.id] = palette.reduce((best, c) => uses(c) < uses(best) ? c : best);
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    this.prepareAgents();
    const list = this.grouped(t, collapsed);
    // agent.next / agent.prev follow the rows; ones not shown come after, in model order.
    setAgentOrder(this.order);
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).pl(16).pr(10).items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(!collapsed, el => el.child("Spaces"))
        .child(div().id("space-new").p(4).rounded(5).hover(s => s.bg(t.hover).text_color(t.foreground)).on_click(() => run("space.new")).child("+")))
      // An id keeps the scroll position across renders (hover, live data).
      .child(v_flex().id("space-list").flex_1().min_h(0).px(8).pb(14).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        .children(list));
  }
}
