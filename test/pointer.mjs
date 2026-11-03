// The pack pointer for tests (herdr-lane's pack.json and pack.json.sig), signed with a key made
// for this run only (never a committed one): `keys` is what a test passes as the trusted keys.
import { createHash, generateKeyPairSync, sign } from "node:crypto";

export const KEY_ID = "herdr-pack-test";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
export const keys = [{ keyId: KEY_ID, publicKey: publicKey.export({ type: "spki", format: "pem" }).toString() }];
/** A key the tests never trust, to sign what must be refused. */
const other = generateKeyPairSync("ed25519").privateKey;

/** As scripts/lane.ts sequenceOf: X.N.P as N·10000 + P. */
export const sequenceOf = (version) => { const [, n, p] = version.split(".").map(Number); return n * 10000 + p; };

export const sha = (buf) => createHash("sha256").update(buf).digest("hex");

/** pack.json's bytes for `version`, its tarball at `url` with `body` (a Buffer) or `sha256`. */
export function pointerBytes(version, { url = `https://dl.test/v${version}/automagik-herdr-pack-${version}.tgz`, body, sha256, keyId = KEY_ID, ...extra } = {}) {
  const name = `automagik-herdr-pack-${version}.tgz`;
  return Buffer.from(JSON.stringify({
    schemaVersion: 1, publisher: "automagik", part: "herdr", keyId, sequence: sequenceOf(version), issuedAt: "2026-11-03T00:00:00Z",
    repository: "https://github.com/automagik-dev/automagik", version, tag: `v${version}`, commit: "a".repeat(40),
    tarball: { name, url, sha256: sha256 ?? sha(body ?? Buffer.from(name)), size: body?.byteLength ?? 1 }, ...extra,
  }, null, 2));
}

/** Its signature, base64: with the trusted test key, or `{ untrusted: true }` with another. */
export const signatureOf = (bytes, { untrusted = false } = {}) => sign(null, bytes, untrusted ? other : privateKey).toString("base64");
