// The public install path end to end (#43): the pack built by release.yml's own Pack lines, served
// as a file:// release with SHA256SUMS, installed by install.sh piped into bash as the README's
// one-liner runs it, on three scratch homes: a fresh one, a v0.4.0 sidebar-only install, and one
// with a personal layout and an unrelated mod (sheepdog). Fake `uname`, `brew` and `herdr-app`;
// never the real home, ~/.config/herdr-app or Homebrew.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const INSTALL = join(ROOT, "install.sh");
const RELEASE_YML = join(ROOT, ".github", "workflows", "release.yml");
const { PACK_MODS, PACK_KEYS, PACK_LAYOUT, CATALOG_URL, POCKET_LINK, V020_LAYOUT_SHA256, tarballName } = await import("../mods/spaces-agents/release.js");
/** The release this branch becomes; release.yml sets VERSION to it in the commit it tags. */
const RELEASE = "0.5.0";
/** The latest sidebar-only release (v0.2-v0.4.x: automagik-herdr-<v>.tgz, spaces-agents only). */
const OLD = "0.4.0";
/** Paths update.mjs carries over from the replaced folder (D10): never in the archive. */
const PRIVATE = (rel) => rel.split("/").some((s) => s.startsWith(".") || s === "node_modules");

const git = (args, env = {}) => execFileSync("git", args, { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8" }).trim();
const haveGit = (() => { try { return git(["rev-parse", "--is-inside-work-tree"]) === "true"; } catch { return false; } })();
const exe = (path, text) => { writeFileSync(path, text); chmodSync(path, 0o755); };
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

/** Every file and link under `dir`, as `rel → {bytes or link target, exec bit}`. */
function files(dir, { skip = () => false } = {}) {
  const out = new Map();
  const walk = (at, rel) => {
    for (const name of readdirSync(at).sort()) {
      const r = rel ? `${rel}/${name}` : name, path = join(at, name), st = lstatSync(path);
      if (skip(r)) continue;
      if (st.isSymbolicLink()) out.set(r, `link:${readlinkSync(path)}`);
      else if (st.isDirectory()) walk(path, r);
      else out.set(r, `${st.mode & 0o111 ? "x" : "-"}:${sha(readFileSync(path))}`);
    }
  };
  walk(dir, "");
  return out;
}

/**
 * The pack exactly as release.yml's Pack step builds it: its `git show` and `git archive` lines,
 * run by sh with the tag replaced by a tree of this working copy (the tag's tree in a release),
 * and that tree's VERSION set to RELEASE as the release commit does. Then release.yml's two
 * checks: mods/ (but pocket-link) is PACK_MODS, and the archive's top level is PACK_MODS + layouts.
 */
function buildPack(dir) {
  const step = readFileSync(RELEASE_YML, "utf8");
  const pack = step.slice(step.indexOf("- name: Pack\n"), step.indexOf("- name: Publish the release\n"));
  assert.ok(pack.length > 0, "release.yml has a Pack step before Publish the release");
  const only = (re) => {
    const lines = pack.split("\n").map((l) => l.trim()).filter((l) => re.test(l));
    assert.equal(lines.length, 1, `release.yml's Pack step has one line matching ${re}`);
    return lines[0];
  };
  const swap = (line, from, to) => {
    assert.equal(line.split(from).length, 2, `release.yml's line names ${from} once: ${line}`);
    return line.replace(from, to);
  };
  assert.equal(only(/^tgz=/), 'tgz="release/automagik-herdr-pack-${VERSION}.tgz"');
  // The folder list is the tag's PACK_MODS (bash-only lines, checked as text; the checks they
  // feed are repeated below).
  assert.equal(only(/^git show "v\$\{VERSION\}:mods\//), 'git show "v${VERSION}:mods/spaces-agents/release.js" > "${RUNNER_TEMP}/release.mjs"');
  assert.match(only(/^mapfile -t mods /), /const \{ PACK_MODS \} = await import\(process\.argv\[1\]\); for \(const m of PACK_MODS\) console\.log\(m\);' "\$\{RUNNER_TEMP\}\/release\.mjs"\)$/);
  const show = swap(only(/^git show "v\$\{VERSION\}:layouts\//), '"v${VERSION}:', '"${TREE}:');
  const archive = swap(swap(only(/^git archive /), '"v${VERSION}:mods"', '"${TREE}:mods"'), '"${mods[@]}"', '"$@"');

  // A tree of the working copy (staged in a scratch index, never the repository's own index).
  const idx = { GIT_INDEX_FILE: join(dir, "index") };
  git(["add", "-A", "--", "mods", "layouts"], idx);
  const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: ROOT, input: `${RELEASE}\n`, encoding: "utf8" }).trim();
  git(["update-index", "--cacheinfo", `100644,${blob},mods/spaces-agents/VERSION`], idx);
  const tree = git(["write-tree"], idx);

  const tagged = git(["ls-tree", "--name-only", `${tree}:mods`]).split("\n").filter((m) => m !== POCKET_LINK).sort();
  assert.deepEqual(tagged, [...PACK_MODS].sort(), "mods/ (but pocket-link) is PACK_MODS, as release.yml checks");
  const tgz = join(dir, "release", tarballName(RELEASE));
  mkdirSync(dirname(tgz), { recursive: true });
  mkdirSync(join(dir, "runner"));
  execFileSync("sh", ["-euc", `${show}\n${archive}\n`, "sh", ...PACK_MODS], {
    cwd: ROOT, env: { ...process.env, TREE: tree, tgz, RUNNER_TEMP: join(dir, "runner") }, stdio: "pipe",
  });
  const top = [...new Set(execFileSync("tar", ["-tzf", tgz], { encoding: "utf8" }).split("\n").filter(Boolean).map((p) => p.split("/")[0]))].sort();
  assert.deepEqual(top, [...PACK_MODS, "layouts"].sort(), "the archive's top level is PACK_MODS plus layouts, as release.yml checks");
  const x = join(dir, "archive");
  mkdirSync(x);
  execFileSync("tar", ["-xzf", tgz, "-C", x]);
  return { tgz, x };
}

/** One pack for every test (it is the same release). */
let built;
const pack = () => {
  if (!built) {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "ah-e2e-pack-")));
    process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
    built = buildPack(dir);
  }
  return built;
};

/** A scratch machine: a home, the release folder (file://), and fake uname, brew and herdr-app. */
function machine(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ah-e2e-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "home"), bin = join(root, "bin"), apps = join(root, "Applications"), rel = join(root, "release");
  for (const d of [home, bin, join(apps, "Herdr.app")]) mkdirSync(d, { recursive: true });
  const log = join(root, "herdr-app.log"), shown = join(root, "herdr-shown"), brew = join(root, "brew.log");
  writeFileSync(log, "");
  writeFileSync(brew, "");
  exe(join(bin, "uname"), "#!/bin/sh\necho Darwin\n");
  exe(join(bin, "brew"), `#!/bin/sh\necho "$*" >> "${brew}"\nexit 1\n`);
  // herdr-app: logs its arguments; `status` prints the layout show() set, or fails with none.
  exe(join(bin, "herdr-app"), `#!/bin/sh
printf '%s\\n' "$*" >> "${log}"
if [ "$1" = status ]; then
  [ -f "${shown}" ] || exit 1
  printf '{\\n  "layout": "%s",\\n  "zoom": false\\n}\\n' "$(cat "${shown}")"
fi
`);
  // The release: latest/download/{SHA256SUMS, the pack}, as GitHub serves it.
  const { tgz } = pack();
  const dl = join(rel, "latest", "download");
  mkdirSync(dl, { recursive: true });
  const body = readFileSync(tgz);
  writeFileSync(join(dl, tarballName(RELEASE)), body);
  writeFileSync(join(dl, "SHA256SUMS"), `${sha(body)}  ${tarballName(RELEASE)}\n`);

  const appHome = join(home, ".config", "herdr-app");
  const env = {
    HOME: home, TMPDIR: root, PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
    AUTOMAGIK_HERDR_RELEASE_URL: `file://${rel}`, AUTOMAGIK_HERDR_TTY: join(root, "no-tty"), AUTOMAGIK_HERDR_APPS: apps,
  };
  return {
    root, home, appHome, mods: join(appHome, "mods"), state: join(appHome, "automagik-herdr"),
    link: join(home, ".local", "bin", "automagik-herdr"),
    show: (name) => writeFileSync(shown, name),
    // The README's one-liner: `curl -fsSL …/install.sh | bash -s -- --yes`, the script on stdin.
    oneLiner: (...args) => {
      const r = spawnSync("bash", ["-s", "--", ...args], { cwd: root, env, encoding: "utf8", input: readFileSync(INSTALL) });
      return { code: r.status, out: r.stdout, err: r.stderr };
    },
    herdrLog: () => readFileSync(log, "utf8").split("\n").filter(Boolean),
    brewCalls: () => readFileSync(brew, "utf8").split("\n").filter(Boolean),
  };
}

/** What every install must leave: the whole pack, as archived, activated and set up. */
function assertFullPack(m, r) {
  const { x } = pack();
  assert.equal(r.code, 0, `${r.out}\n${r.err}`);
  assert.deepEqual(m.brewCalls(), [], "Homebrew is never run");
  // Every PACK_MODS folder installed, byte-identical to the archive (exec bits too); only the
  // private paths update.mjs carries over (.state, dotfiles, node_modules) may be added.
  for (const mod of PACK_MODS) {
    assert.ok(existsSync(join(m.mods, mod, "mod.json")), `${mod} is installed`);
    assert.deepEqual(files(join(m.mods, mod), { skip: PRIVATE }), files(join(x, mod)), `${mod} is byte-identical to the archive`);
  }
  assert.equal(readFileSync(join(m.mods, "spaces-agents", "VERSION"), "utf8"), `${RELEASE}\n`);
  // The ownership record lists every pack folder, and the output names them all: never a
  // sidebar-only install that reads like a complete one.
  const mark = readFileSync(join(m.state, "installed-by-install.sh"), "utf8");
  assert.match(mark, new RegExp(`^version=${RELEASE.replaceAll(".", "\\.")}$`, "m"));
  assert.deepEqual(/^mods=(.*)$/m.exec(mark)?.[1].split(",").sort(), [...PACK_MODS].sort());
  const said = /Installed the pack (\S+) in .*: (.*)\.$/m.exec(r.out);
  assert.ok(said, r.out);
  assert.equal(said[1], RELEASE);
  assert.deepEqual(said[2].split(", ").sort(), [...PACK_MODS].sort());
  // herdr-app check on every pack mod.
  assert.deepEqual(m.herdrLog().filter((l) => l.startsWith("check ")).map((l) => l.slice(6)).sort(), PACK_MODS.map((mod) => join(m.mods, mod)).sort());
  // The pack layout (the archive's), and the pack's copy kept for later comparisons.
  const shipped = readFileSync(join(x, PACK_LAYOUT));
  assert.deepEqual(readFileSync(join(m.appHome, PACK_LAYOUT)), shipped, "the automagik layout is the pack's");
  assert.deepEqual(readFileSync(join(m.state, "automagik.json")), shipped);
  // Activation: the layout shows the sidebar, the footer rail, the tab bar, both panels and the
  // Markdown menu; the sidebar's + opens new-menu-tui; every pack mod it names is installed.
  const layout = JSON.parse(shipped);
  const blocks = [];
  const walk = (n) => { if (n.content?.mod) blocks.push(n.content); (n.children ?? []).forEach(walk); };
  walk(layout);
  const named = blocks.map((c) => c.mod);
  for (const mod of ["spaces-agents", "auto-tabs", "automations", "am-quota"]) assert.ok(named.includes(mod), `the layout names ${mod}`);
  assert.deepEqual(blocks.find((c) => c.mod === "sidebar-chrome")?.props, { footer: true }, "the footer rail");
  assert.equal(layout.terminal_menu, "md-menu");
  assert.match(readFileSync(join(m.mods, "spaces-agents", "main.js"), "utf8"), /openOverlay\(\{ mod: "new-menu-tui"/, "the sidebar's + opens new-menu-tui");
  for (const mod of [...named, layout.terminal_menu].filter((n) => PACK_MODS.includes(n))) assert.ok(existsSync(join(m.mods, mod, "mod.json")), `${mod} (in the layout) is installed`);
  // The mod manager: its catalog and its key (merged only where free).
  assert.deepEqual(JSON.parse(readFileSync(join(m.appHome, "data", "mod-manager", "catalog.json"), "utf8")), { url: CATALOG_URL });
  const keys = JSON.parse(readFileSync(join(m.appHome, "keys.json"), "utf8"));
  for (const [section, entries] of Object.entries(PACK_KEYS)) for (const [key, action] of Object.entries(entries)) assert.equal(keys[section]?.[key], action, `key ${key}`);
  for (const mod of PACK_MODS) assert.ok(existsSync(join(m.mods, mod)), mod);
  // The command, linked to the installed sidebar's CLI.
  assert.equal(readlinkSync(m.link), join(m.mods, "spaces-agents", "bin", "automagik-herdr.mjs"));
  return keys;
}

test("e2e: release.yml's pack is the whole pack: every PACK_MODS folder plus the layout, nothing else", { skip: !haveGit && "no git work tree" }, () => {
  const { x } = pack();
  assert.deepEqual(readdirSync(x).sort(), [...PACK_MODS, "layouts"].sort());
  assert.deepEqual(readdirSync(join(x, "layouts")), ["automagik.json"]);
  assert.equal(readFileSync(join(x, "spaces-agents", "VERSION"), "utf8"), `${RELEASE}\n`);
  // Each folder holds what git tracks under mods/<mod>, byte for byte.
  for (const mod of PACK_MODS) {
    const tracked = git(["ls-files", "--", `mods/${mod}`]).split("\n").filter(Boolean).map((p) => p.slice(`mods/${mod}/`.length)).sort();
    assert.deepEqual([...files(join(x, mod)).keys()].sort(), tracked.sort(), `${mod}: the archive holds every tracked file`);
  }
});

test("e2e (a): a fresh home gets the whole pack, activated, from the public one-liner", { skip: !haveGit && "no git work tree" }, (t) => {
  const m = machine(t);
  const r = m.oneLiner("--yes");
  assertFullPack(m, r);
  assert.match(r.out, /added the automagik layout/);
  assert.match(r.out, /To show the Automagik sidebar, switch Herdr to the automagik layout/, "no status: the switch command is printed");
  assert.match(readFileSync(join(m.state, "installed-by-install.sh"), "utf8"), /^layout=added$/m);
});

test("e2e (b): a v0.4.0 sidebar-only install is replaced by the whole pack; a personal layout learns what it lacks", { skip: !haveGit && "no git work tree" }, (t) => {
  const m = machine(t);
  // What v0.3.x-v0.4.0's install.sh left (git show v0.4.0:install.sh, lines 296-307): a v1 marker, the
  // sidebar-only spaces-agents with its layout and state, the layout v0.2.0-v0.4.0 shipped (the
  // same bytes), and the link to the sidebar's CLI.
  const old = join(m.mods, "spaces-agents");
  mkdirSync(join(old, "bin"), { recursive: true });
  mkdirSync(join(old, "layouts"));
  mkdirSync(join(old, ".state"));
  const v03layout = readFileSync(join(ROOT, "test", "fixtures", "layout-v0.2.0.json"));
  assert.equal(sha(v03layout), V020_LAYOUT_SHA256, "v0.2.0-v0.4.0 shipped these bytes");
  writeFileSync(join(old, "VERSION"), `${OLD}\n`);
  writeFileSync(join(old, "mod.json"), "{\"place\":\"none\",\"title\":\"Spaces & Agents\"}\n");
  writeFileSync(join(old, "main.js"), `// spaces-agents ${OLD}, sidebar only\n`);
  exe(join(old, "bin", "automagik-herdr.mjs"), "#!/usr/bin/env node\n");
  writeFileSync(join(old, "layouts", "automagik.json"), v03layout);
  writeFileSync(join(old, ".state", "projects.json"), "[\"/work/acme\"]\n");
  mkdirSync(join(m.appHome, "layouts"), { recursive: true });
  writeFileSync(join(m.appHome, PACK_LAYOUT), v03layout);
  mkdirSync(m.state, { recursive: true });
  writeFileSync(join(m.state, "installed-by-install.sh"), `version=${OLD}\nbefore=none\nlayout=added\n`);
  mkdirSync(dirname(m.link), { recursive: true });
  symlinkSync(join(old, "bin", "automagik-herdr.mjs"), m.link);
  assert.notEqual(OLD, RELEASE, "an upgrade, never the same-version path (#44)");
  // As in the issue: the installing agent adapted a personal layout to show the sidebar beside
  // Sheepdog, and Herdr shows it.
  const sheepdog = join(m.mods, "sheepdog");
  mkdirSync(sheepdog);
  writeFileSync(join(sheepdog, "mod.json"), "{\"place\":\"none\",\"title\":\"Sheepdog\"}\n");
  writeFileSync(join(sheepdog, "main.js"), "// sheepdog\n");
  const personal = join(m.appHome, "layouts", "main-agents.json");
  const mine = `${JSON.stringify({ id: "root", type: "row", children: [
    { id: "spaces", type: "block", content: { mod: "spaces-agents" }, children: [] },
    { id: "dog", type: "block", content: { mod: "sheepdog" }, children: [] },
  ] }, null, 2)}\n`;
  writeFileSync(personal, mine);
  m.show("main-agents");
  const dogBefore = files(sheepdog);

  const r = m.oneLiner("--yes");
  assertFullPack(m, r);
  // The sidebar-only pack is replaced and kept as the rollback set; its state carried over.
  assert.equal(readFileSync(join(m.state, ".prev", "spaces-agents", "VERSION"), "utf8"), `${OLD}\n`);
  assert.equal(readFileSync(join(old, ".state", "projects.json"), "utf8"), "[\"/work/acme\"]\n", "the sidebar's state carried over");
  assert.match(r.out, new RegExp(`The folders it replaced \\(${OLD.replaceAll(".", "\\.")}\\) are kept in .*\\.prev`));
  assert.match(r.out, /replaced the automagik layout .*an older release shipped/, "v0.4's unchanged layout becomes the pack's (D8)");
  // The personal layout and Sheepdog are untouched, and nothing switched the person's layout...
  assert.equal(readFileSync(personal, "utf8"), mine);
  assert.deepEqual(files(sheepdog), dogBefore);
  assert.deepEqual(m.herdrLog().filter((l) => l.startsWith("do ")), []);
  // ...but the output says what that layout lacks and how it gains it.
  const lines = r.out.split("\n"), at = lines.findIndex((l) => l.includes(personal));
  assert.ok(at >= 0, `the output names ${personal}:\n${r.out}`);
  const note = `${lines[at]}\n${lines[at + 1]}`;
  for (const what of ["footer rail (sidebar-chrome)", "tab bar (auto-tabs)", "Markdown menu (md-menu)", "automations panel", "quota panel (am-quota)"]) {
    assert.ok(note.includes(what), `it names the ${what}: ${note}`);
  }
  assert.ok(note.includes(join(m.state, "automagik.json")), `it points at the pack's layout to copy from: ${note}`);
});

test("e2e (c): a personal layout and an unrelated mod (sheepdog) stay as they were; keys and catalog merge", { skip: !haveGit && "no git work tree" }, (t) => {
  const m = machine(t);
  const sheepdog = join(m.mods, "sheepdog");
  mkdirSync(join(sheepdog, ".state"), { recursive: true });
  writeFileSync(join(sheepdog, "mod.json"), "{\"place\":\"none\",\"title\":\"Sheepdog\"}\n");
  writeFileSync(join(sheepdog, "main.js"), "// sheepdog\n");
  writeFileSync(join(sheepdog, ".state", "flock.json"), "{\"sheep\":12}\n");
  const personal = join(m.appHome, "layouts", "pasture.json");
  mkdirSync(dirname(personal), { recursive: true });
  const mine = "{\"id\":\"root\",\"type\":\"row\",\"children\":[{\"id\":\"dog\",\"type\":\"block\",\"content\":{\"mod\":\"sheepdog\"},\"children\":[]}]}\n";
  writeFileSync(personal, mine);
  writeFileSync(join(m.appHome, "keys.json"), "{\"global\":{\"cmd-shift-d\":\"mod.open:sheepdog\"}}\n");
  m.show("pasture");
  const dogBefore = files(sheepdog);

  const r = m.oneLiner("--yes");
  const keys = assertFullPack(m, r);
  assert.equal(keys.global["cmd-shift-d"], "mod.open:sheepdog", "the person's key stays");
  assert.deepEqual(files(sheepdog), dogBefore, "sheepdog is byte-identical, its state too");
  assert.equal(readFileSync(personal, "utf8"), mine, "the personal layout is untouched");
  assert.deepEqual(readdirSync(join(m.appHome, "layouts")).sort(), ["automagik.json", "pasture.json"]);
  assert.deepEqual(readdirSync(m.mods).sort(), [...PACK_MODS, "sheepdog"].sort(), "nothing else in mods/");
  // A layout that doesn't show the sidebar gets no note: --yes switches to the pack's layout.
  assert.ok(!r.out.includes(personal), r.out);
  assert.deepEqual(m.herdrLog().filter((l) => l.startsWith("do ")), ['do layout.switch {"name":"automagik"}']);
});
