// The pack's updates over a fake release: no network, a temp app home for mods/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  LATEST_URL, applyUpdate, checkForUpdate, compareVersions, downloadUpdate, installUpdate, latestRelease, noticeText, parseSums,
  pickUpdate, prevDirOf, readVersion, rollback, stateDirOf, unsafeEntries, verifySha256,
} from "../mods/spaces-agents/update.mjs";

const UPDATE = fileURLToPath(new URL("../mods/spaces-agents/update.mjs", import.meta.url));
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

/** A pack folder at `version` under `parent`, as `tar czf … -C <parent> spaces-agents` packs it. */
function packDir(parent, version, { main = true, mod = true } = {}) {
  const dir = join(parent, "spaces-agents");
  mkdirSync(dir, { recursive: true });
  if (main) writeFileSync(join(dir, "main.js"), `export const v = "${version}";\n`);
  if (mod) writeFileSync(join(dir, "mod.json"), '{ "place": "left", "title": "Spaces" }\n');
  writeFileSync(join(dir, "VERSION"), `${version}\n`);
  return dir;
}
function tarball(version, opts) {
  const src = mkdtempSync(join(tmpdir(), "pack-src-"));
  packDir(src, version, opts);
  const out = join(src, `automagik-herdr-${version}.tgz`);
  execFileSync("tar", ["czf", out, "-C", src, "spaces-agents"], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  return { path: out, buf: readFileSync(out), src };
}
/** An app home with an installed pack at `version` (or none). */
function appHome(version) {
  const home = mkdtempSync(join(tmpdir(), "app-home-"));
  const mods = join(home, "mods");
  mkdirSync(mods);
  if (version) packDir(mods, version);
  return { home, mods };
}
const release = (version, extra = {}) => ({
  tag_name: `v${version}`, draft: false, prerelease: false, html_url: `https://github.com/x/releases/tag/v${version}`,
  assets: [
    { name: `automagik-herdr-${version}.tgz`, browser_download_url: `https://dl.test/v${version}/automagik-herdr-${version}.tgz` },
    { name: "SHA256SUMS", browser_download_url: `https://dl.test/v${version}/SHA256SUMS` },
  ],
  ...extra,
});
/** fetch over a table url → body (string, Buffer, object for JSON, or a status number). */
const fakeFetch = (table, calls = []) => async (url, init) => {
  calls.push({ url, init });
  const body = table[url];
  if (body === undefined) return new Response("not found", { status: 404 });
  if (typeof body === "number") return new Response("", { status: body });
  if (Buffer.isBuffer(body) || typeof body === "string") return new Response(body);
  return Response.json(body);
};

test("compareVersions orders by semver precedence", () => {
  assert.equal(compareVersions("0.10.0", "0.9.9"), 1);
  assert.equal(compareVersions("0.1.0", "0.1.0"), 0);
  assert.equal(compareVersions("0.1.0-rc.1", "0.1.0"), -1);
  assert.ok(Number.isNaN(compareVersions("v0.1.0", "0.1.0")));
});

test("pickUpdate offers only a newer, complete, published release", () => {
  const up = pickUpdate("0.1.0", release("0.2.0"));
  assert.equal(up.version, "0.2.0");
  assert.equal(up.tarball.name, "automagik-herdr-0.2.0.tgz");
  assert.equal(up.sums.url, "https://dl.test/v0.2.0/SHA256SUMS");
  assert.equal(pickUpdate("0.2.0", release("0.2.0")), null, "same version");
  assert.equal(pickUpdate("0.3.0", release("0.2.0")), null, "older");
  assert.equal(pickUpdate("0.1.0", release("0.2.0", { draft: true })), null);
  assert.equal(pickUpdate("0.1.0", release("0.2.0", { prerelease: true })), null);
  assert.equal(pickUpdate("0.1.0", release("0.2.0", { assets: [release("0.2.0").assets[0]] })), null, "no SHA256SUMS");
  assert.equal(pickUpdate("0.1.0", release("0.2.0", { assets: [release("0.2.0").assets[1]] })), null, "no tarball");
  assert.equal(pickUpdate("0.1.0", null), null);
  assert.equal(pickUpdate("0.0.0", release("0.1.0")).version, "0.1.0", "an unreleased install takes the first release");
  assert.match(noticeText(up), /Automagik Herdr 0\.2\.0 is out/);
});

test("latestRelease asks /latest with GitHub's headers, honours AUTOMAGIK_HERDR_NO_UPDATE, null on 404", async () => {
  const calls = [];
  const got = await latestRelease({ fetch: fakeFetch({ [LATEST_URL]: release("0.2.0") }, calls), env: {} });
  assert.equal(got.tag_name, "v0.2.0");
  assert.equal(calls[0].init.headers.accept, "application/vnd.github+json");
  assert.equal(calls[0].init.headers["user-agent"], "automagik-herdr");
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  const none = [];
  assert.equal(await latestRelease({ fetch: fakeFetch({}, none), env: { AUTOMAGIK_HERDR_NO_UPDATE: "1" } }), null);
  assert.equal(none.length, 0, "never asked");
  assert.equal(await latestRelease({ fetch: fakeFetch({}), env: {} }), null, "no release yet");
  await assert.rejects(latestRelease({ fetch: fakeFetch({ [LATEST_URL]: 403 }), env: {} }), /403/);
});

test("verifySha256 takes a match and refuses a mismatch or a missing name", () => {
  const buf = Buffer.from("pack");
  const sums = `${sha(buf)}  automagik-herdr-0.2.0.tgz\n${"0".repeat(64)} *other.tgz\n`;
  assert.equal(parseSums(sums).get("other.tgz"), "0".repeat(64));
  assert.equal(verifySha256(buf, sums, "automagik-herdr-0.2.0.tgz"), sha(buf));
  assert.throws(() => verifySha256(Buffer.from("tampered"), sums, "automagik-herdr-0.2.0.tgz"), /does not match SHA256SUMS/);
  assert.throws(() => verifySha256(buf, sums, "automagik-herdr-0.3.0.tgz"), /not in SHA256SUMS/);
});

test("downloadUpdate refuses a tarball whose checksum does not match, writing nothing", async () => {
  const t = tarball("0.2.0");
  const out = mkdtempSync(join(tmpdir(), "dl-"));
  try {
    const up = pickUpdate("0.1.0", release("0.2.0"));
    const bad = fakeFetch({ [up.sums.url]: `${"f".repeat(64)}  ${up.tarball.name}\n`, [up.tarball.url]: t.buf });
    await assert.rejects(downloadUpdate(up, { fetch: bad, dir: out }), /does not match SHA256SUMS/);
    assert.equal(existsSync(join(out, up.tarball.name)), false);
    const good = fakeFetch({ [up.sums.url]: `${sha(t.buf)}  ${up.tarball.name}\n`, [up.tarball.url]: t.buf });
    const path = await downloadUpdate(up, { fetch: good, dir: out });
    assert.deepEqual(readFileSync(path), t.buf);
  } finally {
    rmSync(t.src, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test("applyUpdate swaps the pack in, keeps the old one outside mods/, and rollback swaps back and forth", async () => {
  const { home, mods } = appHome("0.1.0");
  const t = tarball("0.2.0");
  try {
    const done = await applyUpdate({ tgzPath: t.path, version: "0.2.0", modsDir: mods });
    assert.equal(done.version, "0.2.0");
    assert.equal(readVersion(join(mods, "spaces-agents")), "0.2.0");
    assert.equal(done.prev, join(home, "automagik-herdr", "spaces-agents.prev"));
    assert.equal(stateDirOf(mods), join(home, "automagik-herdr"));
    assert.equal(readVersion(prevDirOf(mods)), "0.1.0");
    assert.deepEqual(execFileSync("ls", ["-A", mods], { encoding: "utf8" }).trim().split("\n"), ["spaces-agents"], "nothing else in mods/");
    assert.deepEqual(execFileSync("ls", ["-A", stateDirOf(mods)], { encoding: "utf8" }).trim().split("\n"), ["spaces-agents.prev"], "staging removed");

    assert.equal(rollback({ modsDir: mods }).version, "0.1.0");
    assert.equal(readVersion(prevDirOf(mods)), "0.2.0", "the rolled-back pack is kept");
    assert.equal(rollback({ modsDir: mods }).version, "0.2.0", "a second rollback undoes the first");

    const t3 = tarball("0.3.0");
    await applyUpdate({ tgzPath: t3.path, version: "0.3.0", modsDir: mods });
    assert.equal(readVersion(prevDirOf(mods)), "0.2.0", "only one pack is kept");
    rmSync(t3.src, { recursive: true, force: true });
  } finally {
    rmSync(t.src, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("applyUpdate refuses a pack without main.js or mod.json and leaves the installed one", async () => {
  const { home, mods } = appHome("0.1.0");
  const noMain = tarball("0.2.0", { main: false });
  const noMod = tarball("0.2.0", { mod: false });
  try {
    await assert.rejects(applyUpdate({ tgzPath: noMain.path, version: "0.2.0", modsDir: mods }), /no spaces-agents\/ with main\.js and mod\.json/);
    await assert.rejects(applyUpdate({ tgzPath: noMod.path, version: "0.2.0", modsDir: mods }), /refusing/);
    assert.equal(readVersion(join(mods, "spaces-agents")), "0.1.0");
    assert.equal(existsSync(prevDirOf(mods)), false);
    assert.deepEqual(execFileSync("ls", ["-A", stateDirOf(mods)], { encoding: "utf8" }).trim(), "", "staging removed");
  } finally {
    for (const t of [noMain, noMod]) rmSync(t.src, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("applyUpdate installs into an empty mods/ and refuses a linked checkout; rollback needs a kept pack", async () => {
  const { home, mods } = appHome(null);
  const t = tarball("0.2.0");
  try {
    assert.throws(() => rollback({ modsDir: mods }), /nothing to roll back to/);
    const done = await applyUpdate({ tgzPath: t.path, version: "0.2.0", modsDir: mods });
    assert.equal(done.prev, null);
    assert.equal(readVersion(join(mods, "spaces-agents")), "0.2.0");
    rmSync(join(mods, "spaces-agents"), { recursive: true });
    symlinkSync(t.src, join(mods, "spaces-agents"));
    await assert.rejects(applyUpdate({ tgzPath: t.path, version: "0.2.0", modsDir: mods }), /is a link/);
  } finally {
    rmSync(t.src, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("checkForUpdate and installUpdate against a fake release", async () => {
  const { home, mods } = appHome("0.1.0");
  const t = tarball("0.2.0");
  const rel = release("0.2.0");
  const table = { [LATEST_URL]: rel, [rel.assets[0].browser_download_url]: t.buf, [rel.assets[1].browser_download_url]: `${sha(t.buf)}  automagik-herdr-0.2.0.tgz\n` };
  try {
    const off = await checkForUpdate({ fetch: fakeFetch(table), env: { AUTOMAGIK_HERDR_NO_UPDATE: "1" }, modsDir: mods });
    assert.deepEqual(off, { current: "0.1.0", latest: null, update: null, disabled: true });
    const found = await checkForUpdate({ fetch: fakeFetch(table), env: {}, modsDir: mods });
    assert.equal(found.current, "0.1.0");
    assert.equal(found.latest, "0.2.0");
    assert.equal(found.update.version, "0.2.0");
    const done = await installUpdate({ fetch: fakeFetch(table), env: {}, modsDir: mods });
    assert.equal(done.installed.version, "0.2.0");
    const again = await installUpdate({ fetch: fakeFetch(table), env: {}, modsDir: mods });
    assert.equal(again.update, null);
    assert.equal(again.installed, null);
  } finally {
    rmSync(t.src, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("node update.mjs: one JSON line, no network with AUTOMAGIK_HERDR_NO_UPDATE=1, rollback by CLI", () => {
  const { home, mods } = appHome("0.1.0");
  try {
    const env = { ...process.env, HERDR_APP_HOME: home, AUTOMAGIK_HERDR_NO_UPDATE: "1" };
    const out = execFileSync(process.execPath, [UPDATE, "check"], { env, encoding: "utf8" });
    assert.deepEqual(JSON.parse(out), { current: "0.1.0", latest: null, update: null, disabled: true });
    let failed;
    try { execFileSync(process.execPath, [UPDATE, "rollback", "--mods", mods], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (error) { failed = error; }
    assert.equal(failed.status, 1);
    assert.match(JSON.parse(failed.stdout).error, /nothing to roll back to/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

/** One ustar entry: `type` "0" file, "1" hard link, "2" symlink, "5" folder, "6" fifo. */
function tarEntry(name, { type = "0", body = "", linkname = "", mode = 0o644 } = {}) {
  const data = Buffer.from(body);
  const h = Buffer.alloc(512);
  h.write(name, 0, 100, "utf8");
  h.write(`${mode.toString(8).padStart(7, "0")}\0`, 100);
  h.write("0000000\0", 108);
  h.write("0000000\0", 116);
  h.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124);
  h.write("00000000000\0", 136);
  h.write("        ", 148);
  h.write(type, 156);
  h.write(linkname, 157, 100, "utf8");
  h.write("ustar\0", 257);
  h.write("00", 263);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
  return Buffer.concat([h, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}
/** A gzipped tarball of a valid 0.2.0 pack plus `extra` entries ([name, options]). */
function crafted(dir, file, extra) {
  const entries = [
    ["spaces-agents/", { type: "5", mode: 0o755 }],
    ["spaces-agents/main.js", { body: "export {};\n" }],
    ["spaces-agents/mod.json", { body: '{ "place": "left" }\n' }],
    ["spaces-agents/VERSION", { body: "0.2.0\n" }],
    ...extra,
  ];
  const path = join(dir, file);
  writeFileSync(path, gzipSync(Buffer.concat([...entries.map(([n, o]) => tarEntry(n, o)), Buffer.alloc(1024)])));
  return path;
}

test("unsafeEntries: only plain files and folders under spaces-agents/", () => {
  assert.deepEqual(unsafeEntries(["spaces-agents/", "spaces-agents/main.js"], ["drwxr-xr-x 0 0 0 0 x spaces-agents/", "-rw-r--r-- 0 0 0 1 x spaces-agents/main.js"]), []);
  assert.match(unsafeEntries(["spaces-agents/l"], ["lrwxrwxrwx 0 0 0 0 x spaces-agents/l -> /etc"])[0], /not a plain file/);
  assert.match(unsafeEntries(["spaces-agents/h"], ["-rw-r--r-- 0 0 0 0 x spaces-agents/h link to spaces-agents/main.js"])[0], /not a plain file/);
  assert.match(unsafeEntries(["spaces-agents/../x"], ["-"])[0], /\.\. segment/);
  assert.match(unsafeEntries(["/etc/x"], ["-"])[0], /absolute/);
  assert.match(unsafeEntries(["other/x"], ["-"])[0], /outside spaces-agents/);
  assert.match(unsafeEntries([], [])[0], /empty/);
  assert.match(unsafeEntries(["a", "b"], ["-"])[0], /does not add up/);
});

test("applyUpdate refuses crafted tarballs (symlink, hard link, .., absolute, outside, fifo) and writes nothing", async () => {
  const { home, mods } = appHome("0.1.0");
  const dir = mkdtempSync(join(tmpdir(), "crafted-"));
  const cases = {
    symlink: [["spaces-agents/link", { type: "2", linkname: "/etc" }]],
    hardlink: [["spaces-agents/hard", { type: "1", linkname: "spaces-agents/main.js" }]],
    dotdot: [["spaces-agents/../evil.js", { body: "x" }]],
    absolute: [[`${home}/evil.js`, { body: "x" }]],
    outside: [["evil.js", { body: "x" }]],
    fifo: [["spaces-agents/pipe", { type: "6" }]],
  };
  try {
    for (const [label, extra] of Object.entries(cases)) {
      const tgz = crafted(dir, `${label}.tgz`, extra);
      await assert.rejects(applyUpdate({ tgzPath: tgz, version: "0.2.0", modsDir: mods }), /refusing it|Command failed/, label);
      assert.equal(readVersion(join(mods, "spaces-agents")), "0.1.0", `${label}: installed pack kept`);
      assert.equal(existsSync(join(home, "evil.js")), false, `${label}: nothing written outside`);
      assert.equal(existsSync(join(stateDirOf(mods), "evil.js")), false, `${label}: nothing written beside`);
    }
    const plain = crafted(dir, "plain.tgz", []);
    assert.equal((await applyUpdate({ tgzPath: plain, version: "0.2.0", modsDir: mods })).version, "0.2.0", "the same pack without them installs");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("applyUpdate refuses a tarball whose VERSION is not the release's, and needs the version", async () => {
  const { home, mods } = appHome("0.1.0");
  const t = tarball("0.2.0");
  try {
    await assert.rejects(applyUpdate({ tgzPath: t.path, version: "0.3.0", modsDir: mods }), /carries VERSION 0\.2\.0, not 0\.3\.0/);
    await assert.rejects(applyUpdate({ tgzPath: t.path, modsDir: mods }), /needs the release's version/);
    assert.equal(readVersion(join(mods, "spaces-agents")), "0.1.0");
  } finally {
    rmSync(t.src, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("a pack made as release.yml makes it (git archive of the tag's mods/spaces-agents) installs", async () => {
  const repo = fileURLToPath(new URL("..", import.meta.url));
  const { home, mods } = appHome("0.0.0");
  const tgz = join(home, "pack.tgz");
  try {
    execFileSync("git", ["archive", "--format=tar.gz", "--prefix=spaces-agents/", "-o", tgz, "HEAD:mods/spaces-agents"], { cwd: repo });
    const version = execFileSync("git", ["show", "HEAD:mods/spaces-agents/VERSION"], { cwd: repo, encoding: "utf8" }).trim();
    const done = await applyUpdate({ tgzPath: tgz, version, modsDir: mods });
    assert.equal(done.version, version);
    assert.ok(existsSync(join(mods, "spaces-agents", "update.mjs")));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("update.mjs runs from a copy of the pack outside the repository (no package.json), without warnings", () => {
  const home = mkdtempSync(join(tmpdir(), "installed-"));
  try {
    const pack = join(home, "mods", "spaces-agents");
    cpSync(fileURLToPath(new URL("../mods/spaces-agents", import.meta.url)), pack, { recursive: true });
    const r = spawnSync(process.execPath, [join(pack, "update.mjs"), "check"], {
      env: { ...process.env, HERDR_APP_HOME: home, AUTOMAGIK_HERDR_NO_UPDATE: "1", NODE_OPTIONS: "" }, encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, "");
    assert.equal(JSON.parse(r.stdout).current, readVersion(pack));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("update.mjs install needs --from and --version (install.sh's entry), else a usage error", () => {
  const script = fileURLToPath(new URL("../mods/spaces-agents/update.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [script, "install", "--from", "/nowhere.tgz"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /install --from <tgz> --version <v>/);
});
