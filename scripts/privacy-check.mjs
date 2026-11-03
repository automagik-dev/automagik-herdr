#!/usr/bin/env node
// Keeps personal data out of this public repository: absolute home paths, the owner's private
// host and machine names, personal email addresses, credentials and local database files.
//
//   node scripts/privacy-check.mjs        scan every tracked and untracked, not-ignored file
//
// Prints `file:line: rule: match` per hit and exits 1 when there is any. A hit that is not
// personal data goes into scripts/privacy-allow.json: a placeholder user name (`users`), a
// placeholder email (`emails`), or an exact text in one named file (`lines`), never a line number.
// This file, the allowlist and the checker's test name the private terms on purpose and are
// not scanned for them.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ALLOW_FILE = "scripts/privacy-allow.json";
export const SELF = new Set(["scripts/privacy-check.mjs", ALLOW_FILE, "test/privacy-check.test.mjs"]);

// Names of the owner's machines, account and private hosts. g9/g10 are lowercase only: G9 and
// G10 are wish group labels.
const PRIVATE_NAMES = /\b(?:feliperosa|felipe|hx470|ryzen|khal-labs|lembr\.ai)\b|\bg(?:9|10)\b/gi;
const LOWERCASE_ONLY = /^g(?:9|10)$/;
const HOME = /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)([A-Za-z0-9._-]+)/g;
const EMAIL = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g;
const EMAIL_OK = /(?:^|\.)(?:example(?:\.(?:com|org|net))?|test|invalid|localhost|users\.noreply\.github\.com)$/i;
const SECRETS = [
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{40,}/g,
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
];
const DB_FILE = /(?:^|\/)(?:genie\.db|[^/]+\.(?:db|sqlite|sqlite3|db-wal|db-shm))$/i;

/** The hits in one file's text: `{ file, line, rule, match }`. Pure. */
export function scan(file, text, allow = {}) {
  const hits = [];
  const users = new Set(allow.users ?? []);
  const emails = new Set(allow.emails ?? []);
  const lineAllows = (allow.lines ?? []).filter((l) => l.file === file).map((l) => l.text);
  if (DB_FILE.test(file)) hits.push({ file, line: 0, rule: "db-file", match: file });
  if (SELF.has(file)) return hits;
  text.split("\n").forEach((line, i) => {
    if (lineAllows.some((t) => line.includes(t))) return;
    const hit = (rule, match) => hits.push({ file, line: i + 1, rule, match });
    for (const m of line.matchAll(HOME)) if (!users.has(m[1])) hit("home-path", m[0]);
    for (const m of line.matchAll(PRIVATE_NAMES)) {
      if (LOWERCASE_ONLY.test(m[0].toLowerCase()) && m[0] !== m[0].toLowerCase()) continue;
      hit("private-name", m[0]);
    }
    for (const m of line.matchAll(EMAIL)) if (!EMAIL_OK.test(m[1]) && !emails.has(m[0])) hit("email", m[0]);
    for (const re of SECRETS) for (const m of line.matchAll(re)) hit("secret", `${m[0].slice(0, 8)}…`);
  });
  return hits;
}

/** Tracked and untracked, not-ignored files of the repository at `root`. */
export function repoFiles(root) {
  const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root });
  return out.toString("utf8").split("\0").filter(Boolean);
}

/** Scan the repository at `root`; binary files (a NUL byte) and deleted files are skipped. */
export function scanRepo(root) {
  const allow = JSON.parse(readFileSync(`${root}/${ALLOW_FILE}`, "utf8"));
  const hits = [];
  for (const file of repoFiles(root)) {
    let buf;
    try { buf = readFileSync(`${root}/${file}`); } catch { continue; }
    const text = buf.includes(0) ? "" : buf.toString("utf8");
    hits.push(...scan(file, text, allow));
  }
  return hits;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const hits = scanRepo(root);
  for (const h of hits) console.error(`${h.file}:${h.line}: ${h.rule}: ${h.match}`);
  if (hits.length) {
    console.error(`privacy-check: ${hits.length} hit(s). Replace with a placeholder (~/..., proxy.example.com),`
      + ` or, if it is not personal data, add it to ${ALLOW_FILE}.`);
    process.exit(1);
  }
  console.log("privacy-check: clean");
}
