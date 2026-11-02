// Herdr app mods from one panel: what is installed, the Community index (GitHub topic herdr-mod),
// install with a review of what each mod does, update, remove. Port of speardragon's
// herdr-plugin-manager (MIT) from herdr plugins to Herdr app mods.

import { View, div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { exec, appHome, readTextFile, writeTextFile, shared, setShared, props, closeOverlay, notify, theme, layout } from "herdr";
import * as core from "./core.js";

const RECORDS = "mod-manager.installed";
const PAGE = 10;
const FETCH = 50;
const FOOTER = {
  list: "↑↓ mover · u atualizar · U atualizar tudo · x remover · o abrir repo · m marketplace · r recarregar · esc fechar",
  market: "↑↓ mover · ←→ página · enter instalar · / buscar · s ordem · o abrir repo · r recarregar · esc voltar",
  packages: "↑↓ escolher · enter revisar · esc voltar",
  review: "y instalar · o abrir repo · esc cancelar",
};

const io = {
  exec: (cmd, args, opts) => exec(cmd, args, opts),
  readText: (path) => readTextFile(path),
  async writeText(path, text) {
    await writeTextFile(path, text, await readTextFile(path));
  },
};

const anonymous = async (url) => {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  return { status: res.status, text: await res.text() };
};

const records = () => shared(RECORDS) ?? [];
const saveRecords = (list) => setShared(RECORDS, list);
const cacheDir = () => `${appHome()}/.mod-manager-cache`;
const repoPage = (source) => (/^[\w.-]+\/[\w.-]+$/.test(source) ? `https://github.com/${source}` : null);
const short = (sha) => (sha ? sha.slice(0, 7) : "?");

export default class ModManager extends View {
  init(_props, cx) {
    this.mode = "list";
    this.checks = {};
    this.catalog = null;
    this.catalogAt = 0;
    this.drift = {};
    this.mods = [];
    this.at = 0;
    this.updates = {};
    this.message = null;
    this.busy = null;
    this.confirm = null;
    this.market = { items: [], total: 0, fetchedPages: 0, page: 0, at: 0, query: "", sort: "stars", error: null, loading: false };
    this.review = null;
    this.searching = false;
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "buscar mods (Enter busca, Esc cancela)" });
    this.input.on("submit", (_e, cx) => {
      this.searching = false;
      this.market.query = this.input.value();
      this.handle.focus();
      cx.spawn(async (cx) => this.loadMarket(cx, true));
      cx.notify();
    });
    this.handle.focus();
    cx.timer.after(100, () => this.handle.focus());
    cx.spawn(async (cx) => this.refresh(cx));
    // A panel closed while cloning can't clean up after itself; its clone goes the next time.
    exec("find", [cacheDir(), "-mindepth", "1", "-maxdepth", "1", "-mmin", "+60", "-exec", "rm", "-rf", "{}", "+"]).catch(() => {});
    if (props()?.start === "market") {
      this.mode = "market";
      cx.spawn(async (cx) => this.loadMarket(cx, true));
    }
    if (props()?.review) cx.spawn(async (cx) => { await this.refresh(cx); await this.startReview(cx, props().review); });
  }

  dismiss() {
    const id = props()?.overlay;
    if (id) closeOverlay(id);
  }

  // Closing the panel mid-review leaves no clone behind.
  async close() {
    if (this.review) await exec("rm", ["-rf", this.review.fetched.dir]);
  }

  async refresh(cx) {
    try {
      this.mods = await core.listMods(io, { appHome: appHome(), records: records() });
      // The official index (herdr.dev/mods): which repo each installed mod came from, and its
      // blurb. Ten minutes of cache, so opening the panel is not a fetch every time.
      if (!this.catalog || Date.now() - this.catalogAt > 600000) {
        try {
          this.catalogSource = await core.catalogUrl(io, appHome());
          this.catalog = await core.fetchCatalog(io, anonymous, this.catalogSource);
          this.catalogError = null;
        } catch (e) {
          this.catalogError = `catálogo indisponível: ${String(e?.message ?? e)}`;
        }
        this.catalogAt = Date.now();
      }
    } catch (e) {
      this.message = `não consegui listar os mods: ${e?.message ?? e}`;
    }
    cx.notify();
    this.verify(cx);
    for (const r of records()) {
      core.remoteSha(io, r.source)
        .then((sha) => { this.updates[r.source] = sha && sha !== r.sha ? sha : null; cx.notify(); })
        .catch(() => {});
    }
  }

  async loadMarket(cx, reset) {
    const m = this.market;
    if (reset) Object.assign(m, { items: [], total: 0, fetchedPages: 0, page: 0, at: 0 });
    m.loading = true;
    m.error = null;
    cx.notify();
    try {
      const r = await core.searchMarket(io, { query: m.query, sort: m.sort, page: m.fetchedPages + 1, perPage: FETCH }, anonymous);
      m.items.push(...r.items);
      m.total = r.total;
      m.fetchedPages += 1;
    } catch (e) {
      m.error = String(e?.message ?? e);
    }
    m.loading = false;
    cx.notify();
  }

  // Loads the pages the person reaches, FETCH results at a time.
  ensurePage(cx) {
    const m = this.market;
    if (!m.loading && (m.page + 1) * PAGE > m.items.length && m.items.length < m.total) {
      cx.spawn(async (cx) => this.loadMarket(cx, false));
    }
  }

  async work(cx, label, fn) {
    this.busy = label;
    this.message = null;
    cx.notify();
    try {
      await fn();
    } catch (e) {
      this.message = String(e?.message ?? e);
    }
    this.busy = null;
    cx.notify();
  }

  async startReview(cx, source) {
    await this.work(cx, `baixando ${source}…`, async () => {
      const fetched = await core.fetchSource(io, source, cacheDir());
      const packages = core.findPackages(fetched.files);
      if (!packages.length) {
        await exec("rm", ["-rf", fetched.dir]);
        throw new Error(`${source} não tem nenhuma pasta mods/<nome>/main.js`);
      }
      // Pocket Link belongs to automagik-pocket: refuse it before anything is planned or written.
      if (packages.some((p) => p.mods.includes(core.POCKET_LINK))) throw new Error(core.POCKET_LINK_REFUSAL);
      this.review = { source, fetched, packages, at: 0, plan: null, pkg: null };
      if (packages.length === 1) await this.planFor(packages[0]);
      else this.mode = "packages";
    });
  }

  async planFor(pkg) {
    const r = this.review;
    const record = records().find((x) => x.source === r.source && x.prefix === pkg.prefix) ?? null;
    const layouts = (await exec("ls", [`${appHome()}/layouts`])).stdout.split("\n").filter(Boolean);
    r.pkg = pkg;
    r.record = record;
    r.plan = await core.planInstall(io, {
      appHome: appHome(), dir: r.fetched.dir, pkg, record, existingMods: this.mods.map((m) => m.name), existingLayouts: layouts,
    });
    this.mode = "review";
  }

  async finishReview() {
    if (this.review) await exec("rm", ["-rf", this.review.fetched.dir]);
    this.review = null;
  }

  async install(cx) {
    const r = this.review;
    await this.work(cx, `instalando ${r.pkg.name}…`, async () => {
      const rec = await core.applyInstall(io, {
        appHome: appHome(), plan: r.plan, source: r.source, prefix: r.pkg.prefix, sha: r.fetched.sha, record: r.record,
      });
      saveRecords([...records().filter((x) => !(x.source === rec.source && x.prefix === rec.prefix)), rec]);
      const failures = await core.checkMods(io, appHome(), rec.mods);
      const verb = r.record ? "atualizado" : "instalado";
      this.message = failures.length
        ? `${r.pkg.name} ${verb}, mas o herdr-app check falhou em ${failures.map((f) => f.mod).join(", ")}: ${failures[0].error.split("\n")[0]}`
        : `${r.pkg.name} ${verb} (${rec.mods.join(", ")})${rec.layouts.length ? `; layouts: ${rec.layouts.join(", ")} (troque com ctrl-shift-l)` : ""}`;
      notify({ title: `mod ${verb}`, body: this.message, level: failures.length ? "warning" : "success" });
      this.updates[rec.source] = null;
      await this.finishReview();
      this.mode = "list";
      this.mods = await core.listMods(io, { appHome: appHome(), records: records() });
    });
  }

  async remove(cx, mod) {
    await this.work(cx, `removendo ${mod.name}…`, async () => {
      if (mod.record) {
        await core.uninstall(io, { appHome: appHome(), record: mod.record });
        saveRecords(records().filter((x) => x !== mod.record && !(x.source === mod.record.source && x.prefix === mod.record.prefix)));
        this.message = `removido: ${mod.record.mods.join(", ")}`;
      } else {
        await core.removeLocal(io, { appHome: appHome(), name: mod.name, symlink: mod.symlink, path: mod.path });
        this.message = mod.symlink ? `link ${mod.name} removido (a pasta de origem ficou)` : `removido: ${mod.name}`;
      }
      this.mods = await core.listMods(io, { appHome: appHome(), records: records() });
      this.at = Math.min(this.at, Math.max(0, this.mods.length - 1));
    });
  }

  // Bulk update reviews every package, one after another: nothing is applied unseen, because a plan
  // can add a risk, clash with a name, or move a folder aside. The queue lives here.
  async reviewUpdates(cx, pending) {
    this.pendingUpdates = pending.slice(1);
    await this.startReview(cx, pending[0].source);
    if (this.pendingUpdates.length) this.message = `${this.pendingUpdates.length} outra(s) na fila depois desta`;
  }

  selectedMod() {
    return this.mods[this.at] ?? null;
  }

  onKey(e, cx) {
    if (this.searching) {
      if (e.key === "escape") {
        this.searching = false;
        this.handle.focus();
        cx.stop_propagation();
        cx.notify();
      }
      return;
    }
    if (this.busy) return;
    const k = e.key;
    const ch = e.key_char ?? k;
    if (this.confirm) {
      const c = this.confirm;
      if (k === "y") { this.confirm = null; cx.spawn(async (cx) => c.run(cx)); }
      else if (k === "n" || k === "escape") { this.confirm = null; this.message = "cancelado"; }
      else return;
      cx.stop_propagation();
      cx.notify();
      return;
    }
    const handled = this[`${this.mode}Key`](k, ch, cx);
    if (handled === false) return;
    cx.stop_propagation();
    cx.notify();
  }

  listKey(k, ch, cx) {
    const mod = this.selectedMod();
    if (k === "down" || k === "j") this.at = Math.min(this.mods.length - 1, this.at + 1);
    else if (k === "up" || k === "k") this.at = Math.max(0, this.at - 1);
    else if (k === "escape" || k === "q") this.dismiss();
    else if (k === "m") { this.mode = "market"; this.message = null; if (!this.market.fetchedPages) cx.spawn(async (cx) => this.loadMarket(cx, true)); }
    else if (ch === "r") cx.spawn(async (cx) => this.refresh(cx));
    else if (ch === "U") {
      const pending = records().filter((r) => this.updates[r.source]);
      if (!pending.length) this.message = "tudo em dia";
      else this.confirm = { text: `revisar ${pending.length} atualização(ões), uma a uma: ${pending.map((r) => r.mods.join("+")).join(", ")}? (y/n)`, run: (cx) => this.reviewUpdates(cx, pending) };
    } else if (!mod) return false;
    else if (mod.name === core.POCKET_LINK && ch !== "o") {
      // Read-only row: Pocket Link's pairing key lives in its own folder, and only its repo's
      // installer may move or replace it.
      this.message = core.POCKET_LINK_REFUSAL;
    } else if (ch === "u") {
      if (mod.kind !== "installed") this.message = mod.kind === "herdr" ? "mods do Herdr se atualizam com o app" : "só mods instalados por aqui têm origem para atualizar";
      else if (!mod.enabled) this.message = `${mod.name} está desligado: ligue antes de atualizar`;
      else cx.spawn(async (cx) => this.startReview(cx, mod.record.source));
    } else if (ch === "x") {
      if (mod.kind === "herdr") this.message = "mods do Herdr não são removidos; para mudar um, use mod.clone";
      else {
        const what = mod.record ? `${mod.record.mods.join(", ")} e os atalhos que ele adicionou` : mod.symlink ? `o link ${mod.name} (a pasta de origem fica)` : `a pasta mods/${mod.name}`;
        this.confirm = { text: `remover ${what}? (y/n)`, run: (cx) => this.remove(cx, mod) };
      }
    } else if (ch === "o") {
      const url = mod.name === core.POCKET_LINK
        ? "https://github.com/automagik-dev/automagik-pocket"
        : mod.record && repoPage(mod.record.source);
      if (url) exec("open", [url]);
      else this.message = "sem repositório conhecido para este mod";
    } else return false;
  }

  marketKey(k, ch, cx) {
    const m = this.market;
    const pageItems = m.items.slice(m.page * PAGE, (m.page + 1) * PAGE);
    const pages = Math.max(1, Math.ceil(m.total / PAGE));
    const item = pageItems[m.at];
    if (k === "escape" || k === "q") { this.mode = "list"; this.message = null; }
    else if (k === "down" || k === "j") {
      if (m.at < pageItems.length - 1) m.at += 1;
      else if (m.page < pages - 1) { m.page += 1; m.at = 0; this.ensurePage(cx); }
    } else if (k === "up" || k === "k") {
      if (m.at > 0) m.at -= 1;
      else if (m.page > 0) { m.page -= 1; m.at = PAGE - 1; }
    } else if (k === "right" || k === "l") { m.page = (m.page + 1) % pages; m.at = 0; this.ensurePage(cx); }
    else if (k === "left" || k === "h") { m.page = (m.page + pages - 1) % pages; m.at = 0; this.ensurePage(cx); }
    else if (k === "/") { this.searching = true; this.input.set_value(m.query); this.input.focus(); }
    else if (k === "s") { m.sort = m.sort === "stars" ? "updated" : "stars"; cx.spawn(async (cx) => this.loadMarket(cx, true)); }
    else if (k === "r") cx.spawn(async (cx) => this.loadMarket(cx, true));
    else if (!item) return false;
    else if (k === "o") exec("open", [item.url]);
    else if (k === "enter") cx.spawn(async (cx) => this.startReview(cx, item.fullName));
    else return false;
  }

  packagesKey(k, _ch, cx) {
    const r = this.review;
    if (k === "escape" || k === "q") { cx.spawn(async () => this.finishReview()); this.mode = "market"; }
    else if (k === "down" || k === "j") r.at = Math.min(r.packages.length - 1, r.at + 1);
    else if (k === "up" || k === "k") r.at = Math.max(0, r.at - 1);
    else if (k === "enter") cx.spawn(async (cx) => this.work(cx, "conferindo…", () => this.planFor(r.packages[r.at])));
    else return false;
  }

  reviewKey(k, _ch, cx) {
    const r = this.review;
    if (k === "escape" || k === "n" || k === "q") {
      const back = r.record ? "list" : "market";
      cx.spawn(async () => this.finishReview());
      this.mode = back;
      this.message = "cancelado";
    } else if (k === "o") { const url = repoPage(r.source); if (url) exec("open", [url]); }
    else if (k === "y") {
      if (r.plan.clashes.length) this.message = `não instala: já existe ${r.plan.clashes.join(", ")}. Remova ou renomeie o seu antes.`;
      else cx.spawn(async (cx) => this.install(cx));
    } else return false;
  }

  header(t, title, detail) {
    return h_flex().gap(12).items_center()
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child(title))
      .child(div().text_color(t.dim).child(detail ?? ""))
      .child(div().flex_1())
      .child(div().text_size(11).text_color(t.dim).child("esc"));
  }

  row(id, selected, t, children) {
    return h_flex().id(id).h(28).px(10).gap(10).items_center().rounded(6).flex_none()
      .when(selected, (el) => el.bg(t.selected))
      .children(children);
  }

  // The catalog entry for an installed mod, if herdr.dev/mods lists one that installs it.
  origin(mod) {
    return this.catalog?.byMod.get(mod.name) ?? null;
  }

  // Compares the installed folder with the catalog's head commit: modified, or just older.
  checkDrift(mod, cx) {
    const entry = this.origin(mod);
    if (!entry) {
      this.message = `${mod.name} não está no catálogo de herdr.dev/mods`;
      cx.notify();
      return;
    }
    cx.spawn(async (cx) => {
      this.message = `comparando ${mod.name} com ${entry.fullName}…`;
      cx.notify();
      let fetched = null;
      try {
        fetched = await core.fetchSource(io, entry.fullName, cacheDir());
        const result = await core.drift(io, { appHome: appHome(), dir: fetched.dir, entry, name: mod.name, localPath: mod.path });
        this.drift[mod.name] = result;
        this.message = result.clean
          ? `${mod.name} igual a ${entry.fullName}@${short(entry.headCommit)}`
          : `${mod.name} difere de ${entry.fullName}@${short(entry.headCommit)}: ${result.changed} alterado(s), ${result.added} novo(s), ${result.removed} removido(s) de ${result.mine} arquivo(s)`;
      } catch (e) {
        this.message = String(e?.message ?? e);
      } finally {
        if (fetched) await exec("rm", ["-rf", fetched.dir]).catch(() => {});
      }
      cx.notify();
    });
  }

  // `herdr-app check` is the only honest answer to "does this load?"; run it one at a time, for
  // the mods the app actually loads, and let the rows fill in as each answer comes back.
  verify(cx) {
    if (this.verifying) return;
    const todo = this.mods.filter((m) => m.enabled && m.kind !== "herdr" && !this.checks[m.name]);
    if (!todo.length) return;
    this.verifying = true;
    cx.spawn(async (cx) => {
      for (const m of todo) {
        try {
          const r = await exec("herdr-app", ["check", `${appHome()}/${m.path}`]);
          this.checks[m.name] = r.code === 0
            ? { ok: true }
            : { ok: false, error: (r.stderr || r.stdout).trim().split("\n")[0] ?? "check failed" };
        } catch (e) {
          this.checks[m.name] = { ok: false, error: String(e?.message ?? e) };
        }
        cx.notify();
      }
      this.verifying = false;
      cx.notify();
    });
  }

  // A table: what a mod is, where it came from, and the switch that moves it out of the app's
  // sight (`mods-disabled/`) without deleting anything. Herdr's own get no switch: they can't
  // be moved, only cloned.
  listView(t) {
    const kinds = { installed: "instalado", clone: "clone", local: "local", herdr: "Herdr" };
    const kindOf = (m) => (m.kind === "local" && this.origin(m) ? "catálogo" : kinds[m.kind]);
    const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : "—");
    const version = (m) =>
      m.record ? `commit ${short(m.record.sha)}`
        : m.clone ? `← ${m.clone.name}${m.clone.version ? ` v${m.clone.version}` : ""}`
          : this.origin(m) ? `upstream ${short(this.origin(m).headCommit)}`
            : "—";
    const source = (m) => {
      const entry = this.origin(m);
      return m.record ? `${m.record.source}${m.record.prefix ? `/${m.record.prefix}` : ""}`
        : entry ? `${entry.fullName}${entry.path ? `/${entry.path}` : ""}${entry.stars ? ` ★${entry.stars}` : ""}`
          : m.manifest?.owner ? `${m.manifest.owner} (installer)`
            : m.kind === "herdr" ? "with Herdr" : "—";
    };
    const installed = (m) => day(m.record?.at ? Date.parse(m.record.at) : m.manifest?.at ? Date.parse(m.manifest.at) : null);
    const col = (w, el) => div().w(w).flex_none().truncate().child(el);
    const head = (label, w) => div().w(w).flex_none().truncate().text_size(10.5).text_color(t.dim).child(label);
    const items = this.mods.map((m, i) => {
      const update = m.record && this.updates[m.record.source];
      return this.row(`mod-${m.name}`, i === this.at, t, [
        // Only a mod that may move gets a switch: Herdr's own come with the app, and Pocket Link's
        // folder holds a pairing key another repo installs and repairs.
        m.kind === "herdr" || m.name === core.POCKET_LINK
          ? div().w(30).flex_none().text_size(11).text_color(t.dim).child("–")
          : h_flex().id(`sw-${m.name}`).w(30).h(17).flex_none().rounded(9).p(2).cursor_pointer()
            .bg(m.enabled ? t.accent : t.input).when(m.enabled, (el) => el.justify_end())
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click((_e, cx) => this.toggle(m, cx))
            .child(div().size(13).rounded(7).bg(t.background)),
        col(150, div().truncate().when(!m.enabled || this.checks[m.name]?.ok === false, (el) => el.text_color(this.checks[m.name]?.ok === false ? t.blocked : t.muted)).child(m.name)),
        col(70, div().text_color(m.error ? t.blocked : !m.enabled ? t.dim : m.kind === "herdr" ? t.dim : t.accent)
          .child(m.enabled ? kindOf(m) : "off")),
        col(56, div().text_color(this.checks[m.name]?.ok === false ? t.blocked : this.checks[m.name]?.ok ? t.done : t.dim)
          .child(m.kind === "herdr" || !m.enabled ? "—" : this.checks[m.name] ? (this.checks[m.name].ok ? "ok" : "erro") : "…")),
        col(140, div().text_color(t.muted).child(version(m))),
        col(190, div().text_color(update ? t.blocked : t.dim)
          .child(`${source(m)}${update ? ` · ↑ ${short(update)}` : ""}`)),
        col(80, div().text_color(t.dim).child(installed(m))),
        col(80, div().text_color(t.dim).child(day(m.changed))),
        div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim)
          .child(m.path),
      ]).on_click((_e, cx) => { this.at = i; cx.notify(); });
    });
    const sel = this.selectedMod();
    const detail = sel?.name === core.POCKET_LINK
      ? [`path: ${sel.path}`, "só leitura: o mod, o LaunchAgent e a chave de pareamento pertencem a automagik-dev/automagik-pocket",
        "instale, atualize ou remova pelo instalador de lá (o abre no navegador)"]
      : !sel ? []
      : this.checks[sel.name]?.ok === false ? [`path: ${sel.path}`, `herdr-app check falhou: ${this.checks[sel.name].error}`,
        "o app mantém a última versão boa; o erro também aparece em herdr-app status"]
        : sel.record ? [`path: ${sel.path}`, `origem: ${source(sel)}`, `commit: ${sel.record.sha?.slice(0, 7) ?? "?"}`,
          `mods: ${sel.record.mods.join(", ")}`,
          sel.record.layouts?.length ? `layouts: ${sel.record.layouts.join(", ")}` : null,
          sel.record.keys?.length ? `atalhos: ${sel.record.keys.map((k) => `${k.key} → ${k.action}`).join(", ")}` : null,
          `instalado em ${day(Date.parse(sel.record.at))}`].filter(Boolean)
          : sel.kind === "herdr" ? [`path: ${sel.path}`, "mod que vem com o Herdr: só leitura (mod.clone para mudar)"]
            : [`path: ${sel.path}`,
              this.origin(sel) ? `${this.origin(sel).name} · ${this.origin(sel).fullName}${this.origin(sel).path ? `/${this.origin(sel).path}` : ""} ★${this.origin(sel).stars} · atualizado ${this.origin(sel).pushedAt?.slice(0, 10) ?? "?"} (o abre no navegador)` : null,
              this.origin(sel)?.blurb ?? null,
              this.drift[sel.name] ? (this.drift[sel.name].clean ? "igual ao upstream" : `difere do upstream: ${this.drift[sel.name].changed} alterado(s), ${this.drift[sel.name].added} novo(s), ${this.drift[sel.name].removed} removido(s)`) : (this.origin(sel) ? "d compara com o upstream" : null),
              sel.clone ? `clone de ${sel.clone.name}${sel.clone.version ? ` v${sel.clone.version}` : ""}` : "sem origem registrada",
              sel.manifest?.owner ? `instalado por ${sel.manifest.owner} em ${installed(sel)}` : null,
              `alterado em ${day(sel.changed)}`,
              sel.symlink ? "link para uma pasta sua: x só remove o link" : null].filter(Boolean);
    const count = (f) => this.mods.filter(f).length;
    const herdr = count((m) => m.kind === "herdr");
    const errors = count((m) => this.checks[m.name]?.ok === false);
    const pending = count((m) => m.enabled && m.kind !== "herdr" && !this.checks[m.name]);
    const title = [
      `${count((m) => m.enabled && m.kind !== "herdr")} seus`,
      `${herdr} do Herdr`,
      `${count((m) => !m.enabled)} desligados`,
      this.catalogError ?? null,
      errors ? `${errors} com erro` : null,
      pending ? `checando ${pending}` : null,
    ].filter(Boolean).join(" · ");
    return [
      this.header(t, "Mods", title),
      h_flex().h(22).px(10).gap(10).flex_none().items_center().border_b(1).border_color(t.border)
        .child(head("ON", 30)).child(head("NAME", 150)).child(head("KIND", 70)).child(head("CHECK", 56))
        .child(head("VERSION", 140)).child(head("SOURCE", 190)).child(head("INSTALLED", 80))
        .child(head("CHANGED", 80)).child(head("PATH", 0)),
      v_flex().flex_1().min_h(0).overflow_y_scrollbar().children(items),
      v_flex().gap(2).text_size(12).text_color(t.muted).children(detail.map((d) => div().child(d))),
    ];
  }

  // Off is a move: the folder leaves `mods/` for `mods-disabled/`, so the app stops loading it.
  toggle(mod, cx) {
    if (mod.name === core.POCKET_LINK) {
      // Read-only: off is a folder move, and its pairing key lives in that folder.
      this.message = core.POCKET_LINK_REFUSAL;
      cx.notify();
      return;
    }
    if (mod.kind === "herdr") {
      this.message = "mods do Herdr vêm com o app; não dá para desligar (mod.clone para mudar)";
      cx.notify();
      return;
    }
    cx.spawn(async (cx) => {
      try {
        await core.setEnabled(io, { appHome: appHome(), name: mod.name, enabled: !mod.enabled });
        this.message = mod.enabled
          ? `${mod.name} desligado · a pasta foi para ${core.OFF_DIR}/`
          : `${mod.name} ligado`;
        this.mods = await core.listMods(io, { appHome: appHome(), records: records() });
        this.at = Math.min(this.at, Math.max(0, this.mods.length - 1));
      } catch (e) {
        this.message = String(e?.message ?? e);
      }
      cx.notify();
    });
  }


  marketView(t) {
    const m = this.market;
    const installed = new Set(records().map((r) => r.source));
    const pageItems = m.items.slice(m.page * PAGE, (m.page + 1) * PAGE);
    const pages = Math.max(1, Math.ceil(m.total / PAGE));
    const items = pageItems.map((it, i) => this.row(`market-${it.fullName}`, i === m.at, t, [
      div().w(28).flex_none().text_color(t.dim).child(String(m.page * PAGE + i + 1)),
      div().w(14).flex_none().text_color(t.done).child(installed.has(it.fullName) ? "✓" : ""),
      div().w(260).flex_none().truncate().text_color(t.foreground).child(it.fullName),
      div().w(56).flex_none().text_color(t.muted).child(`★ ${it.stars}`),
      div().flex_1().min_w(0).truncate().text_color(t.dim).child(it.description),
    ]).on_click((_e, cx) => { m.at = i; cx.notify(); }));
    const status = m.loading && !pageItems.length ? "carregando…" : m.error ? m.error : !m.total ? "nenhum mod encontrado" : null;
    return [
      this.header(t, "Marketplace", `topic:herdr-mod${m.query ? ` ${m.query}` : ""} · ${m.sort === "stars" ? "mais estrelas" : "atualizados"} · ${m.total} repos`),
      this.searching
        ? h_flex().h(34).px(10).items_center().rounded(8).border_1().border_color(t.accent).bg(t.background)
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground))
        : div(),
      v_flex().flex_1().min_h(0).children(status ? [div().px(10).text_color(m.error ? t.blocked : t.dim).child(status)] : items),
      div().text_size(12).text_color(t.dim).child(`página ${m.page + 1} de ${pages}${m.loading ? " · carregando…" : ""}`),
    ];
  }

  packagesView(t) {
    const r = this.review;
    return [
      this.header(t, r.source, `${r.packages.length} pacotes neste repo · commit ${short(r.fetched.sha)}`),
      v_flex().flex_1().min_h(0).overflow_y_scrollbar().children(r.packages.map((p, i) => this.row(`pkg-${p.prefix}`, i === r.at, t, [
        div().w(200).flex_none().truncate().text_color(t.foreground).child(p.prefix || "(raiz)"),
        div().flex_1().min_w(0).truncate().text_color(t.dim).child(`mods: ${p.mods.join(", ")}${p.layouts.length ? ` · layouts: ${p.layouts.length}` : ""}${p.recipe ? "" : " · sem RECIPE.md"}`),
      ]))),
    ];
  }

  reviewView(t) {
    const { plan, pkg, source, fetched, record } = this.review;
    const line = (text, color) => div().text_color(color ?? t.muted).child(text);
    const section = (title, lines) => v_flex().gap(2).child(div().font_semibold().text_color(t.foreground).child(title)).children(lines);
    const blocks = [
      section("O que entra", [
        line(`mods: ${plan.mods.map((m) => `mods/${m}`).join(", ")}`),
        plan.layouts.length ? line(`layouts: ${plan.layouts.join(", ")} (não troca o seu layout)`) : null,
        line(`${pkg.files.length} arquivo(s) · commit ${short(fetched.sha)}${record ? ` (instalado: ${short(record.sha)})` : ""}${pkg.recipe ? "" : " · sem RECIPE.md"}`),
      ].filter(Boolean)),
      section("O que o código faz", plan.risks.length
        ? plan.risks.map((r) => line(`• ${r.label}: ${r.paths.map((p) => p.split("/").slice(-2).join("/")).join(", ")}`, t.blocked))
        : [line("não roda programas, não acessa a rede e não lê nem grava arquivos", t.done)]),
      section("Atalhos", [
        ...plan.keyAdds.map((k) => line(`+ ${k.key} → ${k.action} (${k.section})`)),
        ...plan.keyConflicts.map((k) => line(`= ${k.key} continua ${k.current}; o mod queria ${k.action}`, t.blocked)),
        ...(plan.keyAdds.length || plan.keyConflicts.length ? [] : [line("nenhum")]),
      ]),
    ];
    if (plan.clashes.length) blocks.push(section("Bloqueado", [line(`já existe ${plan.clashes.join(", ")} que não foi instalado por aqui; nada é sobrescrito`, t.blocked)]));
    return [
      this.header(t, `${record ? "Atualizar" : "Instalar"} ${pkg.name}`, source),
      div().text_size(12).text_color(t.dim).child("Mods não são revisados pelo Herdr. Confira o repositório (o) antes de instalar um mod que roda programas ou acessa a rede."),
      v_flex().flex_1().min_h(0).gap(12).overflow_y_scrollbar().children(blocks),
    ];
  }

  render(_cx) {
    const t = theme();
    const body = this[`${this.mode}View`](t);
    const footer = this.busy
      ? div().text_color(t.working).child(this.busy)
      : this.confirm
        ? div().font_semibold().text_color(t.blocked).child(this.confirm.text)
        : div().text_color(t.dim).child(FOOTER[this.mode]);
    return v_flex().id("root").track_focus(this.handle).size_full().p(16).gap(12).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => this.onKey(e, cx))
      .children(body)
      .when(Boolean(this.message), (el) => el.child(div().text_size(12).text_color(t.foreground).child(this.message)))
      .child(div().text_size(12).child(footer));
  }
}
