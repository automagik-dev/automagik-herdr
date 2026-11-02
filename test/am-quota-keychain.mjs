// A `security` stand-in for the am-quota tests. No test may reach the real binary: on macOS it
// talks to the person's login keychain, and with a scratch HOME it pops a "Keychain Not Found"
// dialog on their screen. So the stand-in is first on PATH (before /usr/bin), every test that
// runs a Keychain script gets its env from here, and `keychain()` refuses to hand out an env in
// which `command -v security` is anything but the stand-in.
//
// The stand-in records every command it receives (argv calls, and each `-i` line read from
// stdin) with the value redacted: a log line carries the service, account and flags, and the
// value's length, never its bytes. Items live in one JSON file, as hex, in the test's temp dir.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

const SHIM = String.raw`"use strict";
const fs = require("node:fs");
const path = require("node:path");
const [bin, ...args] = process.argv.slice(2);
const root = process.env.AM_KC_DIR;
// Fail closed: without its folder the stand-in stops; it never falls through to anything else.
if (!root || !fs.existsSync(path.join(root, "items.json"))) {
  process.stderr.write("security (am-quota test stand-in): AM_KC_DIR is not a stand-in folder\n");
  process.exit(70);
}
const store = path.join(root, "items.json");
const log = path.join(root, "log.jsonl");
const load = () => JSON.parse(fs.readFileSync(store, "utf8"));
const save = (items) => fs.writeFileSync(store, JSON.stringify(items, null, 2));
const note = (entry) => fs.appendFileSync(log, JSON.stringify({ bin, ...entry }) + "\n");

// One security command, as words: -i lines split on spaces and honour double quotes, as
// security -i does (which is why the product quotes the account and the service).
function words(line) {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, "$1") : m[2]);
  return out;
}

// -w takes a value only on add (the password); on find it is a bare flag (print the password).
const VALUED = new Set(["-a", "-s", "-X", "-l", "-D", "-j", "-c", "-C", "-G"]);
const valued = (cmd, w) => VALUED.has(w) || (w === "-w" && cmd === "add-generic-password");
function parse(argv) {
  const [cmd, ...rest] = argv;
  const opts = { cmd, flags: [], keychain: null };
  for (let i = 0; i < rest.length; i++) {
    const w = rest[i];
    if (valued(cmd, w)) { opts[w] = rest[++i]; continue; }
    if (/^-[A-Za-z]$/.test(w)) { opts.flags.push(w); continue; }
    opts.keychain = w;   // a trailing keychain path
  }
  return opts;
}

// What the log keeps of a command: everything but the value, which becomes <N bytes>.
function redact(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    out.push(argv[i]);
    if ((argv[i] === "-X" || argv[i] === "-w" && argv[0] === "add-generic-password") && i + 1 < argv.length) {
      const v = argv[++i];
      out.push("<" + (argv[i - 1] === "-X" ? v.length / 2 : Buffer.byteLength(v)) + " bytes>");
    }
  }
  return out;
}

// -w prints the value as text, or as hex when it holds 0x0a or a non-ASCII byte (measured:
// "Café" comes back as 436166c3a9). One trailing newline either way.
function printed(bytes) {
  return (bytes.some((b) => b === 0x0a || b >= 0x80) ? bytes.toString("hex") : bytes.toString("utf8")) + "\n";
}

function run(argv, via) {
  const o = parse(argv);
  const entry = { via, cmd: o.cmd, argv: redact(argv), service: o["-s"] ?? null, account: o["-a"] ?? null, keychain: o.keychain };
  const done = (status, out = "", err = "") => { note({ ...entry, status }); return { status, out, err }; };
  const notFound = () => done(44, "", "security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.\n");
  if (o.keychain !== null) return done(2, "", "security (stand-in): a keychain path was named; the product never names one\n");
  const items = load();
  if (o.cmd === "add-generic-password") {
    if (o["-a"] === undefined || o["-s"] === undefined) return done(2, "", "security: add-generic-password needs -a and -s\n");
    let bytes;
    if (o["-X"] !== undefined) {
      if (!/^(?:[0-9a-fA-F]{2})*$/.test(o["-X"])) return done(1, "", "security: -X takes an even-length hex string\n");
      bytes = Buffer.from(o["-X"], "hex");
    } else if (o["-w"] !== undefined) bytes = Buffer.from(o["-w"], "utf8");
    else return done(2, "", "security (stand-in): add without -X or -w would prompt\n");
    entry.bytes = bytes.length;
    if (items[o["-s"]] && !o.flags.includes("-U")) return done(45, "", "security: The specified item already exists in the keychain.\n");
    items[o["-s"]] = { account: o["-a"], hex: bytes.toString("hex") };
    save(items);
    return done(0);
  }
  if (o.cmd === "find-generic-password") {
    if (!o.flags.includes("-w")) return done(2, "", "security (stand-in): only find-generic-password -w is supported\n");
    const it = o["-s"] !== undefined ? items[o["-s"]] : undefined;
    if (!it || (o["-a"] !== undefined && o["-a"] !== it.account)) return notFound();
    return done(0, printed(Buffer.from(it.hex, "hex")));
  }
  if (o.cmd === "delete-generic-password") {
    const it = o["-s"] !== undefined ? items[o["-s"]] : undefined;
    if (!it || (o["-a"] !== undefined && o["-a"] !== it.account)) return notFound();
    delete items[o["-s"]];
    save(items);
    return done(0);
  }
  return done(2, "", "security (stand-in): unsupported command " + JSON.stringify(o.cmd) + "\n");
}

if (args.length === 1 && args[0] === "-i") {
  // Like security -i: one command per line, and the exit status is the last command's.
  let last = { status: 0 };
  for (const line of fs.readFileSync(0, "utf8").split("\n")) {
    if (!line.trim()) continue;
    last = run(words(line), "-i");
    process.stdout.write(last.out);
    process.stderr.write(last.err);
  }
  process.exit(last.status);
}
const r = run(args, "argv");
process.stdout.write(r.out);
process.stderr.write(r.err);
process.exit(r.status);
`;

