// The pack's updates over a fake release: no network, a temp app home for mods/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  LATEST_URL, applyUpdate, checkForUpdate, compareVersions, downloadUpdate, installUpdate, latestRelease, noticeText, parseSums,
  markerOf, pickUpdate, prevSetOf, readMarker, readVersion, rollback, stateDirOf, unsafeEntries, verifySha256,
} from "../mods/spaces-agents/update.mjs";

const UPDATE = fileURLToPath(new URL("../mods/spaces-agents/update.mjs", import.meta.url));
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

/** A two-folder pack at `version` under `parent` (`mods` its PACK_MODS), as release.yml lays the tarball out. */
const MODS = ["auto-tabs", "spaces-agents"];
function packDir(parent, version, { main = true, mod = true, mods = MODS } = {}) {
  for (const m of mods) {
    const dir = join(parent, m);
    mkdirSync(dir, { recursive: true });
    if (main || m !== "spaces-agents") writeFileSync(join(dir, "main.js"), `export const v = "${version}";\n`);
    if (mod || m !== "spaces-agents") writeFileSync(join(dir, "mod.json"), '{ "place": "none" }\n');
  }
  const pack = join(parent, "spaces-agents");
  writeFileSync(join(pack, "VERSION"), `${version}\n`);
  writeFileSync(join(pack, "release.js"), `export const PACK_MODS = ${JSON.stringify(mods)};\n`);
  writeFileSync(join(pack, "update.mjs"), "// the pack's updater\n");
  return pack;
}
function tarball(version, opts) {
  const src = mkdtempSync(join(tmpdir(), "pack-src-"));
  const tree = join(src, "tree");
  packDir(tree, version, opts);
  const out = join(src, `automagik-herdr-pack-${version}.tgz`);
  execFileSync("tar", ["czf", out, "-C", tree, ...(opts?.mods ?? MODS)], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  return { path: out, buf: readFileSync(out), src };
}
/** An app home with the pack installed at `version` (or none), its ownership record listing it. */
function appHome(version, mods = MODS) {
  const home = mkdtempSync(join(tmpdir(), "app-home-"));
  const modsDir = join(home, "mods");
  mkdirSync(modsDir);
  if (version) {
    packDir(modsDir, version, { mods });
    mkdirSync(join(home, "automagik-herdr"));
    writeFileSync(join(home, "automagik-herdr", "installed-by-install.sh"), `version=${version}\nmods=${mods.join(",")}\nbefore=none\n`);
  }
  return { home, mods: modsDir };
}
const kept = (mods, m = "spaces-agents") => join(prevSetOf(mods), m);
const release = (version, extra = {}) => ({
  tag_name: `v${version}`, draft: false, prerelease: false, html_url: `https://github.com/x/releases/tag/v${version}`,
  assets: [
    { name: `automagik-herdr-pack-${version}.tgz`, browser_download_url: `https://dl.test/v${version}/automagik-herdr-pack-${version}.tgz` },
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
  assert.equal(up.tarball.name, "automagik-herdr-pack-0.2.0.tgz");
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
    assert.equal(done.prev, join(home, "automagik-herdr", ".prev"));
    assert.deepEqual(done.replaced, MODS);
    assert.equal(stateDirOf(mods), join(home, "automagik-herdr"));
    assert.equal(readVersion(kept(mods)), "0.1.0");
    assert.equal(readFileSync(join(kept(mods, "auto-tabs"), "main.js"), "utf8"), 'export const v = "0.1.0";\n', "the whole set is kept");
    assert.deepEqual(execFileSync("ls", ["-A", mods], { encoding: "utf8" }).trim().split("\n"), MODS, "nothing else in mods/");
    assert.deepEqual(execFileSync("ls", ["-A", stateDirOf(mods)], { encoding: "utf8" }).trim().split("\n"), [".prev", "installed-by-install.sh"], "staging removed");
    assert.equal(readMarker(mods).version, "0.2.0");

    assert.equal(rollback({ modsDir: mods }).version, "0.1.0");
    assert.equal(readMarker(mods).version, "0.1.0");
    assert.equal(readVersion(kept(mods)), "0.2.0", "the rolled-back pack is kept");
    assert.equal(rollback({ modsDir: mods }).version, "0.2.0", "a second rollback undoes the first");

    const t3 = tarball("0.3.0");
    await applyUpdate({ tgzPath: t3.path, version: "0.3.0", modsDir: mods });
    assert.equal(readVersion(kept(mods)), "0.2.0", "only one pack is kept");
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
    await assert.rejects(applyUpdate({ tgzPath: noMain.path, version: "0.2.0", modsDir: mods }), /spaces-agents\/ has no main\.js and mod\.json/);
    await assert.rejects(applyUpdate({ tgzPath: noMod.path, version: "0.2.0", modsDir: mods }), /refusing/);
    assert.equal(readVersion(join(mods, "spaces-agents")), "0.1.0");
    assert.equal(existsSync(prevSetOf(mods)), false);
    assert.deepEqual(execFileSync("ls", ["-A", stateDirOf(mods)], { encoding: "utf8" }).trim(), "installed-by-install.sh", "staging removed");
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
  const table = { [LATEST_URL]: rel, [rel.assets[0].browser_download_url]: t.buf, [rel.assets[1].browser_download_url]: `${sha(t.buf)}  automagik-herdr-pack-0.2.0.tgz\n` };
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
    ["spaces-agents/release.js", { body: 'export const PACK_MODS = ["spaces-agents"];\n' }],
    ["spaces-agents/update.mjs", { body: "//\n" }],
    ...extra,
  ];
  const path = join(dir, file);
  writeFileSync(path, gzipSync(Buffer.concat([...entries.map(([n, o]) => tarEntry(n, o)), Buffer.alloc(1024)])));
  return path;
}

test("unsafeEntries: only plain files and folders in pack folders, plus layouts/automagik.json", () => {
  assert.deepEqual(unsafeEntries(["spaces-agents/", "spaces-agents/main.js"], ["drwxr-xr-x 0 0 0 0 x spaces-agents/", "-rw-r--r-- 0 0 0 1 x spaces-agents/main.js"]), []);
  assert.match(unsafeEntries(["spaces-agents/l"], ["lrwxrwxrwx 0 0 0 0 x spaces-agents/l -> /etc"])[0], /not a plain file/);
  assert.match(unsafeEntries(["spaces-agents/h"], ["-rw-r--r-- 0 0 0 0 x spaces-agents/h link to spaces-agents/main.js"])[0], /not a plain file/);
  assert.match(unsafeEntries(["spaces-agents/../x"], ["-"])[0], /\.\. segment/);
  assert.match(unsafeEntries(["/etc/x"], ["-"])[0], /absolute/);
  assert.deepEqual(unsafeEntries(["auto-tabs/main.js", "layouts/", "layouts/automagik.json"], ["-", "d", "-"]), []);
  for (const outside of ["evil.js", "pocket-link/main.js", "layouts/other.json", "Bad/x"]) {
    assert.match(unsafeEntries([outside], ["-"])[0], /outside the pack's folders/, outside);
  }
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

test("a pack made as release.yml makes it (git archive of the tag's mods/spaces-agents) installs", async (t) => {
  const repo = fileURLToPath(new URL("..", import.meta.url));
  try {
    execFileSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: repo, stdio: "ignore" });
  } catch {
    t.skip("not a git checkout (an export?): git archive needs the repository's history");
    return;
  }
  const { home, mods } = appHome(null);
  const tgz = join(home, "pack.tgz");
  try {
    // release.yml's Pack step: the tag's PACK_MODS folders of mods/ plus the root layout.
    const { PACK_MODS } = await import("../mods/spaces-agents/release.js");
    const layout = join(home, "automagik.json");
    writeFileSync(layout, execFileSync("git", ["show", "HEAD:layouts/automagik.json"], { cwd: repo }));
    execFileSync("git", ["archive", "--format=tar.gz", "-o", tgz, "--prefix=layouts/", `--add-file=${layout}`, "--prefix=", "HEAD:mods", "--", ...PACK_MODS], { cwd: repo });
    const top = [...new Set(execFileSync("tar", ["-tzf", tgz], { encoding: "utf8" }).split("\n").filter(Boolean).map((n) => n.split("/")[0]))].sort();
    assert.deepEqual(top, [...PACK_MODS, "layouts"].sort());
    const version = execFileSync("git", ["show", "HEAD:mods/spaces-agents/VERSION"], { cwd: repo, encoding: "utf8" }).trim();
    const done = await applyUpdate({ tgzPath: tgz, version, modsDir: mods });
    assert.equal(done.version, version);
    assert.deepEqual(done.installed, [...PACK_MODS].sort());
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

test("update.mjs install needs --from and --version (install.sh's entry); any unknown flag is a usage error", () => {
  const home = mkdtempSync(join(tmpdir(), "strict-"));
  try {
    for (const args of [["install", "--from", "/nowhere.tgz"], ["rollback", "--mod", home], ["update", "--chek"], ["install", "--from", "/x.tgz", "--version", "1.0.0", "--mods"], ["nope"]]) {
      const r = spawnSync(process.execPath, [UPDATE, ...args], { encoding: "utf8", env: { ...process.env, HERDR_APP_HOME: home } });
      assert.equal(r.status, 2, args.join(" "));
      assert.match(r.stdout, /install --from <tgz> --version <v>/);
    }
    assert.equal(execFileSync("ls", ["-A", home], { encoding: "utf8" }), "", "nothing written");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a failure in the middle of the swap renames every folder back, and the record and kept set are unchanged", async () => {
  const { home, mods } = appHome("0.1.0");
  const t = tarball("0.2.0");
  try {
    let n = 0;
    const rename = (a, b) => { if (++n === 3) throw new Error("disk full"); renameSync(a, b); };
    await assert.rejects(applyUpdate({ tgzPath: t.path, version: "0.2.0", modsDir: mods, rename }), /disk full/);
    for (const m of MODS) assert.equal(readFileSync(join(mods, m, "main.js"), "utf8"), 'export const v = "0.1.0";\n', m);
    assert.equal(readMarker(mods).version, "0.1.0");
    assert.deepEqual(execFileSync("ls", ["-A", stateDirOf(mods)], { encoding: "utf8" }).trim(), "installed-by-install.sh", "no staging, no half set");
    await applyUpdate({ tgzPath: t.path, version: "0.2.0", modsDir: mods });
    n = 0;
    assert.throws(() => rollback({ modsDir: mods, rename }), /disk full/);
    assert.equal(readVersion(join(mods, "spaces-agents")), "0.2.0");
    assert.equal(readVersion(kept(mods)), "0.1.0");
  } finally {
    rmSync(t.src, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("private paths are carried on update and rollback; a symlinked .state stays a link", async () => {
  const { home, mods } = appHome("0.1.0");
  const t = tarball("0.2.0");
  const elsewhere = mkdtempSync(join(tmpdir(), "state-"));
  try {
    symlinkSync(elsewhere, join(mods, "spaces-agents", ".state"));
    mkdirSync(join(mods, "auto-tabs", "node_modules", "x"), { recursive: true });
    writeFileSync(join(mods, "auto-tabs", ".tabs.json"), "{}\n");
    await applyUpdate({ tgzPath: t.path, version: "0.2.0", modsDir: mods });
    assert.equal(lstatSync(join(mods, "spaces-agents", ".state")).isSymbolicLink(), true);
    assert.equal(readlinkSync(join(mods, "spaces-agents", ".state")), elsewhere);
    assert.equal(readFileSync(join(mods, "auto-tabs", ".tabs.json"), "utf8"), "{}\n");
    assert.ok(existsSync(join(mods, "auto-tabs", "node_modules", "x")));
    writeFileSync(join(mods, "auto-tabs", ".tabs.json"), "{\"newer\":true}\n");
    rollback({ modsDir: mods });
    assert.equal(readVersion(join(mods, "spaces-agents")), "0.1.0");
    assert.equal(readFileSync(join(mods, "auto-tabs", ".tabs.json"), "utf8"), "{\"newer\":true}\n", "rollback carries the latest state back");
    assert.equal(readlinkSync(join(mods, "spaces-agents", ".state")), elsewhere);
  } finally {
    for (const d of [t.src, home, elsewhere]) rmSync(d, { recursive: true, force: true });
  }
});

test("a folder not in the record is left alone, or adopted to backup/; a retired one leaves with the set; rollback refuses a foreign folder", async () => {
  const { home, mods } = appHome("0.1.0", ["spaces-agents", "old-mod"]);
  const t = tarball("0.2.0");
  try {
    mkdirSync(join(mods, "auto-tabs"));
    writeFileSync(join(mods, "auto-tabs", "main.js"), "// mine\n");
    const left = await applyUpdate({ tgzPath: t.path, version: "0.2.0", modsDir: mods });
    assert.deepEqual([left.left, left.replaced, left.retired], [["auto-tabs"], ["spaces-agents"], ["old-mod"]]);
    assert.equal(readFileSync(join(mods, "auto-tabs", "main.js"), "utf8"), "// mine\n");
    assert.equal(existsSync(join(mods, "old-mod")), false);
    assert.ok(existsSync(join(kept(mods, "old-mod"), "main.js")));
    assert.deepEqual(readMarker(mods).mods, ["spaces-agents"]);
    assert.throws(() => { mkdirSync(join(mods, "old-mod")); rollback({ modsDir: mods }); }, /mods\/old-mod is not this installer's: nothing rolled back/);
    rmSync(join(mods, "old-mod"), { recursive: true });
    const adopted = await applyUpdate({ tgzPath: t.path, version: "0.2.0", modsDir: mods, adopt: true });
    assert.deepEqual(adopted.adopted.map((a) => a.mod), ["auto-tabs"]);
    assert.equal(readFileSync(join(adopted.adopted[0].backup, "main.js"), "utf8"), "// mine\n");
    assert.deepEqual(readMarker(mods).mods, MODS);
    assert.match(readFileSync(markerOf(mods), "utf8"), /^adopted=auto-tabs:backup\/auto-tabs-\d{4}-\d\d-\d\d$/m);
  } finally {
    rmSync(t.src, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("release.js's PACK_KEYS and CATALOG_URL equal the repository's keys.json and the mod manager's index URL", async () => {
  const { PACK_KEYS, CATALOG_URL } = await import("../mods/spaces-agents/release.js");
  const core = await import("../mods/mod-manager/core.js");
  assert.deepEqual(JSON.parse(JSON.stringify(PACK_KEYS)), JSON.parse(readFileSync(new URL("../keys.json", import.meta.url), "utf8")));
  assert.equal(CATALOG_URL, core.CATALOG_URL);
});

test("rollback then reinstall: a folder only the newer set had comes back with its .state", async () => {
  const { home, mods } = appHome("0.1.0", ["spaces-agents"]);
  const t = tarball("0.2.0");
  try {
    await applyUpdate({ tgzPath: t.path, version: "0.2.0", modsDir: mods });
    mkdirSync(join(mods, "auto-tabs", ".state"));
    writeFileSync(join(mods, "auto-tabs", ".state", "cred"), "SECRET\n");
    rollback({ modsDir: mods });
    assert.equal(existsSync(join(mods, "auto-tabs")), false);
    assert.equal(readFileSync(join(kept(mods, "auto-tabs"), ".state", "cred"), "utf8"), "SECRET\n");
    const again = await applyUpdate({ tgzPath: t.path, version: "0.2.0", modsDir: mods });
    assert.deepEqual(again.installed, ["auto-tabs"]);
    assert.equal(readFileSync(join(mods, "auto-tabs", ".state", "cred"), "utf8"), "SECRET\n");
  } finally {
    rmSync(t.src, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("a failure after the swap never deletes the replaced folders, and says where they are", async () => {
  const { home, mods } = appHome("0.1.0");
  const t = tarball("0.2.0");
  try {
    // The kept set cannot take its new place: the install stands, the record names it, and the
    // replaced 0.1.0 folders wait in .prev-next-<pid>-<random> with the old set back in .prev.
    await applyUpdate({ tgzPath: t.path, version: "0.2.0", modsDir: mods });
    const rename = (a, b) => { if (b === prevSetOf(mods)) throw new Error("EPERM"); renameSync(a, b); };
    const t3 = tarball("0.3.0");
    const r = await applyUpdate({ tgzPath: t3.path, version: "0.3.0", modsDir: mods, rename });
    rmSync(t3.src, { recursive: true, force: true });
    assert.equal(readVersion(join(mods, "spaces-agents")), "0.3.0");
    assert.equal(readMarker(mods).version, "0.3.0");
    assert.equal(r.prev, null);
    const next = /they are in (\S+)$/.exec(r.warnings[0])?.[1];
    assert.match(r.warnings[0], new RegExp(`could not become the kept set .*they are in ${join(stateDirOf(mods), ".prev-next-")}${process.pid}-[0-9a-f]{8}$`));
    assert.equal(readVersion(join(next, "spaces-agents")), "0.2.0", "the replaced folders are kept");
    assert.equal(readVersion(kept(mods)), "0.1.0", "the older set is back in .prev, still a rollback point");
  } finally {
    rmSync(t.src, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("an older kept set that cannot be removed is reported, and the new set is still kept", { skip: process.getuid?.() === 0 }, async () => {
  const { home, mods } = appHome("0.1.0");
  const t = tarball("0.2.0");
  const t3 = tarball("0.3.0");
  const locked = () => join(stateDirOf(mods), readdirSync(stateDirOf(mods), { encoding: "utf8" }).find((n) => n.startsWith(".prev-old-")) ?? ".prev", "auto-tabs");
  try {
    await applyUpdate({ tgzPath: t.path, version: "0.2.0", modsDir: mods });
    chmodSync(join(prevSetOf(mods), "auto-tabs"), 0o555);
    const r = await applyUpdate({ tgzPath: t3.path, version: "0.3.0", modsDir: mods });
    assert.match(r.warnings[0], /older kept set could not be removed .*\.prev-old-/);
    assert.equal(readVersion(join(mods, "spaces-agents")), "0.3.0");
    assert.equal(readVersion(kept(mods)), "0.2.0", "the set just replaced is the kept one");
    chmodSync(locked(), 0o755);
  } finally {
    for (const d of [t.src, t3.src, home]) rmSync(d, { recursive: true, force: true });
  }
});

test("an earlier run's leftover .prev-next-<pid> or .prev-old-<pid> (a reused pid) is never deleted", async () => {
  const { home, mods } = appHome("0.1.0");
  const t = tarball("0.2.0");
  try {
    for (const n of [`.prev-next-${process.pid}`, `.prev-old-${process.pid}`]) {
      mkdirSync(join(stateDirOf(mods), n, "spaces-agents"), { recursive: true });
      writeFileSync(join(stateDirOf(mods), n, "spaces-agents", "main.js"), "// left by a failed run\n");
    }
    await applyUpdate({ tgzPath: t.path, version: "0.2.0", modsDir: mods });
    rollback({ modsDir: mods });
    for (const n of [`.prev-next-${process.pid}`, `.prev-old-${process.pid}`]) {
      assert.equal(readFileSync(join(stateDirOf(mods), n, "spaces-agents", "main.js"), "utf8"), "// left by a failed run\n", n);
    }
  } finally {
    rmSync(t.src, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});
