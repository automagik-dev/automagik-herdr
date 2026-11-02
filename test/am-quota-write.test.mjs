// The credential write, tested as it runs: the shell is executed against temp dirs, so claims about
// modes, atomicity and cleanup are observed, not asserted about source text alone.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { installScript, KEYCHAIN_BYTES, keychainScript, keychainBackupScript, keychainBackupPath, keychainRestoreScript, payload as credentialPayload, payloadDir, payloadPath, prepareScript, sweepScript } from "../mods/am-quota/write.js";
import { keychainReadScript } from "../mods/am-quota/translate.js";
import { keychain, word } from "./am-quota-keychain.mjs";

const STAMP = "2026-11-01T12-00-00-000Z";
const SECRET = '{"claudeAiOauth":{"accessToken":"at-SECRET-0123456789abcdef"}}';
// A credential in the proxy's shape, and the two payloads the mod builds from it.
const PROXY_CRED = { access_token: "at-" + "0".repeat(1200), refresh_token: "rt-" + "0".repeat(200), account_id: "acc-1", expired: "2026-11-01T13:00:00Z" };
const sh = (script, ...args) => spawnSync("sh", ["-c", script, "sh", ...args], { encoding: "utf8" });
const mode = (p) => statSync(p).mode & 0o777;
const dir = () => mkdtempSync(join(tmpdir(), "am-quota-write-"));

// Every Keychain test runs against the stand-in in ./am-quota-keychain.mjs, on every platform,
// never the real `security`: that one writes the person's login keychain, and under a scratch HOME
// it pops a "Keychain Not Found" dialog on their screen. `kc.sh` runs a product script with the
// stand-in first on PATH; `kc.run` calls the stand-in by its absolute path. Nothing here spawns
// `security` any other way — am-quota-keychain-guard.test.mjs checks the source for it.
const readItem = (kc, svc) => kc.run(["find-generic-password", "-w", "-s", svc]);
/** The `-i` add line the product sends, as the stand-in logs it (the value is only its size). */
const addLine = (kc, svc, bytes) => `-i: add-generic-password -U -a ${word(kc.account)} -s ${word(svc)} -X <${bytes} bytes>`;

test("prepare: the payload folder is 0700 before any payload exists", () => {
  const home = dir();
  const p = payloadPath(home, "claude", STAMP);
  const out = sh(prepareScript(), payloadDir(home), p);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(mode(payloadDir(home)), 0o700, "nobody else can traverse to the file");
  // The file cannot be pre-made: writeTextFile(path, text, null) is create-only, so the mod
  // creates it into the private folder and narrows it to 0600 right after.
  assert.equal(existsSync(p), false);
  writeFileSync(p, SECRET);
  assert.equal(sh(`chmod 600 "${p}"`).status, 0);
  assert.equal(mode(p), 0o600);
});

test("install: 0600 target, a tightened backup, an atomic rename, and the payload removed", () => {
  const home = dir();
  const payload = payloadPath(home, "claude", STAMP);
  assert.equal(sh(prepareScript(), payloadDir(home), payload).status, 0);
  writeFileSync(payload, SECRET);   // what the mod does with writeTextFile

  const target = join(home, "target.json");
  writeFileSync(target, '{"old":true}');
  chmodSync(target, 0o644);   // a loose file from elsewhere, to prove the backup is tightened

  const out = sh(installScript(STAMP), payload, target);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(readFileSync(target, "utf8"), SECRET);
  assert.equal(mode(target), 0o600);
  assert.equal(readFileSync(`${target}.bak-${STAMP}`, "utf8"), '{"old":true}');
  assert.equal(mode(`${target}.bak-${STAMP}`), 0o600, "the backup of a loose file is 0600 too");
  assert.equal(existsSync(payload), false, "the payload does not outlive the write");
  assert.equal(readdirSync(join(home)).filter((n) => n.includes(".tmp-")).length, 0, "no temp file left");
});

test("install: a failed backup aborts instead of overwriting unbacked-up", () => {
  const home = dir();
  const payload = payloadPath(home, "claude", STAMP);
  assert.equal(sh(prepareScript(), payloadDir(home), payload).status, 0);
  writeFileSync(payload, SECRET);
  const target = join(home, "locked", "target.json");   // the parent cannot be created: it is a file
  writeFileSync(join(home, "locked"), "not a directory");
  const out = sh(installScript(STAMP), payload, target);
  assert.notEqual(out.status, 0, "the script fails loudly");
  assert.equal(existsSync(target), false);
});

