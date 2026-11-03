#!/usr/bin/env node
// Keeps personal data out of this public repository: absolute home paths, the owner's private
// host, machine and account names, personal email addresses, credentials and local database
// files, in text files and in image metadata (PNG text chunks, readable strings elsewhere).
//
//   node scripts/privacy-check.mjs              scan every tracked and untracked, not-ignored file
//   node scripts/privacy-check.mjs --hash TERM  print a deny entry for TERM (add it to the list)
//
// Prints `file:line: rule: match` per hit and exits 1 when there is any.
//
// The private names are never written in the tree: scripts/privacy-list.json keeps each one as
// the sha256 of its normal form (lowercased, separators — space, tab, `.`, `-`, `_`, `=` —
// removed). Each word of a line, and each run of up to four words joined by separators, is
// normalised the same way and hashed, so `a-b`, `a_b`, `a b`, `a.b`, `AB` and `A - B` all match
// an entry made from any of them. An entry may be `exact` (one word as written, never one
// joined from several: `a b` does not match it) and `lowercaseOnly` (`A` does not match it),
// for short names that are also ordinary words or labels. Where hits overlap, the longest wins.
//
// The hashes keep the names out of grep and out of this file; they do not keep them secret.
// The list is short and the names are short, so anyone can recover them by hashing guesses.
//
// The same file lists what is not personal data: placeholder user names (`users`), placeholder
// emails (`emails`), and exact text allowed in one named file (`lines`); only that text is cut
// out of the line, the rest of the line is still scanned. No file is exempt.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

export const LIST_FILE = "scripts/privacy-list.json";

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
const SEPARATORS = /[ \t._=-]+/g;
const RUNS = /[A-Za-z0-9]+(?:[ \t._=-]+[A-Za-z0-9]+)*/g;
const MAX_PARTS = 4;

/** A term's normal form: lowercased, separators removed. */
export const normalise = (term) => term.toLowerCase().replace(SEPARATORS, "");

/** The deny-list hash of a term: sha256 of its normal form, hex. */
export const hashTerm = (term) => createHash("sha256").update(normalise(term)).digest("hex");

/** Every word and joined run of up to MAX_PARTS words in a line: `{ text, index, single }`. */
function candidates(line) {
  const out = [];
  for (const m of line.matchAll(RUNS)) {
    const words = [...m[0].matchAll(/[A-Za-z0-9]+/g)];
    for (let i = 0; i < words.length; i++) {
      for (let j = i; j < Math.min(words.length, i + MAX_PARTS); j++) {
        const start = words[i].index, end = words[j].index + words[j][0].length;
        out.push({ text: m[0].slice(start, end), index: m.index + start, single: i === j });
      }
    }
  }
  return out;
}

/**
 * A matcher over deny entries `{ sha256, exact?, lowercaseOnly? }` for one candidate:
 * true when its normal form hashes to an entry whose flags it meets. Hashes are memoized.
 */
export function denyMatcher(deny = []) {
  const entries = new Map(deny.map((d) => [d.sha256, d]));
  const memo = new Map();
  return ({ text, single = true }) => {
    const key = normalise(text);
    let sha = memo.get(key);
    if (sha === undefined) memo.set(key, (sha = hashTerm(key)));
    const entry = entries.get(sha);
    if (!entry) return false;
    if (entry.exact && !single) return false;
    return !entry.lowercaseOnly || text === text.toLowerCase();
  };
}

/** The denied candidates of a line, longest first where they overlap, in line order. */
function deniedNames(line, denied) {
  const kept = [];
  const found = candidates(line).filter(denied).sort((a, b) => b.text.length - a.text.length);
  for (const c of found) {
    const end = c.index + c.text.length;
    if (!kept.some((k) => c.index < k.index + k.text.length && k.index < end)) kept.push(c);
  }
  return kept.sort((a, b) => a.index - b.index);
}

/** `text` with every allowed span cut out (replaced by a space, so words do not join). */
function cutAllowed(line, spans) {
  for (const s of spans) if (s) line = line.split(s).join(" ");
  return line;
}

