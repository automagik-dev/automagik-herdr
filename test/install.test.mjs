// install.sh (A17) against a fake home, a fake release served from a folder (file:// URLs) and
// fake `uname`, `brew` and Herdr: never the real home, Homebrew or Herdr. Run with `sh`, so a
// bash-only construct fails here (CI's sh is dash).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const INSTALL = join(ROOT, "install.sh");
const PACK_SRC = join(ROOT, "mods", "spaces-agents");
const LAYOUT_SRC = join(ROOT, "layouts", "automagik.json");
const { PACK_MODS, V020_LAYOUT_SHA256, parseMarker } = await import("../mods/spaces-agents/release.js");
const CASK = "penso/tap/herdr-gpui";

const exe = (path, text) => { writeFileSync(path, text); chmodSync(path, 0o755); };
const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
/** One digest over every file and link under `dir` (names, link targets, bytes). */
const treeSum = (dir) => {
  const h = createHash("sha256");
  const walk = (at, rel) => {
    for (const name of readdirSync(at).sort()) {
      const path = join(at, name), st = lstatSync(path);
      h.update(`${rel}${name}\0${st.mode}\0`);
      if (st.isSymbolicLink()) h.update(readlinkSync(path));
      else if (st.isDirectory()) walk(path, `${rel}${name}/`);
      else h.update(readFileSync(path));
    }
  };
  walk(dir, "");
  return h.digest("hex");
};

