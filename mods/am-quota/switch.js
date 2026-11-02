// am-quota's switch: the one thing the panel changes — which account the local clients use.
//
// Extracted from the panel so the flow itself, not only the shell it runs, is exercised by
// `node --test`: `exec`, `readTextFile`, `writeTextFile` and `unlink` are injected, and the flow
// answers with what it wrote (a label and a fingerprint — never a token) or throws the one line
// the panel shows.
//
// The order is deliberate: download → translate → private payload → back up the Keychain item →
// merge → write the item → write the file (or not, see `credentialTarget`) → answer. An item that
// was touched is put back when a later step fails; one that the script refused before running the
// add (exit 75) is left alone, because it never changed.
import * as fs from "fs/promises";
import { credentialTarget, itemText, keychainService, mergeCredentialItem, problems, TARGETS, tokenIdentity } from "./translate.js";
import { installScript, KEYCHAIN_BYTES, keychainBackupPath, keychainBackupScript, keychainRestoreScript, keychainScript, payload as credentialPayload, payloadDir, payloadPath, prepareScript } from "./write.js";

const message = (err) => String(err?.message ?? err);

/** A credential body that is not JSON is reported by name: the text itself holds tokens. */
const parseCredential = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("the proxy's credential response was not JSON");
  }
};

/** The UTF-8 byte length of a string: what the Keychain item is measured in. */
const bytes = (s) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
    else n += 3;
  }
  return n;
};

/** `~` for the home folder, so a message names a file without a person's full path. */
const displayPath = (file, home) => (file.startsWith(home) ? `~${file.slice(home.length)}` : file);

/**
 * Installs one proxy credential into the client that owns that provider. Everything sensitive
 * happens in files the shell reads: the token never enters argv, a log, a notify or shared state.
 *
 * `exec` is the runtime's `exec` (or a test's); `readTextFile`/`writeTextFile` have the runtime's
 * `(path, text, before)` shape, where `before: null` means create-only.
 */
export async function install({ api, provider, account, home, appHome, env = {}, platform = "macos", exec, readTextFile, writeTextFile, unlink = (p) => fs.unlink(p) }) {
  const target = TARGETS[provider];
  if (!target) throw new Error("no writer for that provider");
  let scratch = null;
  let backup = null;
  let hadItem = false;
  let touched = false;
  let plan = null;
  let service = null;
  try {
    const credential = parseCredential(await api.credential(account?.name));
    const missing = problems(provider, credential);
    if (missing.length) throw new Error(missing.join("; "));

    plan = credentialTarget(provider, { home, env, keychainWritten: true, platform });
    if (plan.keychain) {
      // A separate profile's item is the suffixed one; without it there is no correct item to
      // write, and the default profile's login must not be replaced instead.
      service = await keychainService(plan, { exec });
      if (!service) throw new Error("could not tell which Keychain item this profile reads; nothing was changed");
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    let body = credentialPayload(provider, credential);
    // The payload file holds tokens for a moment: the folder is 0700 before it exists, the file
    // is 0600 the instant `writeTextFile` creates it, and it is removed on every path — the
    // scripts' `rm`, the EXIT trap, and the finally below, whichever comes first.
    const dir = payloadDir(appHome);
    scratch = payloadPath(appHome, provider, stamp);
    const prep = await exec("sh", ["-c", prepareScript(), "sh", dir, scratch]);
    if (prep.code !== 0) throw new Error("could not prepare a private file for the credential");

    // Before the item is replaced: save it, and keep whatever else it holds (`mcpOAuth`, …).
    if (plan.keychain) {
      backup = keychainBackupPath(appHome, provider, stamp);
      const saved = await exec("sh", ["-c", keychainBackupScript(), "sh", service, backup]);
      if (saved.code === 0) {
        hadItem = true;
        const kept = itemText(await readTextFile(backup).catch(() => null));
        if (kept) body = mergeCredentialItem(kept, body);
      } else if (saved.code !== 3) {
        throw new Error("could not back up the existing Keychain item, so it was not replaced");
      }
      // Merging keeps the keys the CLI stores beside the tokens, so an item that already fills the
      // one-line `security -i` command cannot be carried over. Refuse in plain words before
      // anything is downloaded into place; never drop keys and never truncate the item.
      if (bytes(body) > KEYCHAIN_BYTES) throw new Error("this login item is too large to switch safely");
    }

    await writeTextFile(scratch, body, null);   // created by this call (the folder is 0700)
    const tight = await exec("chmod", ["600", scratch]);
    if (tight.code !== 0) throw new Error("could not restrict the credential payload file");

    // The Keychain first, so a refusal leaves the file on disk the way it was.
    if (plan.keychain) {
      const kc = await exec("sh", ["-c", keychainScript(), "sh", service, scratch]);
      // 75: refused before the add ran (a multi-line file, or one over the command-line budget).
      // The item is untouched then, so it must not be "put back" — the backup may not even exist.
      touched = kc.code !== 75;
      if (kc.code !== 0) throw new Error("could not write the Keychain item; nothing on disk was changed");
    }
    // On macOS with the Keychain verified, the plaintext file is not written at all: Claude reads
    // the item first, and a stale .credentials.json plus its backups are pure exposure.
    if (!plan.skipFile) {
      // Backup, then 0600, then an atomic rename — never a partial credential on disk.
      const done = await exec("sh", ["-c", installScript(stamp), "sh", scratch, plan.file]);
      if (done.code !== 0) throw new Error(`could not write ${displayPath(plan.file, home)}: ${(done.stderr || done.stdout).trim().slice(0, 120)}`);
    }

    return { label: target.label, fingerprint: tokenIdentity(provider, body) };
  } catch (err) {
    let line = message(err);
    if (touched && plan?.keychain && service) {
      // A Keychain write may have landed (or half-landed) before a later step failed.
      const back = await exec("sh", ["-c", keychainRestoreScript(), "sh", service, backup ?? "", hadItem ? "restore" : "delete"])
        .catch(() => null);
      line += back?.code === 0
        ? "; the Keychain item was put back"
        : "; the Keychain item could not be put back — reinstall that account before restarting Claude";
    }
    throw new Error(line);
  } finally {
    if (scratch) await unlink(scratch).catch(() => {});
    if (backup) await unlink(backup).catch(() => {});
  }
}