test("install: an interrupted run leaves no temp file and no partial target", () => {
  const home = dir();
  const payload = payloadPath(home, "codex", STAMP);
  assert.equal(sh(prepareScript(), payloadDir(home), payload).status, 0);
  writeFileSync(payload, SECRET);
  const target = join(home, "sub", "auth.json");
  // The copy step is made to fail by a read-only parent: the trap must clean the temp name.
  assert.equal(sh(`mkdir -p "${join(home, "sub")}"`, "").status, 0);
  chmodSync(join(home, "sub"), 0o500);
  const out = sh(installScript(STAMP), payload, target);
  chmodSync(join(home, "sub"), 0o700);
  assert.notEqual(out.status, 0);
  assert.equal(existsSync(target), false);
  assert.equal(readdirSync(join(home, "sub")).filter((n) => n.includes(".tmp-")).length, 0, "the trap removed the temp file");
});

test("keychain: the item is written through `security -i` on stdin, never in argv", () => {
  const script = keychainScript();
  assert.match(script, /\| security -i/, "the command line goes in on stdin");
  assert.ok(script.includes('-X \\"$hex\\"'), "the payload travels hex-encoded, quoted: no splitting, no newline hazards");
  assert.doesNotMatch(script, /-w "/, "no -w with a value: that would be argv, and it truncates at 128B");
  assert.doesNotMatch(script, /security[^\n]*\$\(cat/, "no secret is ever expanded into a security argument");
  assert.match(script, /^want=\$\(od -An -v -tx1 < "\$2"/m, "the payload is compared as hex, never as text");
  assert.match(script, /got_hex=\$\(printf '%s' "\$got"/, "and the -w answer is tried as hex too: it prints hex for any non-ASCII byte");
  assert.match(script, /\$\{#cmd\} -le 4000/, "a payload too big for the command line is refused, not moved to argv");
  assert.ok(script.includes('-a \\"$acct\\"'), "the account is quoted: `security -i` splits on spaces");
  assert.ok(script.includes('-s \\"$1\\"'), "and so is the service — `Claude Code-credentials` holds a space");
  assert.match(script, /find-generic-password -w -s "\$1"/, "and the item is read back: `security -i` can exit 0 after a failed inner command");
});

test("guard: in a Keychain test's env `security` is the stand-in, and it fails closed without one", () => {
  const kc = keychain();
  const which = spawnSync("sh", ["-c", "command -v security"], { encoding: "utf8", env: kc.env });
  assert.equal(which.stdout.trim(), kc.security, "PATH finds the stand-in, never /usr/bin/security");
  assert.ok(kc.env.PATH.startsWith(`${kc.security.slice(0, -"/security".length)}:`), "its folder is first on PATH");
  assert.equal(kc.sh(keychainReadScript(), "am-quota-test-guard").status, 44, "a product script reaches it");
  assert.deepEqual(kc.calls().map((c) => c.bin), [kc.security], "and the call was the stand-in's");
  const bare = spawnSync(kc.security, ["find-generic-password", "-w", "-s", "x"], { encoding: "utf8", env: { PATH: "/usr/bin:/bin" } });
  assert.equal(bare.status, 70, "without its folder the stand-in stops; it never hands off to anything");
});

test("keychain: a real credential lands in the item and reads back byte-identical", () => {
  const kc = keychain();
  const home = dir();
  const svc = "am-quota-test-write";
  const p = payloadPath(home, "claude", STAMP);   // `payload` is the builder above
  assert.equal(sh(prepareScript(), payloadDir(home), p).status, 0);
  // A realistic Claude credential (~1.5 kB → ~3 kB of hex), not just a toy: this is the size band
  // where a truncating writer would still exit 0.
  // Exactly the shape the mod writes for Claude: one line, no trailing newline.
  const big = credentialPayload("claude", PROXY_CRED);
  assert.ok(!big.includes("\n") && !big.endsWith("\n"), "single line, as write.js's payload() guarantees");
  writeFileSync(p, big);   // > the 128-byte prompt cap that made `security -w` unusable
  const out = kc.sh(keychainScript(), svc, p);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(kc.bytes(svc), Buffer.from(big, "utf8"), "the stored bytes are the payload's");
  const got = kc.sh(keychainReadScript(), svc);
  assert.equal(got.stdout.replace(/\n+$/, ""), big, "the client reads back exactly what the proxy sent");
  assert.deepEqual(kc.lines(), [
    addLine(kc, svc, Buffer.byteLength(big)),   // on stdin: the hex never reaches argv
    `find-generic-password -w -s ${svc} -a ${word(kc.account)}`,   // the script's read-back
    `find-generic-password -w -s ${svc}`,   // the client's read
  ]);
});

test("keychain: a payload too large for the stdin command line fails instead of leaking to argv", () => {
  const kc = keychain();
  const home = dir();
  const svc = "am-quota-test-big";
  const payload = payloadPath(home, "claude", STAMP);
  assert.equal(sh(prepareScript(), payloadDir(home), payload).status, 0);
  writeFileSync(payload, "x".repeat(3000));   // hex is 6000 chars: over the 4000 limit
  const out = kc.sh(keychainScript(), svc, payload);
  assert.equal(out.status, 75, "75 is for a refusal before the add ran: there is nothing to put back");
  assert.match(out.stderr, /too large/);
  assert.deepEqual(kc.calls(), [], "security was never called");
  assert.equal(readItem(kc, svc).status, 44, "and nothing was stored");
});

test("keychain: the old item is saved before it is replaced, and the backup puts it back exactly", () => {
  const kc = keychain();
  const home = dir();
  const svc = "am-quota-test-backup";
  const payload = payloadPath(home, "claude", STAMP);
  assert.equal(sh(prepareScript(), payloadDir(home), payload).status, 0);
  // The item the CLI keeps: our OAuth blob next to a key the panel must never lose.
  const first = JSON.stringify({ claudeAiOauth: { accessToken: "at-old-0123456789abcdef" }, mcpOAuth: { keep: "me" } });
  writeFileSync(payload, first);
  assert.equal(kc.sh(keychainScript(), svc, payload).status, 0, "seed the item");

  const backup = keychainBackupPath(home, "claude", STAMP);
  const saved = kc.sh(keychainBackupScript(), svc, backup);
  assert.equal(saved.status, 0, saved.stderr);
  assert.equal(mode(backup), 0o600, "the backup holds tokens");
  assert.match(readFileSync(backup, "utf8"), /^[0-9a-f]+$/, "hex, one line, no trailing newline");
  assert.equal(readFileSync(backup, "utf8"), Buffer.from(first, "utf8").toString("hex"), "the item's bytes");

  // A switch replaces the item; a later failure must be able to undo that.
  const second = JSON.stringify({ claudeAiOauth: { accessToken: "at-new-0123456789abcdef" } });
  writeFileSync(payload, second);
  assert.equal(kc.sh(keychainScript(), svc, payload).status, 0);
  assert.equal(readItem(kc, svc).stdout.replace(/\n+$/, ""), second);

  const back = kc.sh(keychainRestoreScript(), svc, backup, "restore");
  assert.equal(back.status, 0, back.stderr);
  assert.equal(kc.lines().at(-1), addLine(kc, svc, Buffer.byteLength(first)), "the restore is one -i add");
  assert.deepEqual(kc.bytes(svc), Buffer.from(first, "utf8"), "byte-identical, the other key included");
  const got = kc.sh(keychainReadScript(), svc);
  assert.equal(got.stdout.replace(/\n+$/, ""), first, "and the client reads it so");
});

test("keychain: no item before the first install means rollback deletes instead of restoring", () => {
  const kc = keychain();
  const home = dir();
  const svc = "am-quota-test-absent";
  const backup = join(home, "none.hex");
  assert.equal(kc.sh(keychainBackupScript(), svc, backup).status, 3, "nothing to save: not an error");
  assert.equal(existsSync(backup), false, "and no empty backup left behind");

  const payload = payloadPath(home, "claude", STAMP);
  assert.equal(sh(prepareScript(), payloadDir(home), payload).status, 0);
  writeFileSync(payload, SECRET);
  assert.equal(kc.sh(keychainScript(), svc, payload).status, 0, "the first install");
  assert.equal(kc.sh(keychainRestoreScript(), svc, "", "delete").status, 0);
  assert.equal(kc.lines().at(-1), `delete-generic-password -s ${svc}`);
  assert.equal(kc.bytes(svc), null, "the added item is gone");
  assert.equal(readItem(kc, svc).status, 44);
});

test("keychain: backup and restore keep the secret out of argv too", () => {
  for (const script of [keychainBackupScript(), keychainRestoreScript()]) {
    assert.doesNotMatch(script, /-w "/, "no value as a security argument: that would be argv");
    assert.doesNotMatch(script, /security[^\n]*\$\(cat/, "the payload is read into a variable, never expanded at a security argument");
  }
  assert.match(keychainRestoreScript(), /delete-generic-password/, "a first install with no old item is undone by deleting");
  assert.match(keychainRestoreScript(), /\| security -i/, "a restore goes in on stdin, like the write");
});

test("keychain: an item holding a newline comes back as hex, and is still backed up byte-identically", () => {
  const kc = keychain();
  const home = dir();
  const svc = "am-quota-test-hex";
  // The bytes are stored correctly; it is `-w` that prints hex. A pretty-printed item (an older
  // CLI, a hand-edited one) is exactly the case the backup must survive.
  const item = JSON.stringify({ claudeAiOauth: { accessToken: "at-old" }, mcpOAuth: { keep: "me" } }, null, 2);
  const seed = kc.run(["-i"], {
    input: `add-generic-password -U -a "${kc.account}" -s "${svc}" -X "${Buffer.from(item, "utf8").toString("hex")}"\n`,
  });
  assert.equal(seed.status, 0, seed.stderr);
  assert.match(readItem(kc, svc).stdout.trim(), /^[0-9a-f]+$/, "a value with 0x0a reads back as hex, not text");

  const payload = payloadPath(home, "claude", STAMP);
  assert.equal(sh(prepareScript(), payloadDir(home), payload).status, 0);
  const backup = keychainBackupPath(home, "claude", STAMP);
  assert.equal(kc.sh(keychainBackupScript(), svc, backup).status, 0);
  assert.equal(readFileSync(backup, "utf8"), Buffer.from(item, "utf8").toString("hex"), "the backup is the raw bytes");

  // Replace the item the way a switch does, then undo it.
  writeFileSync(payload, SECRET);
  assert.equal(kc.sh(keychainScript(), svc, payload).status, 0);
  assert.equal(kc.item(svc), SECRET);
  assert.equal(kc.sh(keychainRestoreScript(), svc, backup, "restore").status, 0);
  assert.deepEqual(kc.bytes(svc), Buffer.from(item, "utf8"), "the old bytes, newline and all");
  const got = readItem(kc, svc).stdout.trim();
  assert.equal(Buffer.from(got, "hex").toString("utf8"), item, "and -w still prints them as hex");
});

test("install: three backups are kept, not one per click", () => {
  const home = dir();
  const target = join(home, "auth.json");
  for (let n = 0; n < 5; n++) {
    const stamp = `2026-11-0${n + 1}T12-00-00-000Z`;
    const payload = payloadPath(home, "codex", stamp);
    assert.equal(sh(prepareScript(), payloadDir(home), payload).status, 0);
    writeFileSync(payload, `${SECRET}-${n}`);
    assert.equal(sh(installScript(stamp), payload, target).status, 0);
  }
  const backups = readdirSync(home).filter((n) => n.startsWith("auth.json.bak-")).sort();
  assert.equal(backups.length, 3, "the three newest");
  assert.deepEqual(backups, ["auth.json.bak-2026-11-03T12-00-00-000Z", "auth.json.bak-2026-11-04T12-00-00-000Z", "auth.json.bak-2026-11-05T12-00-00-000Z"]);
  for (const b of backups) assert.equal(mode(join(home, b)), 0o600);
});

test("payload: Codex is pretty-printed, Claude is one line — what the Keychain step requires", () => {
  const claude = credentialPayload("claude", PROXY_CRED);
  assert.ok(!claude.includes("\n"), "no newline at all: security -i's -X mis-stores hex containing 0x0a");
  assert.deepEqual(JSON.parse(claude).claudeAiOauth.accessToken, PROXY_CRED.access_token, "and it still parses");
  const codex = credentialPayload("codex", PROXY_CRED);
  assert.ok(codex.endsWith("\n") && codex.split("\n").length > 3, "the file the client reads, as the client writes it");
  assert.deepEqual(JSON.parse(codex).tokens.account_id, "acc-1");
});

test("keychain: a service name with spaces is quoted, so the item addressed is the item named", () => {
  const kc = keychain();
  const home = dir();
  const svc = "am-quota-test write with spaces";
  const p = payloadPath(home, "claude", STAMP);
  assert.equal(sh(prepareScript(), payloadDir(home), p).status, 0);
  writeFileSync(p, SECRET);
  const out = kc.sh(keychainScript(), svc, p);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(kc.lines()[0], addLine(kc, svc, Buffer.byteLength(SECRET)), "one quoted service word");
  assert.ok(kc.services().every((s) => s === svc), `every call named the whole service, saw: ${kc.services().join(" | ")}`);
  assert.equal(readItem(kc, svc).stdout.replace(/\n+$/, ""), SECRET, "the real service (and the default one) holds a space");
});

test("the item budget sits under the shell's own one-line guard", () => {
  assert.ok(KEYCHAIN_BYTES > 1200 && KEYCHAIN_BYTES < 1962, String(KEYCHAIN_BYTES));
  // 41 for the command's words and quotes, ~35 for the login and the longest service name.
  const bytes = Math.floor((4000 - 41 - 35) / 2);
  assert.ok(KEYCHAIN_BYTES <= bytes, "an item this check passes must also pass keychainScript's guard");
});

test("keychain: a multi-line payload is refused instead of stored as hex text", () => {
  const kc = keychain();
  const home = dir();
  const svc = "am-quota-test-multiline";
  const p = payloadPath(home, "claude", STAMP);
  assert.equal(sh(prepareScript(), payloadDir(home), p).status, 0);
  writeFileSync(p, JSON.stringify({ claudeAiOauth: { accessToken: "at-" + "0".repeat(40) } }, null, 2) + "\n");
  const out = kc.sh(keychainScript(), svc, p);
  assert.equal(out.status, 75, "a refusal before the add: no rollback, because nothing changed");
  assert.match(out.stderr, /multi-line credential/);
  assert.deepEqual(kc.calls(), [], "security was never called");
  assert.equal(readItem(kc, svc).status, 44, "nothing was stored");
});

test("sweep: payloads and item backups older than an hour are removed, and a missing folder is fine", () => {
  const home = dir();
  const p = payloadPath(home, "claude", STAMP);
  assert.equal(sh(prepareScript(), payloadDir(home), p).status, 0);
  writeFileSync(p, SECRET);
  const b = keychainBackupPath(home, "claude", STAMP);
  writeFileSync(b, "7b7d");
  // Backdate both past the hour the sweep looks for.
  const old = new Date(Date.now() - 2 * 3600 * 1000);
  const stampOf = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  spawnSync("touch", ["-t", stampOf(old), p, b]);
  assert.equal(sh(sweepScript(), payloadDir(home)).status, 0);
  assert.equal(existsSync(p), false, "an interrupted switch does not leave a token file behind");
  assert.equal(existsSync(b), false, "nor the copy of the item it saved");
  assert.equal(sh(sweepScript(), join(home, "does-not-exist")).status, 0, "a missing folder is not an error");
});

test("keychain: a failed file install after a successful item write rolls the item back", () => {
  const kc = keychain();
  const home = dir();
  const svc = "am-quota-test-rollback";
  const payload = payloadPath(home, "claude", STAMP);
  assert.equal(sh(prepareScript(), payloadDir(home), payload).status, 0);
  const first = JSON.stringify({ claudeAiOauth: { accessToken: "at-old-0123456789abcdef" }, mcpOAuth: { keep: "me" } });
  writeFileSync(payload, first);
  assert.equal(kc.sh(keychainScript(), svc, payload).status, 0, "seed the old item");

  // The panel's order: back the item up, write it, then install the file.
  const backup = keychainBackupPath(home, "claude", STAMP);
  assert.equal(kc.sh(keychainBackupScript(), svc, backup).status, 0);
  const second = JSON.stringify({ claudeAiOauth: { accessToken: "at-new-0123456789abcdef" } });
  writeFileSync(payload, second);
  assert.equal(kc.sh(keychainScript(), svc, payload).status, 0, "the item took the new credential");
  assert.equal(kc.item(svc), second);

  const target = join(home, "locked", "creds.json");   // its parent cannot be created: it is a file
  writeFileSync(join(home, "locked"), "not a directory");
  assert.notEqual(sh(installScript(STAMP), payload, target).status, 0, "the file step fails");

  assert.equal(kc.sh(keychainRestoreScript(), svc, backup, "restore").status, 0);
  assert.equal(kc.item(svc), first, "Claude is back on the old account, error and all");
  assert.equal(readItem(kc, svc).stdout.replace(/\n+$/, ""), first);
});