/** The hits in one file's text: `{ file, line, rule, match }`. Pure. */
export function scan(file, text, list = {}, denied = denyMatcher(list.deny)) {
  const hits = [];
  const users = new Set(list.users ?? []);
  const emails = new Set(list.emails ?? []);
  // An allowed text is allowed in the file it names, and in the list that names it.
  const spans = (list.lines ?? []).filter((l) => l.file === file || file === LIST_FILE).map((l) => l.text);
  if (DB_FILE.test(file)) hits.push({ file, line: 0, rule: "db-file", match: file });
  text.split("\n").forEach((raw, i) => {
    const line = cutAllowed(raw, spans);
    const hit = (rule, match) => hits.push({ file, line: i + 1, rule, match });
    for (const m of line.matchAll(HOME)) if (!users.has(m[1])) hit("home-path", m[0]);
    for (const c of deniedNames(line, denied)) hit("private-name", c.text);
    for (const m of line.matchAll(EMAIL)) if (!EMAIL_OK.test(m[1]) && !emails.has(m[0])) hit("email", m[0]);
    for (const re of SECRETS) for (const m of line.matchAll(re)) hit("secret", `${m[0].slice(0, 8)}…`);
  });
  return hits;
}

/** Printable ASCII runs of 6 or more characters, one per line. */
const strings = (buf) => (buf.toString("latin1").match(/[\x20-\x7e]{6,}/g) ?? []).join("\n");

/**
 * The text a PNG carries outside its pixels: tEXt, zTXt and iTXt (inflated when compressed),
 * and the readable strings of every other ancillary chunk (eXIf, XMP...). Pixel data is skipped.
 */
export function pngText(buf) {
  const out = [];
  for (let o = 8; o + 12 <= buf.length;) {
    const len = buf.readUInt32BE(o), type = buf.toString("latin1", o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    o += 12 + len;
    if (["IHDR", "PLTE", "IDAT", "IEND"].includes(type)) continue;
    const nul = data.indexOf(0);
    try {
      if (type === "tEXt") out.push(data.toString("latin1").replace("\0", ": "));
      else if (type === "zTXt") out.push(`${data.toString("latin1", 0, nul)}: ${inflateSync(data.subarray(nul + 2)).toString("latin1")}`);
      else if (type === "iTXt") {
        const compressed = data[nul + 1] === 1;
        let p = nul + 3;
        for (let k = 0; k < 2; k++) p = data.indexOf(0, p) + 1;  // language tag, translated keyword
        const body = data.subarray(p);
        out.push(`${data.toString("latin1", 0, nul)}: ${(compressed ? inflateSync(body) : body).toString("utf8")}`);
      } else out.push(strings(data));
    } catch {
      out.push(strings(data));
    }
  }
  return out.join("\n");
}

/** The text to scan in a file: itself, a PNG's metadata, or another binary's readable strings. */
export function fileText(buf) {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return pngText(buf);
  return buf.includes(0) ? strings(buf) : buf.toString("utf8");
}

/** Tracked and untracked, not-ignored files of the repository at `root`. */
export function repoFiles(root) {
  const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root });
  return out.toString("utf8").split("\0").filter(Boolean);
}

/** Scan the repository at `root`; files listed by git but gone from disk are skipped. */
export function scanRepo(root) {
  const list = JSON.parse(readFileSync(`${root}/${LIST_FILE}`, "utf8"));
  const denied = denyMatcher(list.deny);
  const hits = [];
  for (const file of repoFiles(root)) {
    let buf;
    try { buf = readFileSync(`${root}/${file}`); } catch { continue; }
    hits.push(...scan(file, fileText(buf), list, denied));
  }
  return hits;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [flag, term] = process.argv.slice(2);
  if (flag === "--hash") {
    if (!term) { console.error("usage: privacy-check.mjs --hash TERM"); process.exit(2); }
    // Add `"exact": true` and/or `"lowercaseOnly": true` by hand for a short or common word.
    console.log(JSON.stringify({ sha256: hashTerm(term), kind: "machine" }));
    process.exit(0);
  }
  const root = fileURLToPath(new URL("..", import.meta.url));
  const hits = scanRepo(root);
  for (const h of hits) console.error(`${h.file}:${h.line}: ${h.rule}: ${h.match}`);
  if (hits.length) {
    console.error(`privacy-check: ${hits.length} hit(s). Replace with a placeholder (~/..., proxy.example.com),`
      + ` or, if it is not personal data, add it to ${LIST_FILE}.`);
    process.exit(1);
  }
  console.log("privacy-check: clean");
}
