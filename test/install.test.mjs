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
const CASK = "penso/tap/herdr-gpui";

const exe = (path, text) => { writeFileSync(path, text); chmodSync(path, 0o755); };
const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

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
  /** Publishes a release: the repo's pack at `version`, or `edit(packDir)` changing it first. */
  const publish = (version, { edit, sums, latest = true } = {}) => {
    const src = join(root, `src-${version}`);
    rmSync(src, { recursive: true, force: true });
    cpSync(PACK_SRC, join(src, "spaces-agents"), { recursive: true });
    writeFileSync(join(src, "spaces-agents", "VERSION"), `${version}\n`);
    edit?.(join(src, "spaces-agents"));
    const name = `automagik-herdr-${version}.tgz`;
    const dirs = [join(rel, "download", `v${version}`), ...(latest ? [join(rel, "latest", "download")] : [])];
    for (const dir of dirs) {
      mkdirSync(dir, { recursive: true });
      execFileSync("tar", ["-czf", join(dir, name), "-C", src, "spaces-agents"]);
      writeFileSync(join(dir, "SHA256SUMS"), `${sums ?? sha(join(dir, name))}  ${name}\n`);
    }
  };
  const brewCalls = () => readFileSync(brewLog, "utf8").split("\n").filter(Boolean);
  /** herdr-app's calls other than `status`. */
  const herdrCalls = () => readFileSync(herdrLog, "utf8").split("\n").filter((l) => l && l !== "status");
  const mark = () => readFileSync(join(appHome, "automagik-herdr", "installed-by-install.sh"), "utf8");
  return { root, bin, home, apps, appHome, pack, link, run, piped, publish, brewCalls, addHerdrApp, show, herdrCalls, mark, extraEnv };
}

test("install.sh is POSIX sh", () => {
  execFileSync("sh", ["-n", INSTALL]);
});

test("a fresh install puts the pack and the command in place; a second run changes nothing", (t) => {
  const s = scratch(t);
  s.publish("9.9.0");
  const r = s.run("--yes");
  assert.equal(r.code, 0, r.err);
  assert.equal(readFileSync(join(s.pack, "VERSION"), "utf8").trim(), "9.9.0");
  assert.equal(readlinkSync(s.link), join(s.pack, "bin", "automagik-herdr.mjs"));
  assert.match(r.out, /Checksum: ok\.\nInstalled the pack 9\.9\.0/);
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
  assert.equal(existsSync(join(s.appHome, "automagik-herdr", "spaces-agents.prev")), false);
});

test("a newer release replaces the installed one; --version pins one", (t) => {
  const s = scratch(t);
  s.publish("9.9.0");
  assert.equal(s.run("--yes").code, 0);
  s.publish("9.10.0");
  const r = s.run("--yes");
  assert.equal(r.code, 0, r.err);
  assert.equal(readFileSync(join(s.pack, "VERSION"), "utf8").trim(), "9.10.0");
  assert.match(r.out, /The pack it replaced \(9\.9\.0\) is kept/);
  const pinned = s.run("--yes", "--version", "v9.9.0");
  assert.equal(pinned.code, 0, pinned.err);
  assert.equal(readFileSync(join(s.pack, "VERSION"), "utf8").trim(), "9.9.0");
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
  assert.equal(existsSync(s.pack), false);
  assert.equal(existsSync(s.link), false);
});

test("a tarball holding a symlink installs nothing, and leaves the old pack", (t) => {
  const s = scratch(t);
  mkdirSync(s.pack, { recursive: true });
  writeFileSync(join(s.pack, "main.js"), "// the old pack\n");
  s.publish("9.9.0", { edit: (dir) => symlinkSync("/etc/passwd", join(dir, "evil")) });
  const r = s.run("--yes");
  assert.equal(r.code, 1);
  assert.match(r.err, /nothing was installed: .*evil: not a plain file or folder/);
  assert.equal(readFileSync(join(s.pack, "main.js"), "utf8"), "// the old pack\n");
  assert.equal(existsSync(s.link), false);
  assert.equal(existsSync(join(s.appHome, "automagik-herdr", "spaces-agents.before-install")), false);
});

test("--uninstall puts the old pack back and removes the command; bots and settings stay", (t) => {
  const s = scratch(t);
  mkdirSync(s.pack, { recursive: true });
  writeFileSync(join(s.pack, "main.js"), "// the owner's clone\n");
  writeFileSync(join(s.pack, "mod.json"), "{}\n");
  writeFileSync(join(s.appHome, "settings.json"), "{\"theme\":\"mine\"}\n");
  const project = join(s.home, "proj", ".herdr");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "bots.json"), "{\"version\":1}\n");
  s.publish("9.9.0");
  assert.equal(s.run("--yes").code, 0);
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
  assert.equal(readFileSync(join(s.appHome, "automagik-herdr", "spaces-agents.prev", "VERSION"), "utf8").trim(), "9.9.0");
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
  assert.match(s.run("--help").out, /needs v0\.1\.0 or later/);
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