function scratch(t, { herdr = true, os = "Darwin" } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ah-install-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "home"), bin = join(root, "bin"), apps = join(root, "Applications"), rel = join(root, "release");
  for (const d of [home, bin, apps, rel]) mkdirSync(d, { recursive: true });
  if (herdr) mkdirSync(join(apps, "Herdr.app"));
  const brewLog = join(root, "brew.log");
  writeFileSync(brewLog, "");
  exe(join(bin, "uname"), `#!/bin/sh\necho ${os}\n`);
  // Homebrew: logs its arguments; the cask "installs" Herdr into the fake Applications.
  exe(join(bin, "brew"), `#!/bin/sh\necho "$*" >> "${brewLog}"\ncase "$*" in *--cask*) mkdir -p "${apps}/Herdr.app" ;; esac\n`);
  // herdr-app, when a test puts it on PATH: logs its arguments; `status` prints the layout
  // `show(name)` set (as JSON), or fails while none is set.
  const herdrLog = join(root, "herdr-app.log"), shownFile = join(root, "herdr-shown");
  writeFileSync(herdrLog, "");
  const addHerdrApp = () => exe(join(bin, "herdr-app"), `#!/bin/sh
printf '%s\\n' "$*" >> "${herdrLog}"
if [ "$1" = status ]; then
  [ -f "${shownFile}" ] || exit 1
  printf '{\\n  "layout": "%s",\\n  "zoom": false\\n}\\n' "$(cat "${shownFile}")"
fi
`);
  const show = (name) => writeFileSync(shownFile, name);
  const extraEnv = {};
  const env = {
    HOME: home, TMPDIR: root, PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
    AUTOMAGIK_HERDR_RELEASE_URL: `file://${rel}`, AUTOMAGIK_HERDR_TTY: join(root, "no-tty"), AUTOMAGIK_HERDR_APPS: apps,
  };
  const appHome = join(home, ".config", "herdr-app");
  const pack = join(appHome, "mods", "spaces-agents");
  const link = join(home, ".local", "bin", "automagik-herdr");
  const run = (...args) => {
    const r = spawnSync("sh", [INSTALL, ...args], { cwd: root, env: { ...env, ...extraEnv }, encoding: "utf8" });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  // As `curl … | sh -s -- <args>` runs it: the script is stdin.
  const piped = (...args) => {
    const r = spawnSync("sh", ["-s", "--", ...args], { cwd: root, env, encoding: "utf8", input: readFileSync(INSTALL) });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  /**
   * Publishes a release as release.yml packs it: every PACK_MODS folder of the repo plus
   * layouts/automagik.json, at `version`, or `edit(srcDir)` changing it first. As in a real release
   * only spaces-agents carries VERSION; each main.js ends in a `// release <v>` line, the code
   * change a release brings, so a test can tell which release a folder is from.
   */
  const publish = (version, { edit, sums, latest = true } = {}) => {
    const src = join(root, `src-${version}`);
    rmSync(src, { recursive: true, force: true });
    for (const m of PACK_MODS) {
      cpSync(join(ROOT, "mods", m), join(src, m), { recursive: true });
      writeFileSync(join(src, m, "main.js"), `${readFileSync(join(src, m, "main.js"), "utf8")}\n// release ${version}\n`);
    }
    writeFileSync(join(src, "spaces-agents", "VERSION"), `${version}\n`);
    mkdirSync(join(src, "layouts"));
    cpSync(LAYOUT_SRC, join(src, "layouts", "automagik.json"));
    edit?.(src);
    const name = `automagik-herdr-pack-${version}.tgz`;
    const dirs = [join(rel, "download", `v${version}`), ...(latest ? [join(rel, "latest", "download")] : [])];
    for (const dir of dirs) {
      mkdirSync(dir, { recursive: true });
      execFileSync("tar", ["-czf", join(dir, name), "-C", src, ...readdirSync(src)], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
      writeFileSync(join(dir, "SHA256SUMS"), `${sums ?? sha(join(dir, name))}  ${name}\n`);
    }
  };
  const brewCalls = () => readFileSync(brewLog, "utf8").split("\n").filter(Boolean);
  /** herdr-app's calls other than `status` and `check`. */
  const herdrCalls = () => readFileSync(herdrLog, "utf8").split("\n").filter((l) => l && l !== "status" && l !== "ls" && !l.startsWith("check "));
  const checks = () => readFileSync(herdrLog, "utf8").split("\n").filter((l) => l.startsWith("check "));
  const mark = () => readFileSync(join(appHome, "automagik-herdr", "installed-by-install.sh"), "utf8");
  const mods = join(appHome, "mods"), state = join(appHome, "automagik-herdr");
  /** Every pack folder's release (its VERSION), by name. */
  const versions = () => Object.fromEntries(PACK_MODS.map((m) => [m, /\/\/ release (\S+)\n$/.exec(readFileSync(join(mods, m, "main.js"), "utf8"))?.[1]]));
  const all = (v) => Object.fromEntries(PACK_MODS.map((m) => [m, v]));
  return { root, bin, home, apps, appHome, mods, state, pack, link, run, piped, publish, brewCalls, addHerdrApp, show, herdrCalls, checks, mark, versions, all, extraEnv, herdrLog };
}

test("install.sh is POSIX sh", () => {
  execFileSync("sh", ["-n", INSTALL]);
});

test("a fresh install puts the pack and the command in place; a second run changes nothing", (t) => {
  const s = scratch(t);
  s.publish("9.9.0");
  const r = s.run("--yes");
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(s.versions(), s.all("9.9.0"));
  assert.match(s.mark(), new RegExp(`^version=9\\.9\\.0\nmods=${PACK_MODS.join(",")}\nlayout=added\nbefore=none\n$`));
  assert.equal(readlinkSync(s.link), join(s.pack, "bin", "automagik-herdr.mjs"));
  assert.match(r.out, /Checksum: ok\.\n(  .*\n)*Installed the pack 9\.9\.0/);
  assert.deepEqual(JSON.parse(readFileSync(join(s.appHome, "keys.json"), "utf8")), { global: { "cmd-shift-m": "mod.open:mod-manager" } });
  assert.match(readFileSync(join(s.appHome, "data", "mod-manager", "catalog.json"), "utf8"), /automagik-herdr\/dev\/catalog\/index\.json/);
  assert.match(r.out, /Add ~\/\.local\/bin to your PATH/);
  const version = spawnSync(s.link, ["--version"], { encoding: "utf8", env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin` } });
  assert.equal(version.stdout.trim(), "automagik-herdr 9.9.0", version.stderr);
  assert.deepEqual(s.brewCalls(), []);
  const before = lstatSync(s.pack).ino;
  const again = s.run();
  assert.equal(again.code, 0, again.err);
  assert.match(again.out, /Automagik Herdr 9\.9\.0 is already up to date/);
  assert.doesNotMatch(again.out, /Downloading|Linked/);
  assert.equal(lstatSync(s.pack).ino, before);
  assert.equal(existsSync(join(s.state, ".prev")), false);
});

test("a newer release replaces the installed one; --version pins one", (t) => {
  const s = scratch(t);
  s.publish("9.9.0");
  assert.equal(s.run("--yes").code, 0);
  s.publish("9.10.0");
  const r = s.run("--yes");
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(s.versions(), s.all("9.10.0"));
  assert.match(r.out, /The folders it replaced \(9\.9\.0\) are kept in .*\.prev/);
  const pinned = s.run("--yes", "--version", "v9.9.0");
  assert.equal(pinned.code, 0, pinned.err);
  assert.deepEqual(s.versions(), s.all("9.9.0"));
  assert.equal(s.run("--version", "1.0.0").code, 1, "a release that isn't there");
});

test("Herdr missing with no terminal and no --yes: stops, prints the brew command, never runs brew", (t) => {
  const s = scratch(t, { herdr: false });
  s.publish("9.9.0");
  const r = s.run();
  assert.notEqual(r.code, 0);
  assert.match(r.err, /Herdr is not installed\. Run: brew install --cask penso\/tap\/herdr-gpui/);
  assert.deepEqual(s.brewCalls(), []);
  assert.equal(existsSync(s.pack), false);
});

test("Herdr missing with --yes: installed with the Homebrew cask, then the pack", (t) => {
  const s = scratch(t, { herdr: false });
  s.publish("9.9.0");
  const r = s.run("--yes");
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(s.brewCalls(), [`install --cask ${CASK}`]);
  assert.equal(readFileSync(join(s.pack, "VERSION"), "utf8").trim(), "9.9.0");
});

test("a tarball that doesn't match SHA256SUMS installs nothing", (t) => {
  const s = scratch(t);
  s.publish("9.9.0", { sums: "0".repeat(64) });
  const r = s.run("--yes");
  assert.equal(r.code, 1);
  assert.match(r.err, /does not match SHA256SUMS .*nothing was installed/);
  assert.equal(existsSync(s.appHome), false, "nothing written before the checksum");
  assert.equal(existsSync(s.link), false);
});

test("a tarball holding a symlink installs nothing, and leaves the old pack", (t) => {
  const s = scratch(t);
  mkdirSync(s.pack, { recursive: true });
  writeFileSync(join(s.pack, "main.js"), "// the old pack\n");
  s.publish("9.9.0", { edit: (dir) => symlinkSync("/etc/passwd", join(dir, "auto-tabs", "evil")) });
  const r = s.run("--yes");
  assert.equal(r.code, 1);
  assert.match(r.err, /nothing was installed: .*evil: not a plain file or folder/);
  assert.equal(readFileSync(join(s.pack, "main.js"), "utf8"), "// the old pack\n");
  assert.equal(existsSync(s.link), false);
  assert.deepEqual(readdirSync(s.mods), ["spaces-agents"]);
});

test("a foreign folder in the tarball (not its PACK_MODS, or pocket-link) is refused, and nothing is installed", (t) => {
  const s = scratch(t);
  for (const extra of ["evil-mod", "pocket-link"]) {
    s.publish("9.9.0", { edit: (dir) => { mkdirSync(join(dir, extra)); writeFileSync(join(dir, extra, "main.js"), "x\n"); writeFileSync(join(dir, extra, "mod.json"), "{}\n"); } });
    const r = s.run("--yes");
    assert.equal(r.code, 1, extra);
    assert.match(r.err, extra === "pocket-link" ? /pocket-link\/.*outside the pack's folders/ : /are not its PACK_MODS/);
    assert.equal(existsSync(s.mods), false, extra);
  }
});

test("--uninstall puts the adopted pack back and removes the command; bots and settings stay", (t) => {
  const s = scratch(t);
  mkdirSync(s.pack, { recursive: true });
  writeFileSync(join(s.pack, "main.js"), "// the owner's clone\n");
  writeFileSync(join(s.pack, "mod.json"), "{}\n");
  writeFileSync(join(s.appHome, "settings.json"), "{\"theme\":\"mine\"}\n");
  const project = join(s.home, "proj", ".herdr");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "bots.json"), "{\"version\":1}\n");
  s.publish("9.9.0");
  assert.equal(s.run("--yes", "--adopt").code, 0);
  assert.equal(readFileSync(join(s.pack, "VERSION"), "utf8").trim(), "9.9.0");
  const r = s.run("--uninstall");
  assert.equal(r.code, 0, r.err);
  assert.equal(readFileSync(join(s.pack, "main.js"), "utf8"), "// the owner's clone\n");
  assert.equal(existsSync(s.link), false);
  assert.equal(readFileSync(join(s.appHome, "settings.json"), "utf8"), "{\"theme\":\"mine\"}\n");
  assert.equal(readFileSync(join(project, "bots.json"), "utf8"), "{\"version\":1}\n");
  const again = s.run("--uninstall");
  assert.equal(again.code, 0);
  assert.match(again.out, /Nothing to uninstall/);
  assert.equal(readFileSync(join(s.pack, "main.js"), "utf8"), "// the owner's clone\n");
});

test("--uninstall with nothing there before moves the pack out of mods/, never deletes it", (t) => {
  const s = scratch(t);
  s.publish("9.9.0");
  assert.equal(s.run("--yes").code, 0);
  const r = s.run("--uninstall");
  assert.equal(r.code, 0, r.err);
  assert.equal(existsSync(s.pack), false);
  assert.deepEqual(readdirSync(s.mods), []);
  assert.equal(readFileSync(join(s.state, ".prev", "spaces-agents", "VERSION"), "utf8").trim(), "9.9.0");
  assert.match(readFileSync(join(s.state, ".prev", ".pack"), "utf8"), new RegExp(`^mods=${PACK_MODS.join(",")}$`, "m"));
});

test("a command link the person pointed elsewhere is never replaced or removed; one into this install is", (t) => {
  const s = scratch(t);
  const theirs = join(s.root, "elsewhere", "automagik-herdr.mjs");
  mkdirSync(dirname(theirs), { recursive: true });
  writeFileSync(theirs, "#!/usr/bin/env node\n");
  mkdirSync(dirname(s.link), { recursive: true });
  symlinkSync(theirs, s.link);
  s.publish("9.9.0");
  const r = s.run("--yes");
  assert.equal(r.code, 0, r.err);
  assert.equal(readlinkSync(s.link), theirs);
  assert.match(r.out, /Left .*automagik-herdr alone: it points at .*elsewhere\/automagik-herdr\.mjs, not this install\./);
  const again = s.run();
  assert.match(again.out, /is already up to date/, "a link of the person's own doesn't make every run reinstall");
  const gone = s.run("--uninstall");
  assert.equal(gone.code, 0, gone.err);
  assert.equal(readlinkSync(s.link), theirs);
  assert.match(gone.out, /Left .*automagik-herdr: it points at .*elsewhere/);
  // A link elsewhere under mods/ is not the pack's command: still the person's.
  rmSync(s.link);
  symlinkSync(join(s.mods, "other-mod", "bin", "cli.mjs"), s.link);
  assert.equal(s.run("--yes").code, 0);
  assert.equal(readlinkSync(s.link), join(s.mods, "other-mod", "bin", "cli.mjs"));
  // The pack's own command path (an earlier install's, even dangling) is ours: replaced, then removed.
  assert.equal(s.run("--uninstall").code, 0);
  rmSync(s.link);
  symlinkSync(join(s.pack, "bin", "automagik-herdr.mjs"), s.link);
  assert.equal(s.run("--yes").code, 0);
  assert.equal(readlinkSync(s.link), join(s.pack, "bin", "automagik-herdr.mjs"));
  assert.equal(s.run("--uninstall").code, 0);
  assert.equal(readdirSync(dirname(s.link)).includes("automagik-herdr"), false);
});

test("not macOS: explains and exits 1; Node too old with no brew: says where to get it", (t) => {
  const linux = scratch(t, { os: "Linux" });
  const r = linux.run("--yes");
  assert.equal(r.code, 1);
  assert.match(r.err, /runs on macOS .*this is Linux/);
  const old = scratch(t);
  exe(join(old.root, "bin", "node"), "#!/bin/sh\nif [ \"$1\" = --version ]; then echo v18.0.0; exit 0; fi\nexit 1\n");
  rmSync(join(old.root, "bin", "brew"));
  const n = old.run("--yes");
  assert.equal(n.code, 1);
  assert.match(n.err, /Node 22\.7 or later is needed \(found: v18\.0\.0\)\. Install it from https:\/\/nodejs\.org/);
});

test("--help and an unknown option", (t) => {
  const s = scratch(t);
  assert.match(s.run("--help").out, /install\.sh --uninstall/);
  assert.match(s.run("--help").out, /needs v0\.5\.0 or later/);
  assert.match(s.run("--help").out, /--adopt replaces a pack-named mod/);
  assert.equal(s.run("--nope").code, 2);
});

test("the README's agent prompt is docs/agent-install.md, word for word", () => {
  const prompt = readFileSync(join(ROOT, "docs", "agent-install.md"), "utf8");
  assert.ok(prompt.split("\n").length <= 25);
  assert.ok(readFileSync(join(ROOT, "README.md"), "utf8").includes(`\`\`\`text\n${prompt}\`\`\`\n`));
});

test("piped into sh (curl | sh -s -- --yes), with Herdr from brew, the whole script runs", (t) => {
  const s = scratch(t, { herdr: false });
  s.publish("9.9.0");
  const r = s.piped("--yes");
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(s.brewCalls(), [`install --cask ${CASK}`]);
  assert.match(r.out, /Done: Automagik Herdr 9\.9\.0\./);
});

const today = () => new Date().toISOString().slice(0, 10);

test("adopt, then update twice: the adopted original stays in backup/, and --uninstall puts it back", (t) => {
  const s = scratch(t);
  mkdirSync(join(s.mods, "sidebar-chrome", ".state"), { recursive: true });
  writeFileSync(join(s.mods, "sidebar-chrome", "main.js"), "// hand-installed\n");
  writeFileSync(join(s.mods, "sidebar-chrome", ".state", "rail.json"), "{\"tab\":\"mods\"}\n");
  const original = treeSum(join(s.mods, "sidebar-chrome"));
  s.publish("9.9.0");
  const first = s.run("--yes", "--adopt");
  assert.equal(first.code, 0, first.err);
  const backup = join(s.state, "backup", `sidebar-chrome-${today()}`);
  assert.ok(first.out.includes(`adopted mods/sidebar-chrome: the original is kept in ${backup}`), first.out);
  assert.match(s.mark(), /^adopted=sidebar-chrome:backup\/sidebar-chrome-\d{4}-\d\d-\d\d$/m);
  assert.equal(readFileSync(join(s.mods, "sidebar-chrome", ".state", "rail.json"), "utf8"), "{\"tab\":\"mods\"}\n", "its state carried over");
  for (const v of ["9.10.0", "9.11.0"]) {
    s.publish(v);
    const r = s.run("--yes");
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(s.versions(), s.all(v));
    assert.equal(treeSum(backup), original, `${v}: the adopted original is untouched`);
    assert.equal(existsSync(join(s.state, ".prev", "sidebar-chrome", "main.js")), true);
  }
  assert.deepEqual(readdirSync(join(s.state, "backup")), [`sidebar-chrome-${today()}`]);
  const r = s.run("--uninstall");
  assert.equal(r.code, 0, r.err);
  assert.equal(treeSum(join(s.mods, "sidebar-chrome")), original);
  assert.equal(existsSync(backup), false);
  assert.deepEqual(readdirSync(s.mods), ["sidebar-chrome"]);
});

test("old-named folders the installer didn't write are left alone without --adopt; --uninstall leaves them too", (t) => {
  const s = scratch(t);
  const mine = {};
  for (const m of ["spaces-agents", "auto-tabs"]) {
    mkdirSync(join(s.mods, m, "bin"), { recursive: true });
    writeFileSync(join(s.mods, m, "main.js"), `// ${m}, hand-placed\n`);
    writeFileSync(join(s.mods, m, "VERSION"), "9.9.0\n");
    mine[m] = treeSum(join(s.mods, m));
  }
  s.publish("9.9.0");
  const first = s.run("--yes");
  assert.equal(first.code, 0, first.err);
  assert.match(first.out, /left alone: mods\/auto-tabs \(not installed by automagik-herdr; --adopt/);
  assert.match(first.out, /Left .*automagik-herdr as it is: .*spaces-agents is not this installer's/);
  assert.match(s.mark(), new RegExp(`^mods=${PACK_MODS.filter((m) => !(m in mine)).join(",")}$`, "m"));
  for (const m in mine) assert.equal(treeSum(join(s.mods, m)), mine[m], m);
  assert.equal(existsSync(s.link), false);
  const r = s.run("--uninstall");
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(readdirSync(s.mods), ["auto-tabs", "spaces-agents"]);
  for (const m in mine) assert.equal(treeSum(join(s.mods, m)), mine[m], m);
});

test("a v0.2.0-shaped home: rerunning install.sh installs the pack beside it, then --adopt takes the hand-installed mods", (t) => {
  const s = scratch(t);
  // v0.2.x: its marker, its spaces-agents and kept copies, its bots-only layout; hand-installed mods.
  mkdirSync(s.state, { recursive: true });
  writeFileSync(join(s.state, "installed-by-install.sh"), "version=0.2.2\nbefore=kept\nlayout=added\n");
  for (const dir of [s.pack, join(s.state, "spaces-agents.prev"), join(s.state, "spaces-agents.before-install")]) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "main.js"), `// ${dir}\n`);
  }
  mkdirSync(join(s.pack, ".state"));
  writeFileSync(join(s.pack, ".state", "projects.json"), "[]\n");
  writeFileSync(join(s.pack, "VERSION"), "0.2.2\n");
  // The layout v0.2 shipped, byte for byte (`git show v0.2.0:mods/spaces-agents/layouts/automagik.json`).
  const v020 = readFileSync(join(ROOT, "test", "fixtures", "layout-v0.2.0.json"));
  assert.equal(createHash("sha256").update(v020).digest("hex"), V020_LAYOUT_SHA256);
  const layout = join(s.appHome, "layouts", "automagik.json");
  mkdirSync(dirname(layout));
  writeFileSync(layout, v020);
  const hand = {};
  for (const m of ["sidebar-chrome", "auto-tabs"]) {
    mkdirSync(join(s.mods, m));
    writeFileSync(join(s.mods, m, "main.js"), `// ${m} by hand\n`);
    hand[m] = treeSum(join(s.mods, m));
  }
  s.publish("9.9.0");
  const r = s.run("--yes");
  assert.equal(r.code, 0, r.err);
  for (const m in hand) assert.equal(treeSum(join(s.mods, m)), hand[m], `${m} untouched without --adopt`);
  assert.equal(readFileSync(join(s.pack, "VERSION"), "utf8").trim(), "9.9.0");
  assert.equal(readFileSync(join(s.pack, ".state", "projects.json"), "utf8"), "[]\n", "v0.2's state carried over");
  assert.equal(readFileSync(layout, "utf8"), readFileSync(LAYOUT_SRC, "utf8"), "v0.2's unchanged layout replaced (D8)");
  assert.equal(readFileSync(join(s.state, ".prev", "spaces-agents", "VERSION"), "utf8"), "0.2.2\n");
  const backups = readdirSync(join(s.state, "backup")).sort();
  assert.deepEqual(backups, [`spaces-agents-before-install-${today()}`, `spaces-agents-v0.2-prev-${today()}`]);
  assert.match(s.mark(), /^layout=added$/m);
  assert.match(s.mark(), /^adopted=spaces-agents:backup\/spaces-agents-before-install-/m);
  const adopt = s.run("--yes", "--adopt");
  assert.equal(adopt.code, 0, adopt.err);
  assert.deepEqual(s.versions(), s.all("9.9.0"));
  for (const m in hand) assert.equal(treeSum(join(s.state, "backup", `${m}-${today()}`)), hand[m], `${m} moved to backup/ first`);
  const un = s.run("--uninstall");
  assert.equal(un.code, 0, un.err);
  for (const m in hand) assert.equal(treeSum(join(s.mods, m)), hand[m], `${m} put back`);
  assert.equal(readFileSync(join(s.pack, "main.js"), "utf8"), `// ${join(s.state, "spaces-agents.before-install")}\n`, "the pack from before v0.2's first install");
});

test("a v1 marker is still uninstalled: v0.2's spaces-agents leaves, its first pack comes back", (t) => {
  const s = scratch(t);
  mkdirSync(join(s.state, "spaces-agents.before-install"), { recursive: true });
  writeFileSync(join(s.state, "installed-by-install.sh"), "version=0.2.2\nbefore=kept\n");
  writeFileSync(join(s.state, "spaces-agents.before-install", "main.js"), "// before\n");
  mkdirSync(s.pack, { recursive: true });
  writeFileSync(join(s.pack, "main.js"), "// v0.2.2\n");
  const r = s.run("--uninstall");
  assert.equal(r.code, 0, r.err);
  assert.equal(readFileSync(join(s.pack, "main.js"), "utf8"), "// before\n");
  assert.equal(readFileSync(join(s.state, ".prev", "spaces-agents", "main.js"), "utf8"), "// v0.2.2\n");
});

test("install, update, rollback, uninstall: a planted pocket-link stays byte-identical", (t) => {
  const s = scratch(t);
  const pocket = join(s.mods, "pocket-link");
  mkdirSync(join(pocket, ".state"), { recursive: true });
  writeFileSync(join(pocket, "main.js"), "// automagik-pocket's\n");
  writeFileSync(join(pocket, ".state", "pairing.key"), "secret\n");
  symlinkSync("/nowhere", join(pocket, "dangling"));
  const sum = treeSum(pocket);
  s.addHerdrApp();
  s.publish("9.9.0");
  assert.equal(s.run("--yes").code, 0);
  assert.equal(s.checks().length, PACK_MODS.length, "herdr-app check on every pack mod");
  assert.equal(s.checks().some((c) => c.includes("pocket-link")), false);
  assert.equal(treeSum(pocket), sum, "after install");
  s.publish("9.10.0");
  assert.equal(s.run("--yes").code, 0);
  assert.equal(treeSum(pocket), sum, "after update");
  const env = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: s.home, HERDR_APP_HOME: s.appHome };
  const back = spawnSync(s.link, ["update", "--rollback"], { encoding: "utf8", env });
  assert.equal(back.status, 0, back.stderr);
  assert.deepEqual(s.versions(), s.all("9.9.0"));
  assert.match(s.mark(), /^version=9\.9\.0$/m);
  assert.equal(treeSum(pocket), sum, "after rollback");
  assert.equal(s.run("--uninstall").code, 0);
  assert.deepEqual(readdirSync(s.mods), ["pocket-link"]);
  assert.equal(treeSum(pocket), sum, "after uninstall");
});

