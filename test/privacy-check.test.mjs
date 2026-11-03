// scripts/privacy-check.mjs: the rules, the hashed deny list, the allowlist, image metadata, and
// a clean tree. Every name here is made up and its hash is injected by the test; fixtures that
// would trip the checker are built at run time, so this file passes the checker like any other.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { fileText, hashTerm, LIST_FILE, scan, scanRepo } from "../scripts/privacy-check.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MAC = "/" + "Users/", LINUX = "/" + "home/", WIN = "C:" + "\\Users\\";
const mail = (user, domain) => user + "@" + domain;
const DENY = [
  { sha256: hashTerm("quokkanet"), kind: "machine" },
  { sha256: hashTerm("tapir-lab"), kind: "machine" },
  { sha256: hashTerm("mango"), kind: "host" },
  { sha256: hashTerm("wombat.io"), kind: "host" },
  { sha256: hashTerm("q7"), kind: "machine", lowercaseOnly: true },
];
const rules = (file, text, list = {}) => scan(file, text, { deny: DENY, ...list }).map((h) => `${h.rule}:${h.match}`);

test("absolute home paths are hits unless the user is a placeholder", () => {
  assert.deepEqual(rules("a.md", `see ${MAC}zorblax/work and ${LINUX}bob/x`),
    [`home-path:${MAC}zorblax`, `home-path:${LINUX}bob`]);
  assert.deepEqual(rules("a.md", `${WIN}bob\\x`), [`home-path:${WIN}bob`]);
  assert.deepEqual(rules("a.md", `${MAC}x/brain-v3 and ${LINUX}someone`, { users: ["x", "someone"] }), []);
  assert.deepEqual(rules("a.md", "~/workspace and $HOME/.config and /home is a word"), []);
});

test("deny-listed names match by hash, as a word or a joined run, in any case", () => {
  assert.deepEqual(rules("a.md", "terminals on tapir-lab/t2, QuokkaNet and q7/t8"),
    ["private-name:tapir-lab", "private-name:QuokkaNet", "private-name:q7"]);
  assert.deepEqual(rules("a.md", "url: https://mango.wombat.io and model_provider=mango"),
    ["private-name:mango", "private-name:wombat.io", "private-name:mango"]);
  assert.deepEqual(rules("a.md", "tapir and lab apart, wombat.iox, Q7, mangoes, xq7"), []);
});

test("the deny list in the tree holds hashes only", () => {
  const list = JSON.parse(readFileSync(`${ROOT}/${LIST_FILE}`, "utf8"));
  assert.ok(list.deny.length > 0);
  for (const d of list.deny) {
    assert.match(d.sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(Object.keys(d).filter((k) => !["sha256", "kind", "lowercaseOnly"].includes(k)), []);
  }
});

test("emails are hits outside reserved example domains", () => {
  assert.deepEqual(rules("a.md", `mail ${mail("bob", "corp.com")}`), [`email:${mail("bob", "corp.com")}`]);
  assert.deepEqual(rules("a.md", "a@example.com b@proxy.example c@x.test u@users.noreply.github.com"), []);
  assert.deepEqual(rules("a.md", `mail ${mail("bob", "corp.com")}`, { emails: [mail("bob", "corp.com")] }), []);
});

test("credentials and local database files are hits", () => {
  assert.deepEqual(rules("a.md", `token ghp_${"a".repeat(36)}`), ["secret:ghp_aaaa…"]);
  assert.deepEqual(rules("a.md", "-----BEGIN OPENSSH " + "PRIVATE KEY-----"), ["secret:-----BEG…"]);
  assert.deepEqual(rules(".genie/genie.db", ""), ["db-file:.genie/genie.db"]);
  assert.deepEqual(rules("data/x.sqlite3", ""), ["db-file:data/x.sqlite3"]);
  assert.deepEqual(rules("src/db.js", "const db = 1"), []);
});

test("an allowed text is cut out of the line; the rest of the line is still scanned", () => {
  const list = { lines: [{ file: "w.md", text: "`wish/bots-q7`" }] };
  assert.deepEqual(rules("w.md", "- **Branch:** `wish/bots-q7`", list), []);
  assert.deepEqual(rules("w.md", "branch `wish/bots-q7` ran on q7/t8", list), ["private-name:q7"]);
  assert.deepEqual(rules("w.md", `\`wish/bots-q7\` in ${MAC}zorblax`, list), [`home-path:${MAC}zorblax`]);
  assert.deepEqual(rules("other.md", "`wish/bots-q7`", list), ["private-name:q7"]);
  assert.deepEqual(rules(LIST_FILE, '"text": "`wish/bots-q7`"', list), [], "the list may name what it allows");
});

// A PNG with the given chunks (no CRC check: the checker does not verify them).
function png(chunks) {
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  for (const [type, data] of chunks) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    parts.push(len, Buffer.from(type, "latin1"), data, Buffer.alloc(4));
  }
  return Buffer.concat(parts);
}

test("PNG text chunks and other metadata are scanned; pixel data is not", () => {
  const home = `${MAC}zorblax/shot.png`;
  const image = png([
    ["IHDR", Buffer.alloc(13)],
    ["tEXt", Buffer.from(`Source\0${home}`, "latin1")],
    ["zTXt", Buffer.concat([Buffer.from("Comment\0\0", "latin1"), deflateSync(Buffer.from("made on quokkanet"))])],
    ["iTXt", Buffer.concat([Buffer.from("XML:com.adobe.xmp\0\x01\0en\0\0", "latin1"), deflateSync(Buffer.from(mail("bob", "corp.com")))])],
    ["eXIf", Buffer.from("\0\0Artist\0tapir-lab\0", "latin1")],
    ["IDAT", Buffer.from(`${MAC}hidden in pixels`, "latin1")],
    ["IEND", Buffer.alloc(0)],
  ]);
  assert.deepEqual(rules("shot.png", fileText(image)),
    [`home-path:${MAC}zorblax`, "private-name:quokkanet", `email:${mail("bob", "corp.com")}`, "private-name:tapir-lab"]);
  assert.deepEqual(rules("plain.png", fileText(png([["IHDR", Buffer.alloc(13)], ["pHYs", Buffer.alloc(9)], ["IEND", Buffer.alloc(0)]]))), []);
});

test("other binary files are scanned by their readable strings", () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0, 0]), Buffer.from(`Exif\0Artist ${MAC}zorblax\0`, "latin1")]);
  assert.deepEqual(rules("photo.jpg", fileText(jpeg)), [`home-path:${MAC}zorblax`]);
});

test("the repository is clean, the checker and this test included", () => {
  const hits = scanRepo(ROOT);
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line}: ${h.rule}: ${h.match}`), []);
});
