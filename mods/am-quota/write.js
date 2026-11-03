// am-quota's writes: the shell that installs a credential, as text.
//
// Pure, like `translate.js`, so `node --test` can read every line of it. The rules live here and
// are asserted by `test/am-quota-write.test.mjs`:
//   1. the secret is only ever read from a file, never interpolated into a command line;
//   2. the final file is 0600 before it becomes visible and arrives by atomic rename;
//   3. a failed backup aborts the write instead of overwriting unbacked-up;
//   4. a Keychain item is copied out before it is replaced, and can be put back (or the added item
//      deleted) when a later step fails;
//   5. a refusal that happens *before* the item is touched exits 75, so the caller does not roll
//      back something that never changed.
//
// `$1`/`$2` are always positional: nothing here is spliced by string concatenation, so a home
// directory with spaces or `$` cannot change what runs.

import { toClaude, toCodex } from "./translate.js";

/**
 * What goes into the payload file. Codex's `auth.json` is pretty-printed — that is the shape the
 * client itself writes. The Claude credential *must* be one line with no trailing newline: it is
 * the one that also goes to the Keychain, and `security find-generic-password -w` prints a value
 * holding 0x0a as hex (the stored bytes are correct), so a multi-line item could not be compared
 * by the read-back that proves the write. Compact JSON is also what the CLI writes to that item.
 */
export const payload = (provider, credential) =>
  provider === "codex" ? `${JSON.stringify(toCodex(credential), null, 2)}\n` : JSON.stringify(toClaude(credential));

/** Where the per-switch payload file lives. 0700 folder, 0600 file for as long as it exists. */
export const payloadDir = (appHome) => `${appHome}/data/am-quota`;

/** `payloadPath` names one payload; the provider and a timestamp keep runs apart. */
export const payloadPath = (appHome, provider, stamp) => `${payloadDir(appHome)}/${provider}-${stamp}.json`;

/**
 * What one `security -i` command line can carry, in payload bytes. The line is
 * `add-generic-password -U -a "<login>" -s "<service>" -X "<hex>"` and the guard keeps it at or
 * under 4000 characters. Two hex characters per byte, 41 for the command's own words and quotes,
 * and ~33–37 for a login and the (possibly suffixed) service leave just under 1,962 bytes; 1,950 is
 * the round number beneath that, so an item this check passes also passes the shell's own guard.
 */
export const KEYCHAIN_BYTES = 1950;

/**
 * Makes the payload folder private *before* a payload exists. The file itself cannot be pre-made:
 * `writeTextFile(path, text, null)` means "create", and rejects when the file is already there, so
 * the mod creates it. The folder's 0700 is what keeps the file unreadable to anyone else, whatever
 * mode the writer gives it; the mod then narrows the file to 0600 as well.
 */
export function prepareScript() {
  return `set -eu
mkdir -p "$1"
chmod 700 "$1"`;
}

/** One switch's copy of the Keychain item's bytes, taken before it is replaced. */
export const keychainBackupPath = (appHome, provider, stamp) => `${payloadDir(appHome)}/keychain-${provider}-${stamp}.hex`;

/** Empties a directory of payloads and item backups older than an hour (an interrupted switch
 *  leaves one behind). */
export function sweepScript() {
  return `set -eu
find "$1" -maxdepth 1 -type f \\( -name "*.json" -o -name "*.hex" \\) -mmin +60 -delete 2>/dev/null || true`;
}

/**
 * Installs the payload file as the client's credential: back up (and tighten) what is there,
 * copy to a sibling temp file, 0600, atomic `mv`, then remove the payload. `set -eu` means a
 * failed backup aborts; the temp file is removed on any exit path.
 */
export function installScript(stamp) {
  return `set -eu
trap 'rm -f "$2.tmp-${stamp}"' EXIT
mkdir -p "$(dirname "$2")"
if [ -e "$2" ]; then
  cp -p "$2" "$2.bak-${stamp}"
  chmod 600 "$2.bak-${stamp}"
fi
cp "$1" "$2.tmp-${stamp}"
chmod 600 "$2.tmp-${stamp}"
mv "$2.tmp-${stamp}" "$2"
rm -f "$1"
# Keep three backups, not one per click. Only files with this script's own stamp shape count,
# so a hand-made "<file>.bak-mine" is never touched; the stamps sort, so the earliest go first.
# Rotation is cosmetic: a failure here must not turn a successful install into an error.
count=0
for old in "$2".bak-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*; do [ -e "$old" ] && count=$((count + 1)); done
i=0
for old in "$2".bak-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*; do
  [ -e "$old" ] || continue
  i=$((i + 1))
  [ "$i" -le $((count - 3)) ] && rm -f "$old" 2>/dev/null || true
done
true`;
}

