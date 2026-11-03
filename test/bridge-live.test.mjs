// The bridge's trust anchor against the real thing (RFC 0011 step 2), read-only: the monorepo's
// rolling herdr-lane pointer (pack.json and pack.json.sig) must verify with the pack-keys.json this
// release ships, and name a 3.N.P that counts as an update over this 0.x pack. The tarball it names
// is downloaded to memory only and checked against the pointer's sha256, and its top level against
// the PACK_MODS of its own release.js (not this pack's: a mod the monorepo adds must not turn this
// test red). Nothing is installed or written outside a temp folder.
// Skipped when GitHub can't answer: offline, a 5xx or 429 (the status is in the skip message), or
// AUTOMAGIK_HERDR_NO_NETWORK=1. A 404, a signature or a pointer that does not verify fails.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { POINTER_SIG_URL, POINTER_URL, compareVersions, packKeys, verifyPointer } from "../mods/am-sidebar/update.mjs";

const VERSION = readFileSync(fileURLToPath(new URL("../mods/am-sidebar/VERSION", import.meta.url)), "utf8").trim();
/** Where the monorepo's releases serve their assets (the tarball's name is checked by verifyPointer). */
const RELEASES = /^https:\/\/github\.com\/automagik-dev\/automagik\/releases\/download\/v\d+\.\d+\.\d+\/[^/]+$/;

/** GET `url`; null (and the test skipped) when GitHub can't answer: offline, 5xx or 429. Any other status fails. */
async function get(t, url) {
  let r;
  try {
    r = await fetch(url, { headers: { "user-agent": "automagik-herdr" }, redirect: "follow", signal: AbortSignal.timeout(60_000) });
  } catch (error) {
    t.skip(`offline (${error.cause?.code ?? error.message}): ${url} was not read`);
    return null;
  }
  if (r.status >= 500 || r.status === 429) {
    t.skip(`GitHub answered ${r.status} for ${url}: not checked this run`);
    return null;
  }
  assert.equal(r.status, 200, `${url} answered ${r.status}`);
  return r;
}

test("live: the real herdr-lane pointer verifies with the shipped pack-keys.json and names a 3.N.P over this pack", async (t) => {
  if (process.env.AUTOMAGIK_HERDR_NO_NETWORK === "1") return t.skip("AUTOMAGIK_HERDR_NO_NETWORK=1");
  const pointer = await get(t, POINTER_URL);
  if (!pointer) return;
  const bytes = Buffer.from(await pointer.arrayBuffer());
  const sig = await get(t, POINTER_SIG_URL);
  if (!sig) return;
  // The shipped keys, as an installed pack reads them (no test key).
  const keys = packKeys();
  assert.deepEqual(keys.map((k) => k.keyId), ["herdr-pack-2026-11"]);
  const pack = verifyPointer(bytes, await sig.text(), keys);
  assert.ok(Number(pack.version.split(".")[0]) >= 3, `the pointer names ${pack.version}, a monorepo 3.N.P`);
  assert.ok(compareVersions(pack.version, VERSION) > 0, `${pack.version} is an update over ${VERSION}`);
  assert.ok(pack.sequence >= 600001, `sequence ${pack.sequence}`);
  assert.match(pack.tarball.url, RELEASES, "the tarball is on the monorepo's releases");

  // The tarball it names: the pointer's sha256, and the folders its own release.js lists.
  const tgz = await get(t, pack.tarball.url);
  if (!tgz) return;
  const buf = Buffer.from(await tgz.arrayBuffer());
  assert.equal(createHash("sha256").update(buf).digest("hex"), pack.sha256, "the tarball matches the signed pointer");
  const dir = mkdtempSync(join(tmpdir(), "bridge-live-"));
  try {
    const file = join(dir, "pack.tgz");
    writeFileSync(file, buf);
    const entries = execFileSync("tar", ["-tzf", file], { encoding: "utf8" }).split("\n").filter(Boolean);
    assert.ok(entries.includes("layouts/automagik.json"));
    assert.equal(execFileSync("tar", ["-xzOf", file, "am-sidebar/VERSION"], { encoding: "utf8" }).trim(), pack.version);
    // Its release.js is pure (no imports), so it loads on its own from the temp folder.
    const release = join(dir, "release.mjs");
    writeFileSync(release, execFileSync("tar", ["-xzOf", file, "am-sidebar/release.js"]));
    const { PACK_MODS } = await import(pathToFileURL(release).href);
    const top = [...new Set(entries.map((e) => e.split("/")[0]))].sort();
    assert.deepEqual(top, [...PACK_MODS, "layouts"].sort(), "the tarball holds its own PACK_MODS plus layouts/");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