test("free keys only, and an unreadable keys.json stops the install before any folder moves", (t) => {
  const s = scratch(t);
  mkdirSync(s.appHome, { recursive: true });
  writeFileSync(join(s.appHome, "keys.json"), JSON.stringify({ global: { "cmd-shift-m": "mine.thing" } }));
  s.publish("9.9.0");
  const r = s.run("--yes");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /key = cmd-shift-m stays mine\.thing/);
  assert.deepEqual(JSON.parse(readFileSync(join(s.appHome, "keys.json"), "utf8")), { global: { "cmd-shift-m": "mine.thing" } });
  const bad = scratch(t);
  mkdirSync(bad.appHome, { recursive: true });
  writeFileSync(join(bad.appHome, "keys.json"), "{ nope");
  bad.publish("9.9.0");
  const b = bad.run("--yes");
  assert.equal(b.code, 1);
  assert.match(b.err, /keys\.json is unreadable .*nothing was installed/);
  assert.equal(existsSync(bad.mods), false);
});

test("a failing herdr-app check exits 1 after installing, naming the mod and the rollback", (t) => {
  const s = scratch(t);
  s.addHerdrApp();
  writeFileSync(join(s.bin, "herdr-app"), `${readFileSync(join(s.bin, "herdr-app"), "utf8")}case "$2" in */auto-tabs) echo broken >&2; exit 1 ;; esac\n`);
  s.publish("9.9.0");
  const r = s.run("--yes");
  assert.equal(r.code, 1);
  assert.match(r.out, /check FAILED: auto-tabs: broken/);
  assert.match(r.err, /herdr-app check failed .*update --rollback/);
  assert.deepEqual(s.versions(), s.all("9.9.0"));
});

