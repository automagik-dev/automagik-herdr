// A `security` stand-in for the am-quota tests: it records what each call named (services only —
// never a value) and keeps items in a temporary folder, so a test can drive the Keychain paths and
// even assert which service was addressed, without touching the person's login keychain.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SHIM = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.AM_KC_DIR;
const items = path.join(root, "items");
const log = path.join(root, "log.jsonl");
const args = process.argv.slice(2);
const note = (entry) => fs.appendFileSync(log, JSON.stringify(entry) + "\\n");
const item = (svc) => path.join(items, Buffer.from(String(svc), "utf8").toString("hex"));
const serviceOf = (a) => { const i = a.indexOf("-s"); return i >= 0 && a[i + 1] !== undefined ? a[i + 1] : null; };
const cmd = args[0];
if (cmd === "find-generic-password") {
  const svc = serviceOf(args);
  note({ cmd, service: svc });
  const file = svc ? item(svc) : null;
  if (!file || !fs.existsSync(file)) { process.stderr.write("security: The specified item could not be found in the keychain.\\n"); process.exit(44); }
  const bytes = fs.readFileSync(file);
  // A value holding 0x0a prints as hex; otherwise as its text. One trailing newline, as -w does.
  process.stdout.write((bytes.includes(10) ? bytes.toString("hex") : bytes.toString("utf8")) + "\\n");
  process.exit(0);
}
if (cmd === "delete-generic-password") {
  const svc = serviceOf(args);
  note({ cmd, service: svc });
  const file = svc ? item(svc) : null;
  if (!file || !fs.existsSync(file)) process.exit(44);
  fs.unlinkSync(file);
  process.exit(0);
}
if (cmd === "-i") {
  const lines = fs.readFileSync(0, "utf8").split("\\n").filter((l) => l.trim());
  const services = [];
  let add = false;
  for (const line of lines) {
    const svc = (/-s "([^"]*)"/.exec(line) || /-s (\\S+)/.exec(line) || [])[1] || null;
    const hex = (/-X "([0-9a-fA-F]*)"/.exec(line) || /-X ([0-9a-fA-F]+)/.exec(line) || [])[1] || null;
    if (!svc || hex === null) { process.stderr.write("security: could not parse the command line\\n"); process.exit(1); }
    if (/^delete-generic-password\\b/.test(line)) {
      fs.rmSync(item(svc), { force: true });
      services.push(svc);
      continue;
    }
    if (!/^add-generic-password\\b/.test(line)) { process.stderr.write("security: unsupported command\\n"); process.exit(1); }
    fs.writeFileSync(item(svc), Buffer.from(hex, "hex"));
    services.push(svc);
    add = true;
  }
  note({ i: true, add, services });   // the command line itself never reaches the log
  process.exit(0);
}
process.stderr.write("security: unsupported invocation\\n");
process.exit(2);
`;

/**
 * A scratch Keychain: `env` (PATH + AM_KC_DIR) for the scripts, `calls()` for the log, `seed` and
 * `item` for the store. Every call to the stand-in is logged with its service name; no value is.
 */
export function keychain() {
  const root = mkdtempSync(join(tmpdir(), "am-quota-kc-"));
  const bin = join(root, "bin");
  mkdirSync(join(root, "items"));
  mkdirSync(bin);
  writeFileSync(join(bin, "security"), SHIM);
  chmodSync(join(bin, "security"), 0o755);
  const store = (service) => join(root, "items", Buffer.from(String(service), "utf8").toString("hex"));
  const api = {
    root,
    env: { PATH: `${bin}:${process.env.PATH}`, AM_KC_DIR: root },
    calls: () => {
      const file = join(root, "log.jsonl");
      if (!existsSync(file)) return [];
      return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
    },
    /** The services every call addressed, in order (`-i` contributes its parsed services). */
    services: () => {
      const out = [];
      for (const call of api.calls()) {
        if (call.service) out.push(call.service);
        for (const svc of call.services ?? []) out.push(svc);
      }
      return out;
    },
    seed: (service, text) => writeFileSync(store(service), text),
    item: (service) => (existsSync(store(service)) ? readFileSync(store(service), "utf8") : null),
  };
  return api;
}
