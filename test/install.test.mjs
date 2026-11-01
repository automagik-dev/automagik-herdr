// install.sh (A17) against a fake home, a fake release served from a folder (file:// URLs) and
// fake `uname`, `brew` and Herdr: never the real home, Homebrew or Herdr. Run with `sh`, so a
// bash-only construct fails here (CI's sh is dash).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  // herdr-app, when a test puts it on PATH: logs its arguments.
  const herdrLog = join(root, "herdr-app.log");
  writeFileSync(herdrLog, "");
  const addHerdrApp = () => exe(join(bin, "herdr-app"), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${herdrLog}"\n`);
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
  const herdrCalls = () => readFileSync(herdrLog, "utf8").split("\n").filter(Boolean);
  return { root, home, apps, appHome, pack, link, run, piped, publish, brewCalls, addHerdrApp, herdrCalls, extraEnv };
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

test("the bots layout: added when absent, switched to only with a yes; uninstall removes it only unchanged", (t) => {
  const s = scratch(t);
  s.addHerdrApp();
  s.publish("9.9.0");
  const layout = join(s.appHome, "layouts", "bots.json");
  // No terminal, no --yes: added, not switched.
  const r = s.run();
  assert.equal(r.code, 0, r.err);
  assert.equal(readFileSync(layout, "utf8"), readFileSync(join(PACK_SRC, "layouts", "bots.json"), "utf8"));
  assert.match(r.out, /To use it: herdr-app do layout\.switch/);
  assert.deepEqual(s.herdrCalls(), []);
  assert.equal(s.run("--uninstall").code, 0);
  assert.equal(existsSync(layout), false, "unchanged: removed");
  // --yes: switched.
  assert.equal(s.run("--yes").code, 0);
  assert.deepEqual(s.herdrCalls(), ['do layout.switch {"name":"bots"}']);
  // Edited by the person: kept on uninstall, never overwritten on install.
  writeFileSync(layout, "{\"mine\":true}\n");
  assert.equal(s.run("--uninstall").code, 0);
  assert.equal(readFileSync(layout, "utf8"), "{\"mine\":true}\n");
  assert.equal(s.run("--yes").code, 0);
  assert.equal(readFileSync(layout, "utf8"), "{\"mine\":true}\n");
  assert.equal(s.herdrCalls().length, 1);
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