const HINT = /the sidebar appears after this:\n  herdr-app do layout\.switch '\{"name":"automagik"\}'\n$/;

test("the automagik layout: added when absent, switched to only with a yes; uninstall removes it only unchanged", (t) => {
  const s = scratch(t);
  s.addHerdrApp();
  s.show("main");
  s.publish("9.9.0");
  const layout = join(s.appHome, "layouts", "automagik.json");
  // No terminal, no --yes: added, not switched; the command is printed.
  const r = s.run();
  assert.equal(r.code, 0, r.err);
  assert.equal(readFileSync(layout, "utf8"), readFileSync(LAYOUT_SRC, "utf8"));
  assert.match(r.out, HINT);
  assert.match(s.mark(), /^layout=added$/m);
  assert.deepEqual(s.herdrCalls(), []);
  assert.equal(s.run("--uninstall").code, 0);
  assert.equal(existsSync(layout), false, "unchanged: removed");
  // --yes: switched, no command printed.
  const yes = s.run("--yes");
  assert.equal(yes.code, 0, yes.err);
  assert.deepEqual(s.herdrCalls(), ['do layout.switch {"name":"automagik"}']);
  assert.doesNotMatch(yes.out, /the sidebar appears after this/);
  // Edited by the person: kept on uninstall, never overwritten, never switched to by itself.
  writeFileSync(layout, "{\"mine\":true}\n");
  assert.equal(s.run("--uninstall").code, 0);
  assert.equal(readFileSync(layout, "utf8"), "{\"mine\":true}\n");
  const again = s.run("--yes");
  assert.equal(again.code, 0, again.err);
  assert.equal(readFileSync(layout, "utf8"), "{\"mine\":true}\n");
  assert.equal(s.herdrCalls().length, 1);
  assert.match(again.out, HINT);
});

