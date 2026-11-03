// scripts/privacy-check.mjs: the rules, the allowlist, and a clean tree.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { scan, scanRepo } from "../scripts/privacy-check.mjs";

const rules = (file, text, allow) => scan(file, text, allow).map((h) => `${h.rule}:${h.match}`);

test("absolute home paths are hits unless the user is a placeholder", () => {
  assert.deepEqual(rules("a.md", "see /Users/feliperosa/workspace and /home/bob/x"),
    ["home-path:/Users/feliperosa", "home-path:/home/bob", "private-name:feliperosa"]);
  assert.deepEqual(rules("a.md", "C:\\Users\\bob\\x"), ["home-path:C:\\Users\\bob"]);
  assert.deepEqual(rules("a.md", "/Users/x/brain-v3 and /home/someone", { users: ["x", "someone"] }), []);
  assert.deepEqual(rules("a.md", "~/workspace and $HOME/.config and /home is a word"), []);
});

test("private machine and host names are hits; group labels G9/G10 are not", () => {
  assert.deepEqual(rules("a.md", "terminals on khal-labs, hx470/t18, Ryzen and g10/t8"),
    ["private-name:khal-labs", "private-name:hx470", "private-name:Ryzen", "private-name:g10"]);
  assert.deepEqual(rules("a.md", "url: https://juice.lembr.ai"), ["private-name:lembr.ai"]);
  assert.deepEqual(rules("a.md", "Group G9 and G10; sha 3g10a; hg100"), []);
});

test("emails are hits outside reserved example domains", () => {
  assert.deepEqual(rules("a.md", "mail bob@corp.com"), ["email:bob@corp.com"]);
  assert.deepEqual(rules("a.md", "a@example.com b@proxy.example c@x.test u@users.noreply.github.com"), []);
  assert.deepEqual(rules("a.md", "mail bob@corp.com", { emails: ["bob@corp.com"] }), []);
});

test("credentials and local database files are hits", () => {
  assert.deepEqual(rules("a.md", `token ghp_${"a".repeat(36)}`), ["secret:ghp_aaaa…"]);
  assert.deepEqual(rules("a.md", "-----BEGIN OPENSSH PRIVATE KEY-----"), ["secret:-----BEG…"]);
  assert.deepEqual(rules(".genie/genie.db", ""), ["db-file:.genie/genie.db"]);
  assert.deepEqual(rules("data/x.sqlite3", ""), ["db-file:data/x.sqlite3"]);
  assert.deepEqual(rules("src/db.js", "const db = 1"), []);
});

test("a lines entry allows exact text in one named file only", () => {
  const allow = { lines: [{ file: "w.md", text: "`wish/herdr-bots-g10`" }] };
  assert.deepEqual(rules("w.md", "- **Branch:** `wish/herdr-bots-g10`", allow), []);
  assert.deepEqual(rules("w.md", "live terminal g10/t8", allow), ["private-name:g10"]);
  assert.deepEqual(rules("other.md", "`wish/herdr-bots-g10`", allow), ["private-name:g10"]);
});

test("the checker's own files are not scanned for the terms they name", () => {
  assert.deepEqual(rules("scripts/privacy-check.mjs", "hx470 /Users/feliperosa"), []);
});

test("the repository is clean", () => {
  const hits = scanRepo(fileURLToPath(new URL("..", import.meta.url)));
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line}: ${h.rule}: ${h.match}`), []);
});
