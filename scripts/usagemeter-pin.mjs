#!/usr/bin/env node
// The usagemeter pin against the pinned release itself (CI): downloads that release's SHA256SUMS
// and its four binaries, hashes each, and checks that release.js USAGEMETER.sha256 and install.sh's
// meter_pin both name exactly those hashes. Exits 1 on any difference, 2 when GitHub can't be read.
//   node scripts/usagemeter-pin.mjs
// Apache-2.0.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { USAGEMETER } from "../mods/am-sidebar/release.js";
import { releaseBase } from "../mods/am-sidebar/meterFleet.js";

const INSTALL = fileURLToPath(new URL("../install.sh", import.meta.url));
const base = releaseBase();

async function get(url) {
  const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

const problems = [];
let sums;
try { sums = (await get(`${base}/SHA256SUMS`)).toString("utf8"); } catch (e) { console.error(`usagemeter-pin: ${e.message}`); process.exit(2); }
const listed = Object.fromEntries([...sums.matchAll(/^([0-9a-f]{64}) [ *](usagemeter-[a-z0-9_-]+)$/gm)].map((m) => [m[2], m[1]]));
const script = Object.fromEntries([...readFileSync(INSTALL, "utf8").matchAll(/^ {4}(usagemeter-[a-z0-9_-]+)\) echo ([0-9a-f]{64}) ;;$/gm)].map((m) => [m[1], m[2]]));

for (const asset of Object.values(USAGEMETER.assets)) {
  let got;
  try { got = createHash("sha256").update(await get(`${base}/${asset}`)).digest("hex"); } catch (e) { console.error(`usagemeter-pin: ${e.message}`); process.exit(2); }
  const pinned = USAGEMETER.sha256[asset];
  if (listed[asset] !== got) problems.push(`${asset}: SHA256SUMS says ${listed[asset] ?? "nothing"}, the download is ${got}`);
  if (pinned !== got) problems.push(`${asset}: release.js pins ${pinned ?? "nothing"}, the release's build is ${got}`);
  if (script[asset] !== got) problems.push(`${asset}: install.sh pins ${script[asset] ?? "nothing"}, the release's build is ${got}`);
  if (!problems.length) console.log(`${asset}: ${got} ok`);
}
for (const extra of Object.keys(USAGEMETER.sha256)) if (!Object.values(USAGEMETER.assets).includes(extra)) problems.push(`release.js pins ${extra}, which is not an asset`);
if (problems.length) {
  for (const p of problems) console.error(`usagemeter-pin: ${p}`);
  process.exit(1);
}
console.log(`usagemeter v${USAGEMETER.version}: release.js and install.sh pin the release's four builds.`);