test("the switch is offered again while Herdr shows another layout: a --yes re-run switches; on automagik, nothing", (t) => {
  const s = scratch(t);
  s.addHerdrApp();
  s.show("main");
  s.publish("9.9.0");
  assert.equal(s.run().code, 0);
  assert.deepEqual(s.herdrCalls(), []);
  const rerun = s.run("--yes");
  assert.equal(rerun.code, 0, rerun.err);
  assert.match(rerun.out, /already up to date/);
  assert.deepEqual(s.herdrCalls(), ['do layout.switch {"name":"automagik"}']);
  s.show("automagik");
  const quiet = s.run("--yes");
  assert.equal(quiet.code, 0, quiet.err);
  assert.equal(s.herdrCalls().length, 1, "already shown: not switched again");
  assert.doesNotMatch(quiet.out, /layout\.switch|sidebar appears/);
});

test("a layout already showing the pack (the owner's main-agents): --yes switches nothing, prints nothing", (t) => {
  const s = scratch(t);
  s.addHerdrApp();
  s.show("main-agents");
  const own = join(s.appHome, "layouts", "main-agents.json");
  mkdirSync(dirname(own), { recursive: true });
  writeFileSync(own, JSON.stringify({ id: "root", children: [{ id: "spaces", content: { mod: "spaces-agents" } }] }, null, 2));
  s.publish("9.9.0");
  const r = s.run("--yes");
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(s.herdrCalls(), []);
  assert.doesNotMatch(r.out, /layout\.switch|sidebar appears/);
});