/** A logged word as `lines()` prints it: quoted only when it holds more than [\w.@:+/-]. */
export const word = (w) => (/^<\d+ bytes>$/.test(w) || /^[\w.@:+/-]+$/.test(w) ? w : JSON.stringify(w));

/** The PATH every Keychain test runs with: the stand-in's folder, then the system's, nothing else. */
const SYSTEM_PATH = "/usr/bin:/bin";

/**
 * A scratch Keychain. `security` is the stand-in's absolute path; `env` (PATH + AM_KC_DIR) is
 * what every spawn that can reach `security` must carry; `run` and `sh` spawn with it. `calls()`
 * is the redacted log, `seed`/`item`/`bytes` the store. Throws if `command -v security` under
 * `env` is not the stand-in, so no test can be handed an env that reaches the real binary.
 */
export function keychain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "am-quota-kc-")));
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(root, "items.json"), "{}");
  writeFileSync(join(root, "shim.cjs"), SHIM);
  const security = join(bin, "security");
  // A sh wrapper with the absolute node, so the stand-in works under the narrow PATH below.
  const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
  writeFileSync(security, `#!/bin/sh\nexec ${q(process.execPath)} ${q(join(root, "shim.cjs"))} "$0" "$@"\n`);
  chmodSync(security, 0o755);
  const env = { PATH: `${bin}:${SYSTEM_PATH}`, AM_KC_DIR: root };

  const resolved = spawnSync("/bin/sh", ["-c", "command -v security"], { encoding: "utf8", env }).stdout.trim();
  if (resolved !== security) throw new Error(`keychain stand-in: command -v security is ${JSON.stringify(resolved)}, not ${security}`);

  const load = () => JSON.parse(readFileSync(join(root, "items.json"), "utf8"));
  const api = {
    root,
    security,
    env,
    /** The login the product's scripts use for -a (`id -un`). */
    account: userInfo().username,
    /** Spawns the stand-in by its absolute path. */
    run: (args, { input } = {}) => spawnSync(security, args, { encoding: "utf8", env, input }),
    /** Runs a product shell script with the stand-in's env: `sh -c script sh ...args`. */
    sh: (script, ...args) => spawnSync("/bin/sh", ["-c", script, "sh", ...args], { encoding: "utf8", env }),
    /** Every command the stand-in received, in order, value redacted. */
    calls: () => {
      const file = join(root, "log.jsonl");
      if (!existsSync(file)) return [];
      return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
    },
    /** The commands as lines, e.g. `-i: add-generic-password -U -a me -s "a svc" -X <12 bytes>`;
     *  a word is quoted only when it holds something other than [\w.@:+/-]. */
    lines: () => api.calls().map((c) => (c.via === "-i" ? "-i: " : "") + c.argv.map(word).join(" ")),
    /** The services every call addressed, in order. */
    services: () => api.calls().map((c) => c.service).filter((s) => s !== null),
    seed: (service, text, account = api.account) => {
      const items = load();
      items[service] = { account, hex: Buffer.from(text, "utf8").toString("hex") };
      writeFileSync(join(root, "items.json"), JSON.stringify(items, null, 2));
    },
    /** The stored bytes, or null. */
    bytes: (service) => { const it = load()[service]; return it ? Buffer.from(it.hex, "hex") : null; },
    /** The stored value as text, or null. */
    item: (service) => api.bytes(service)?.toString("utf8") ?? null,
  };
  return api;
}