/**
 * Writes the Keychain item the CLI actually reads (`security find-generic-password -w -s
 * "<service>"`; `$1` is the service, which for a `CLAUDE_CONFIG_DIR` profile is the suffixed name
 * from `translate.keychainService`). Measured against the installed CLI's own writer: it feeds
 * `security -i` a command line on stdin with the payload hex-encoded via `-X`, because `-w`
 * prompts twice and truncates at 128 bytes, and because a quoted `-w` value would put the token in
 * `security`'s argv. Nothing secret is ever an argument here — only the service name, and the
 * login account, which is what the CLI looks up.
 *
 * Two measured facts keep the 4000-character guard *and* the read-back necessary. `security -i`
 * answers with the status of the last command it ran, so a failed inner add can still exit 0; and
 * an over-long command line is not refused up front — it runs a truncated add (2,012 bytes stored
 * in the measurement) and only then reports an error. The guard refuses what cannot fit; the
 * read-back catches a truncated store.
 *
 * Exit 75 means the payload was refused before the add ran — a multi-line file, or one over the
 * command-line budget — so the caller must not try to put an item back that never changed.
 *
 * The read-back compares HEX on both sides: `security find-generic-password -w` prints its value as
 * hex whenever the bytes hold a non-ASCII byte (not only 0x0a), and as text otherwise — "Café" comes
 * back as 436166c3a9. Comparing text alone would reject every such item even though the bytes were
 * stored correctly.
 */
export function keychainScript() {
  return `set -eu
# One line, no trailing newline: -w prints hex for a value holding 0x0a, so a multi-line item
# could not be compared by the read-back below.
[ "$(wc -l < "$2" | tr -d ' ')" -eq 0 ] || { echo "am-quota: a multi-line credential cannot go through security -i" >&2; exit 75; }
acct=$(id -un)
hex=$(od -An -v -tx1 < "$2" | tr -d ' \n')
cmd="add-generic-password -U -a \\"$acct\\" -s \\"$1\\" -X \\"$hex\\""
[ \${#cmd} -le 4000 ] || { echo "am-quota: the credential is too large for the Keychain" >&2; exit 75; }
printf '%s\\n' "$cmd" | security -i >/dev/null
# -i answers with the last command's status; a truncated add can still leave exit 0, so read it back.
# Compare bytes: -w prints hex for any value holding a non-ASCII byte, text otherwise. Both readings
# are tried, so a payload that happens to be all hex characters still matches as text.
want=$(od -An -v -tx1 < "$2" | tr -d ' \n')
got=$(security find-generic-password -w -s "$1" -a "$acct")
got_text=$(printf '%s' "$got" | od -An -v -tx1 | tr -d ' \n')
got_hex=$(printf '%s' "$got" | tr -d '\n' | tr 'A-F' 'a-f')
[ "$got_text" = "$want" ] || [ "$got_hex" = "$want" ] || { echo "am-quota: the Keychain item did not take the credential" >&2; exit 1; }`;
}

/**
 * Saves the item's bytes to a hex file before it is replaced, so a later failure can put the old
 * item back. `$1` service, `$2` backup path. Exit 0: saved. Exit 3: there is no item (nothing to
 * restore; a rollback deletes the one that was added). Anything else: the item exists but could
 * not be read, and the caller must not replace it.
 */
export function keychainBackupScript() {
  return `set -u
umask 077
if security find-generic-password -w -s "$1" > "$2" 2>/dev/null; then
  code=0
else
  code=$?
fi
if [ "$code" -ne 0 ]; then
  rm -f "$2"
  [ "$code" -eq 44 ] && exit 3
  exit 1
fi
chmod 600 "$2"
# -w prints the value, or its hex when the bytes hold 0x0a. The backup is hex either way; command
# substitution strips the one newline -w appends, so a restored item is byte-identical.
raw=$(cat "$2")
case "$raw" in
  ""|*[!0-9a-fA-F]*) hex=$(printf '%s' "$raw" | od -An -v -tx1 | tr -d ' \n') ;;
  *) if [ $(( \${#raw} % 2 )) -eq 0 ]; then hex=$raw; else hex=$(printf '%s' "$raw" | od -An -v -tx1 | tr -d ' \n'); fi ;;
esac
printf '%s' "$hex" > "$2"
chmod 600 "$2"`;
}

/**
 * Puts a backed-up item back, or deletes the item a failed switch added. `$1` service, `$2` backup
 * path, `$3` "restore" or "delete".
 */
export function keychainRestoreScript() {
  return `set -eu
umask 077
if [ "$3" = "delete" ]; then
  security delete-generic-password -s "$1" >/dev/null 2>&1 || true
  exit 0
fi
acct=$(id -un)
hex=$(cat "$2")
cmd="add-generic-password -U -a \\"$acct\\" -s \\"$1\\" -X \\"$hex\\""
[ \${#cmd} -le 4000 ] || { echo "am-quota: the old Keychain item is too large to restore" >&2; exit 1; }
printf '%s\\n' "$cmd" | security -i >/dev/null`;
}
