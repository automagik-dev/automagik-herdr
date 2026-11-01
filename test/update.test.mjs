// The pack's updates over a fake release: no network, a temp app home for mods/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LATEST_URL, applyUpdate, checkForUpdate, compareVersions, downloadUpdate, installUpdate, latestRelease, noticeText, parseSums,
  pickUpdate, prevDirOf, readVersion, rollback, stateDirOf, verifySha256,
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
    const done = await applyUpdate({ tgzPath: t.path, modsDir: mods });
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
    await applyUpdate({ tgzPath: t3.path, modsDir: mods });
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
    await assert.rejects(applyUpdate({ tgzPath: noMain.path, modsDir: mods }), /no spaces-agents\/ with main\.js and mod\.json/);
    await assert.rejects(applyUpdate({ tgzPath: noMod.path, modsDir: mods }), /refusing/);
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
    const done = await applyUpdate({ tgzPath: t.path, modsDir: mods });
    assert.equal(done.prev, null);
    assert.equal(readVersion(join(mods, "spaces-agents")), "0.2.0");
    rmSync(join(mods, "spaces-agents"), { recursive: true });
    symlinkSync(t.src, join(mods, "spaces-agents"));
    await assert.rejects(applyUpdate({ tgzPath: t.path, modsDir: mods }), /is a link/);
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