test("install over a pack, update, uninstall: the pack from before the first install comes back", (t) => {
  const s = scratch(t);
  mkdirSync(s.pack, { recursive: true });
  writeFileSync(join(s.pack, "main.js"), "// the owner's clone\n");
  writeFileSync(join(s.pack, "mod.json"), "{}\n");
  s.publish("9.9.0");
  const first = s.run("--yes");
  assert.equal(first.code, 0, first.err);
  assert.match(first.out, /The pack from before the first install is kept in .*spaces-agents\.before-install/);
  s.publish("9.10.0");
  const update = s.run("--yes");
  assert.equal(update.code, 0, update.err);
  assert.doesNotMatch(update.out, /before the first install/);
  const before = join(s.appHome, "automagik-herdr", "spaces-agents.before-install");
  assert.equal(readFileSync(join(before, "main.js"), "utf8"), "// the owner's clone\n", "the copy is never overwritten");
  const r = s.run("--uninstall");
  assert.equal(r.code, 0, r.err);
  assert.equal(readFileSync(join(s.pack, "main.js"), "utf8"), "// the owner's clone\n");
  assert.equal(existsSync(before), false);
  assert.equal(readFileSync(join(s.appHome, "automagik-herdr", "spaces-agents.prev", "VERSION"), "utf8").trim(), "9.10.0");
});

test("a hand-placed pack already at the release's version: no marker, and --uninstall leaves it in mods/", (t) => {
  const s = scratch(t);
  mkdirSync(s.pack, { recursive: true });
  writeFileSync(join(s.pack, "main.js"), "// hand-placed\n");
  mkdirSync(join(s.pack, "bin"));
  writeFileSync(join(s.pack, "bin", "automagik-herdr.mjs"), "#!/usr/bin/env node\n");
  writeFileSync(join(s.pack, "VERSION"), "9.9.0\n");
  s.publish("9.9.0");
  const first = s.run("--yes");
  assert.equal(first.code, 0, first.err);
  assert.doesNotMatch(first.out, /Downloading/);
  assert.match(first.out, /was not installed by this script: it is left as it is/);
  assert.equal(existsSync(join(s.appHome, "automagik-herdr", "installed-by-install.sh")), false);
  const r = s.run("--uninstall");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Nothing to uninstall/);
  assert.equal(readFileSync(join(s.pack, "main.js"), "utf8"), "// hand-placed\n");
  assert.equal(existsSync(join(s.appHome, "automagik-herdr", "spaces-agents.prev")), false);
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
  assert.equal(readFileSync(layout, "utf8"), readFileSync(join(PACK_SRC, "layouts", "automagik.json"), "utf8"));
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
  cpSync(join(PACK_SRC, "layouts", "automagik.json"), layout);
  s.publish("9.9.0");
  assert.equal(s.run("--yes").code, 0);
  assert.doesNotMatch(s.mark(), /layout=/);
  assert.equal(s.run("--uninstall").code, 0);
  assert.equal(existsSync(layout), true);
});

test("--uninstall refuses a pack folder that is a symlink, and changes nothing", (t) => {
  const s = scratch(t);
  s.publish("9.9.0");
  assert.equal(s.run("--yes").code, 0);
  const real = join(s.root, "elsewhere");
  cpSync(s.pack, real, { recursive: true });
  rmSync(s.pack, { recursive: true });
  symlinkSync(real, s.pack);
  const r = s.run("--uninstall");
  assert.equal(r.code, 1);
  assert.match(r.err, /is a symlink/);
  assert.equal(lstatSync(s.pack).isSymbolicLink(), true);
  assert.equal(existsSync(join(s.appHome, "automagik-herdr", "installed-by-install.sh")), true);
  assert.equal(lstatSync(s.link).isSymbolicLink(), true);
});

test("a before-install copy cut short (.tmp) is cleared, then made whole", (t) => {
  const s = scratch(t);
  mkdirSync(s.pack, { recursive: true });
  writeFileSync(join(s.pack, "main.js"), "// the owner's clone\n");
  const state = join(s.appHome, "automagik-herdr");
  mkdirSync(join(state, "spaces-agents.before-install.tmp"), { recursive: true });
  writeFileSync(join(state, "spaces-agents.before-install.tmp", "half"), "");
  s.publish("9.9.0");
  assert.equal(s.run("--yes").code, 0);
  assert.equal(existsSync(join(state, "spaces-agents.before-install.tmp")), false);
  assert.equal(readFileSync(join(state, "spaces-agents.before-install", "main.js"), "utf8"), "// the owner's clone\n");
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

test("the sidebar mod docks nowhere by itself; the shipped layout names only it and stock Herdr mods", () => {
  // place "left" plus a layout that also names spaces-agents made Herdr show two sidebars.
  const mod = JSON.parse(readFileSync(join(PACK_SRC, "mod.json"), "utf8"));
  assert.equal(mod.place, "none");
  const stock = new Set(["changes", "files", "pane", "tabs", "workspace-chrome", "workspace-status", "spaces", "agents"]);
  const named = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      if (typeof node.mod === "string") named.push(node.mod);
      Object.values(node).forEach(walk);
    }
  };
  walk(JSON.parse(readFileSync(join(PACK_SRC, "layouts", "automagik.json"), "utf8")));
  assert.ok(named.includes("spaces-agents"));
  assert.deepEqual(named.filter((m) => m !== "spaces-agents" && !stock.has(m)), []);
  assert.deepEqual(readdirSync(join(PACK_SRC, "layouts")), ["automagik.json"]);
});
