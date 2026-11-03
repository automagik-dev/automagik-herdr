// The bridge's trust anchor against the real thing (RFC 0011 step 2), read-only: the monorepo's
// rolling herdr-lane pointer (pack.json and pack.json.sig) must verify with the pack-keys.json this
// release ships, and name a 3.N.P that counts as an update over this 0.x pack. The tarball it names
// is downloaded to memory only and checked against the pointer's sha256 and the pack's layout
// (PACK_MODS plus layouts/), so this pack's update.mjs can swap it in. Nothing is installed or
// written. Skipped when the network is not reachable (offline) or AUTOMAGIK_HERDR_NO_NETWORK=1;
// a pointer that answers but does not verify fails.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { POINTER_SIG_URL, POINTER_URL, PACK_MODS, compareVersions, packKeys, verifyPointer } from "../mods/am-sidebar/update.mjs";

const VERSION = readFileSync(fileURLToPath(new URL("../mods/am-sidebar/VERSION", import.meta.url)), "utf8").trim();
const get = async (t, url) => {
  try {
    const r = await fetch(url, { headers: { "user-agent": "automagik-herdr" }, redirect: "follow", signal: AbortSignal.timeout(60_000) });
    return r;
  } catch (error) {
    t.skip(`offline (${error.cause?.code ?? error.message}): the live pointer was not read`);
    return null;
  }
};

test("live: the real herdr-lane pointer verifies with the shipped pack-keys.json and names a 3.N.P over this pack", async (t) => {
  if (process.env.AUTOMAGIK_HERDR_NO_NETWORK === "1") return t.skip("AUTOMAGIK_HERDR_NO_NETWORK=1");
  const pointer = await get(t, POINTER_URL);
  if (!pointer) return;
  assert.equal(pointer.status, 200, `${POINTER_URL} answered ${pointer.status}`);
  const bytes = Buffer.from(await pointer.arrayBuffer());
  const sig = await get(t, POINTER_SIG_URL);
  if (!sig) return;
  assert.equal(sig.status, 200, `${POINTER_SIG_URL} answered ${sig.status}`);
  // The shipped keys, as an installed pack reads them (no test key).
  const keys = packKeys();
  assert.deepEqual(keys.map((k) => k.keyId), ["herdr-pack-2026-11"]);
  const pack = verifyPointer(bytes, await sig.text(), keys);
  assert.ok(Number(pack.version.split(".")[0]) >= 3, `the pointer names ${pack.version}, a monorepo 3.N.P`);
  assert.ok(compareVersions(pack.version, VERSION) > 0, `${pack.version} is an update over ${VERSION}`);
  assert.ok(pack.sequence >= 600001, `sequence ${pack.sequence}`);
  assert.equal(pack.tarball.url, `https://github.com/automagik-dev/automagik/releases/download/v${pack.version}/automagik-herdr-pack-${pack.version}.tgz`);

  // The tarball it names: the pointer's sha256, and the layout this pack's applyUpdate swaps in.
  const tgz = await get(t, pack.tarball.url);
  if (!tgz) return;
  assert.equal(tgz.status, 200);
  const buf = Buffer.from(await tgz.arrayBuffer());
  assert.equal(createHash("sha256").update(buf).digest("hex"), pack.sha256, "the tarball matches the signed pointer");
  const dir = mkdtempSync(join(tmpdir(), "bridge-live-"));
  try {
    writeFileSync(join(dir, "pack.tgz"), buf);
    const entries = execFileSync("tar", ["-tzf", join(dir, "pack.tgz")], { encoding: "utf8" }).split("\n").filter(Boolean);
    const top = [...new Set(entries.map((e) => e.split("/")[0]))].sort();
    assert.deepEqual(top, [...PACK_MODS, "layouts"].sort(), "the same folders this pack's update.mjs installs");
    assert.ok(entries.includes("layouts/automagik.json"));
    assert.equal(execFileSync("tar", ["-xzOf", join(dir, "pack.tgz"), "am-sidebar/VERSION"], { encoding: "utf8" }).trim(), pack.version);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