test("no herdr-app, or no status from it: the command is printed and nothing else is tried", (t) => {
  const s = scratch(t);
  s.publish("9.9.0");
  const none = s.run("--yes");
  assert.equal(none.code, 0, none.err);
  assert.match(none.out, HINT);
  s.addHerdrApp(); // no layout set: `status` fails
  const nostatus = s.run("--yes");
  assert.equal(nostatus.code, 0, nostatus.err);
  assert.match(nostatus.out, HINT);
  assert.deepEqual(s.herdrCalls(), []);
});

test("a layout the person copied by hand is never removed, even unchanged", (t) => {
  const s = scratch(t);
  const layout = join(s.appHome, "layouts", "automagik.json");
  mkdirSync(dirname(layout), { recursive: true });
  cpSync(LAYOUT_SRC, layout);
  s.publish("9.9.0");
  assert.equal(s.run("--yes").code, 0);
  assert.match(s.mark(), /^layout=kept$/m);
  assert.equal(s.run("--uninstall").code, 0);
  assert.equal(existsSync(layout), true);
});

test("--uninstall leaves a pack folder that became a symlink in place, and moves the rest", (t) => {
  const s = scratch(t);
  s.publish("9.9.0");
  assert.equal(s.run("--yes").code, 0);
  const real = join(s.root, "elsewhere");
  cpSync(s.pack, real, { recursive: true });
  rmSync(s.pack, { recursive: true });
  symlinkSync(real, s.pack);
  const r = s.run("--uninstall");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Left .*spaces-agents: it is a link/);
  assert.equal(lstatSync(s.pack).isSymbolicLink(), true);
  assert.deepEqual(readdirSync(s.mods), ["spaces-agents"]);
});

test("AUTOMAGIK_HERDR_RELEASE_URL: a file:// folder or this repository on GitHub only, always said", (t) => {
  const s = scratch(t);
  s.publish("9.9.0");
  const ok = s.run("--yes");
  assert.match(ok.out, /^Releases from file:\/\/.* \(AUTOMAGIK_HERDR_RELEASE_URL\)\.$/m);
  s.extraEnv.AUTOMAGIK_HERDR_RELEASE_URL = "https://evil.example/releases";
  const bad = s.run("--yes");
  assert.equal(bad.code, 1);
  assert.match(bad.err, /must be a file:\/\/ folder or https:\/\/github\.com\/automagik-dev\/automagik-herdr/);
});

test("AUTOMAGIK_HERDR_RELEASE_URL with '..' or '%' is refused before anything is fetched", (t) => {
  const s = scratch(t);
  const curlLog = join(s.root, "curl.log");
  writeFileSync(curlLog, "");
  exe(join(s.bin, "curl"), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${curlLog}"\nexit 1\n`);
  for (const url of [
    "https://github.com/automagik-dev/automagik-herdr/../../evil/repo/releases",
    "https://github.com/automagik-dev/automagik-herdr/%2e%2e/%2e%2e/evil/repo/releases",
  ]) {
    s.extraEnv.AUTOMAGIK_HERDR_RELEASE_URL = url;
    const r = s.run("--yes");
    assert.equal(r.code, 1, url);
    assert.match(r.err, /must not contain '\.\.' or '%'/);
  }
  assert.equal(readFileSync(curlLog, "utf8"), "");
  assert.equal(existsSync(s.pack), false);
});

test("both downloads keep the path as written (curl --path-as-is)", () => {
  const calls = readFileSync(INSTALL, "utf8").split("\n").filter((l) => /^\s+curl /.test(l));
  assert.equal(calls.length, 2);
  for (const l of calls) assert.match(l, /^\s+curl -fsSL --path-as-is "\$base\//);
});

test("no override (the real curl | bash path): no unbound variable, no override line, up to the macOS check", (t) => {
  const s = scratch(t, { os: "Linux" });
  s.extraEnv.AUTOMAGIK_HERDR_RELEASE_URL = "";
  const r = s.run("--yes");
  assert.equal(r.code, 1, r.err);
  assert.doesNotMatch(r.err, /unbound|parameter not set/i);
  assert.doesNotMatch(r.out, /AUTOMAGIK_HERDR_RELEASE_URL/);
  assert.match(r.err + r.out, /macOS/);
});

test("a download cut short runs nothing (the body is one function called on the last line)", (t) => {
  const s = scratch(t, { herdr: false });
  s.publish("9.9.0");
  const text = readFileSync(INSTALL, "utf8");
  for (const cut of [0.3, 0.6, 0.95]) {
    const part = text.slice(0, Math.floor(text.length * cut));
    const r = spawnSync("sh", ["-s", "--", "--yes"], { cwd: s.root, input: part, encoding: "utf8",
      env: { HOME: s.home, PATH: `${join(s.root, "bin")}:${dirname(process.execPath)}:/usr/bin:/bin` } });
    assert.equal(r.stdout, "", `cut at ${cut}`);
  }
  assert.deepEqual(s.brewCalls(), []);
  assert.equal(existsSync(s.pack), false);
});

test("every pack mod docks nowhere by itself; the shipped layout names only pack mods and stock Herdr mods", () => {
  // place "left" plus a layout that also names spaces-agents made Herdr show two sidebars.
  for (const m of PACK_MODS) assert.equal(JSON.parse(readFileSync(join(ROOT, "mods", m, "mod.json"), "utf8")).place, "none", m);
  const stock = new Set(["changes", "files", "pane", "tabs", "workspace-chrome", "workspace-status", "spaces", "agents"]);
  const named = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      if (typeof node.mod === "string") named.push(node.mod);
      Object.values(node).forEach(walk);
    }
  };
  walk(JSON.parse(readFileSync(LAYOUT_SRC, "utf8")));
  assert.ok(named.includes("spaces-agents"));
  assert.deepEqual(named.filter((m) => !PACK_MODS.includes(m) && !stock.has(m)), []);
  assert.deepEqual(readdirSync(join(ROOT, "layouts")), ["automagik.json"]);
  assert.equal(existsSync(join(PACK_SRC, "layouts")), false, "one layout: the root one (D8)");
  assert.deepEqual(readdirSync(join(ROOT, "mods")).filter((m) => m !== "pocket-link").sort(), [...PACK_MODS].sort());
});

test("rollback, or --uninstall, then a reinstall: a mod's .state comes back from the kept set", (t) => {
  const s = scratch(t);
  s.publish("9.9.0");
  assert.equal(s.run("--yes").code, 0);
  for (const m of ["am-quota", "auto-tabs"]) {
    mkdirSync(join(s.mods, m, ".state"));
    writeFileSync(join(s.mods, m, ".state", "cred"), `${m} secret\n`);
  }
  assert.equal(s.run("--uninstall").code, 0);
  assert.equal(existsSync(join(s.mods, "am-quota")), false);
  const again = s.run("--yes");
  assert.equal(again.code, 0, again.err);
  for (const m of ["am-quota", "auto-tabs"]) assert.equal(readFileSync(join(s.mods, m, ".state", "cred"), "utf8"), `${m} secret\n`, m);
});

test("--uninstall never glob-expands the record, and moves only backup/<name> paths it adopted", (t) => {
  const s = scratch(t);
  mkdirSync(join(s.state, "backup", "keep"), { recursive: true });
  writeFileSync(join(s.state, "backup", "keep", "main.js"), "// mine\n");
  mkdirSync(join(s.mods, "pocket-link"), { recursive: true });
  writeFileSync(join(s.mods, "pocket-link", "main.js"), "// pocket\n");
  writeFileSync(join(s.root, "auto-tabs"), "a file in the cwd a glob would find\n");
  mkdirSync(join(s.mods, "auto-tabs"));
  writeFileSync(join(s.mods, "auto-tabs", "main.js"), "// not the record's\n");
  const stateBefore = treeSum(s.state);
  writeFileSync(join(s.state, "installed-by-install.sh"),
    "version=9.9.0\nmods=*,auto-*\nbefore=none\nadopted=am-quota:,auto-tabs:.,md-menu:backup/,mod-manager:backup/../..,new-menu-tui:/etc,automations:backup/*,sidebar-chrome:backup/.hidden\n");
  const r = s.run("--uninstall");
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(readdirSync(s.mods), ["auto-tabs", "pocket-link"], "nothing put back; `auto-*` matched nothing");
  assert.equal(readFileSync(join(s.mods, "auto-tabs", "main.js"), "utf8"), "// not the record's\n");
  assert.equal(readFileSync(join(s.mods, "pocket-link", "main.js"), "utf8"), "// pocket\n");
  rmSync(join(s.state, "installed-by-install.sh"), { force: true });
  assert.equal(treeSum(s.state), stateBefore, "the state folder is whole");
  assert.deepEqual(parseMarker("mods=a\nadopted=a:,b:.,c:backup/,d:backup/../x,e:backup/ok,pocket-link:backup/p\n").adopted, [{ mod: "e", path: "backup/ok" }]);
});
