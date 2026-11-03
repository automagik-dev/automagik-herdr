// usagemeter on every linked machine: the pack is the one usagemeter installer for the fleet.
// Each machine's own `usagemeter sync` writes that machine's `herdr-meter` doc to its own
// herdr-core, and the phone reads each doc there (`doc.get {name: "herdr-meter", on: <machine>}`),
// so the binary has to be installed, and run, on every machine, not just this computer.
//
// - Install: `uname -sm` on the machine picks the asset (release.js USAGEMETER, pinned); the
//   machine itself downloads that asset and the release's SHA256SUMS, checks the hash, and renames
//   a temp file beside ~/.local/bin/usagemeter into place. One that already reports the pinned
//   version stays, a newer one (or a dev build not older by its X.Y.Z) is never downgraded, and a
//   link, a folder or a binary that reports no version is left as it is.
// - Sync: the sidebar's (meter.js SYNC) on each connected machine, one at a time.
// - Uninstall: only a binary that still reports the version the pack recorded for that machine.
// Fixed scripts only, arguments as argv (never spliced into the script). Pure: the runner (`hc
// exec` for the CLI, Herdr's exec for the sidebar) is passed in, so `node --test` runs it.
// Apache-2.0.
import { USAGEMETER } from "./release.js";

export const METER_RELEASES = `https://github.com/${USAGEMETER.repo}/releases`;
/** The pinned release's download folder: `<base>/SHA256SUMS`, `<base>/<asset>`. */
export const releaseBase = (releases = METER_RELEASES, version = USAGEMETER.version) => `${releases}/download/v${version}`;

/**
 * Where the CLI downloads from: the pinned GitHub release, or, for the tests, `<release>/usagemeter`
 * under a file:// AUTOMAGIK_HERDR_RELEASE_URL (install.sh's own test hook, checked the same way).
 */
export function meterReleases(env = {}) {
  const url = env.AUTOMAGIK_HERDR_RELEASE_URL;
  if (typeof url === "string" && url.startsWith("file://") && !url.includes("..") && !url.includes("%")) return `${url.replace(/\/+$/, "")}/usagemeter`;
  return METER_RELEASES;
}

/**
 * The sha256 each asset must have: release.js USAGEMETER.sha256 (the pin; the release's own
 * SHA256SUMS proves integrity, not provenance). A file:// test release may pin its own with
 * AUTOMAGIK_HERDR_METER_PIN, the text of a SHA256SUMS-style file (`read` reads it); never a real one.
 */
export function meterPins(env = {}, read = () => "") {
  if (meterReleases(env) === METER_RELEASES || !env.AUTOMAGIK_HERDR_METER_PIN) return { ...USAGEMETER.sha256 };
  const pins = {};
  for (const line of String(read(env.AUTOMAGIK_HERDR_METER_PIN) ?? "").split("\n")) {
    const m = /^([0-9a-f]{64}) [ *](usagemeter-[a-z0-9_-]+)$/.exec(line.trim());
    if (m) pins[m[2]] = m[1];
  }
  return pins;
}

/** `uname -sm` → the platform key of USAGEMETER.assets (the aliases Pocket Link knew too). */
const PLATFORMS = Object.freeze({
  "Darwin arm64": "darwin-arm64", "Darwin aarch64": "darwin-arm64", "Darwin x86_64": "darwin-x86_64",
  "Linux x86_64": "linux-x86_64", "Linux amd64": "linux-x86_64", "Linux aarch64": "linux-aarch64", "Linux arm64": "linux-aarch64",
});
/** The release asset for a machine's `uname -sm`, or null when there is no build for it. */
export const assetFor = (uname) => USAGEMETER.assets[PLATFORMS[String(uname ?? "").trim().replace(/\s+/g, " ")]] ?? null;

/**
 * Where the person agreed to usagemeter, from the install record: `all` (this computer and every
 * linked machine), `local`, `none`, or null when nobody asked. The record's scope line says it,
 * and only an explicit `automagik-herdr meter install` or an install.sh run of this release writes
 * `all`. A record without one (an install.sh before this one wrote none, even for --no-usagemeter)
 * is never `all`: `local` when it shows the pack installed usagemeter on this computer, else
 * null (`update` then installs nowhere and prints OPT_IN).
 */
export function meterScope(record) {
  if (!record) return null;
  if (record.usagemeterScope) return record.usagemeterScope;
  return record.usagemeter ? "local" : null;
}

/** The line `update` prints when nobody asked: how to opt in. */
export const OPT_IN = "usagemeter: not installed by the update (no install has asked for it). To install it on this computer and every linked machine: automagik-herdr meter install";

/** A machine name as `hc machine ls` gives it, safe in the ownership record (`name:version,…`). */
export const MACHINE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * The linked machines in `hc machine ls --json` (it never lists this computer): `{ name, connected }`
 * each, temporary ones left out (the sidebar does the same), names the record can't hold dropped.
 */
export function linkedMachines(json) {
  let list = [];
  try { list = (typeof json === "string" ? JSON.parse(json) : json)?.machines ?? []; } catch { return []; }
  if (!Array.isArray(list)) return [];
  return list.filter((m) => m && !m.temporary && typeof m.name === "string" && MACHINE_NAME.test(m.name))
    .map((m) => ({ name: m.name, connected: m.state === "connected" }));
}

// The version a usagemeter reports (`usagemeter X.Y.Z`, a dev build `X.Y.Z-dev` or `X.Y.Z+b`),
// install.sh's meter_version, and its version_ge (field by field as numbers).
const VERSION_SH = `ver() {
  "$1" --version </dev/null 2>/dev/null \\
    | sed -n 's/^usagemeter \\([0-9][0-9]*\\.[0-9][0-9]*\\.[0-9][0-9]*\\([-+][0-9A-Za-z.+-]*\\)\\{0,1\\}\\)$/\\1/p' | head -n 1
}
ge() {
  awk -v a="$1" -v b="$2" 'BEGIN { split(a, x, "."); split(b, y, ".")
    for (i = 1; i <= 3; i++) { if (x[i] + 0 > y[i] + 0) exit 0; if (x[i] + 0 < y[i] + 0) exit 1 }
    exit 0 }' </dev/null
}
dest=$HOME/.local/bin/usagemeter`;

/**
 * Run on the machine as `sh -c INSTALL sh <base> <asset> <version> <sha256>`: the asset must match
 * both the release's SHA256SUMS and <sha256>, the pack's pin. Prints one line: `current`,
 * `newer <v>`, `link`, `unknown` (left as it is) or `installed`. Fails (stderr, exit 3: checksum,
 * 4: no curl, 5: download, 6: write) with nothing changed. The state is looked at again just before
 * the rename, in case something else put a usagemeter there meanwhile.
 */
export const INSTALL = `set -u
base=$1; asset=$2; want=$3; pin=$4
${VERSION_SH}
dir=\${dest%/*}
state() {
  if [ -L "$dest" ] || { [ -e "$dest" ] && [ ! -f "$dest" ]; }; then echo link; return 0; fi
  [ -f "$dest" ] || return 0
  have=$(ver "$dest")
  if [ -z "$have" ]; then echo unknown
  elif [ "$have" = "$want" ]; then echo current
  elif ge "\${have%%[-+]*}" "$want"; then echo "newer $have"
  fi
}
s=$(state); if [ -n "$s" ]; then echo "$s"; exit 0; fi
command -v curl >/dev/null 2>&1 || { echo "curl is not installed" >&2; exit 4; }
case $base in https://*) proto='=https' ;; *) proto='=file' ;; esac
tmp=$(mktemp -d "\${TMPDIR:-/tmp}/usagemeter.XXXXXX") || { echo "could not make a temporary folder" >&2; exit 6; }
part=
trap 'rm -rf "$tmp"; if [ -n "$part" ]; then rm -f "$part"; fi' EXIT
curl -fsSL --path-as-is --proto "$proto" "$base/SHA256SUMS" -o "$tmp/SHA256SUMS" </dev/null 2>/dev/null \\
  || { echo "could not download $base/SHA256SUMS" >&2; exit 5; }
curl -fsSL --path-as-is --proto "$proto" "$base/$asset" -o "$tmp/$asset" </dev/null 2>/dev/null \\
  || { echo "could not download $base/$asset" >&2; exit 5; }
expect=$(sed -n "s/^\\([0-9a-fA-F]\\{64\\}\\) [ *]$asset\\$/\\1/p" "$tmp/SHA256SUMS" | head -n 1 | tr 'A-F' 'a-f')
[ -n "$expect" ] || { echo "SHA256SUMS does not list $asset" >&2; exit 3; }
if command -v sha256sum >/dev/null 2>&1; then got=$(sha256sum "$tmp/$asset" </dev/null); else got=$(shasum -a 256 "$tmp/$asset" </dev/null); fi
got=\${got%% *}
[ "$got" = "$expect" ] || { echo "$asset does not match SHA256SUMS (sha256 $got, expected $expect): nothing was installed" >&2; exit 3; }
[ "$got" = "$pin" ] || { echo "$asset is not the build the pack pins (sha256 $got, pinned $pin): nothing was installed" >&2; exit 3; }
mkdir -p "$dir" || { echo "could not make $dir" >&2; exit 6; }
part=$(mktemp "$dir/.usagemeter.XXXXXX") || { echo "could not write in $dir" >&2; exit 6; }
cp "$tmp/$asset" "$part" && chmod 755 "$part" || { echo "could not write $dest" >&2; exit 6; }
s=$(state); if [ -n "$s" ]; then echo "$s"; exit 0; fi
mv -f "$part" "$dest" || { echo "could not write $dest" >&2; exit 6; }
part=
echo installed`;

/** Run as `sh -c UNINSTALL sh <version>`: removes the binary only if it still reports <version>. */
export const UNINSTALL = `set -u
${VERSION_SH}
if [ ! -f "$dest" ] || [ -L "$dest" ]; then echo absent; exit 0; fi
have=$(ver "$dest")
if [ "$have" != "$1" ]; then echo "other \${have:-none}"; exit 0; fi
rm -f "$dest" && echo removed`;

const short = (s) => String(s ?? "").trim().split("\n").filter(Boolean).pop()?.slice(0, 400) ?? "";

/** `hc exec --json` output ({ code, stdout, stderr: base64, timed_out }) as { code, stdout, stderr }. */
export function decodeExec(r, timeout) {
  let j = null;
  try { j = JSON.parse(r.stdout); } catch {}
  if (!j || typeof j !== "object" || !("code" in j)) return { code: -1, stdout: "", stderr: short(r.stderr) || short(r.stdout) || `hc exec failed (exit ${r.code})` };
  if (j.timed_out) return { code: -1, stdout: "", stderr: `timed out after ${timeout} s` };
  const text = (b) => { try { return Buffer.from(String(b ?? ""), "base64").toString("utf8"); } catch { return ""; } };
  return { code: typeof j.code === "number" ? j.code : -1, stdout: text(j.stdout), stderr: text(j.stderr) };
}

/** The `hc` arguments that run `argv` on `machine` within `timeout` seconds. */
export const hcExecArgs = (machine, argv, timeout) => ["exec", "--json", "--timeout", String(timeout), "--on", machine, "--", ...argv];

/**
 * Installs the pinned usagemeter on one machine (null: this computer). `run(argv, { on, timeout })`
 * resolves `{ code, stdout, stderr }` and never rejects. Resolves `{ machine, status, version?, why? }`,
 * status one of installed | current | newer | link | unknown | failed.
 */
export async function installOn(run, machine, { releases = METER_RELEASES, version = USAGEMETER.version, pins = USAGEMETER.sha256 } = {}) {
  const u = await run(["uname", "-sm"], { on: machine, timeout: 20 });
  if (u.code !== 0) return { machine, status: "failed", why: short(u.stderr) || "could not reach it" };
  const asset = assetFor(u.stdout);
  if (!asset) return { machine, status: "failed", why: `no usagemeter build for ${short(u.stdout).slice(0, 40) || "this system"}` };
  const pin = pins?.[asset];
  if (!/^[0-9a-f]{64}$/.test(pin ?? "")) return { machine, status: "failed", why: `no pinned sha256 for ${asset}` };
  const r = await run(["sh", "-c", INSTALL, "sh", releaseBase(releases, version), asset, version, pin], { on: machine, timeout: 180 });
  if (r.code !== 0) return { machine, status: "failed", why: short(r.stderr) || `exit ${r.code}` };
  const [word, have] = short(r.stdout).split(/\s+/);
  if (word === "installed" || word === "current") return { machine, status: word, version };
  if (word === "newer") return { machine, status: "newer", version: have ?? null };
  if (word === "link" || word === "unknown") return { machine, status: word };
  return { machine, status: "failed", why: `unexpected answer: ${short(r.stdout) || "(none)"}` };
}

/** Removes the pack's usagemeter from one machine: `{ machine, status: removed|absent|other|failed, why? }`. */
export async function uninstallOn(run, machine, version) {
  const r = await run(["sh", "-c", UNINSTALL, "sh", version], { on: machine, timeout: 30 });
  if (r.code !== 0) return { machine, status: "failed", why: short(r.stderr) || `exit ${r.code}` };
  const [word, have] = short(r.stdout).split(/\s+/);
  if (word === "removed" || word === "absent") return { machine, status: word };
  if (word === "other") return { machine, status: "other", why: have === "none" ? "it reports no usagemeter version" : `it is usagemeter ${have}` };
  return { machine, status: "failed", why: `unexpected answer: ${short(r.stdout) || "(none)"}` };
}

/**
 * The record's per-machine line after `results`: installed → that version, newer/link/unknown → not
 * the pack's any more, current/failed/removed-elsewhere → as it was. `machines`: { name: version }.
 */
export function recordAfter(machines, results) {
  const next = { ...machines };
  for (const r of results) {
    if (!r.machine) continue;
    if (r.status === "installed") next[r.machine] = r.version;
    else if (["newer", "link", "unknown", "removed", "absent", "other"].includes(r.status)) delete next[r.machine];
  }
  return next;
}

/** One line for a person per result. */
export function resultLine(r) {
  const where = r.machine ? `on ${r.machine}` : "on this computer";
  switch (r.status) {
    case "installed": return `usagemeter ${r.version} ${where}: installed (checksum ok).`;
    case "current": return `usagemeter ${r.version} ${where}: already installed.`;
    case "newer": return `usagemeter ${r.version ?? "(newer)"} ${where} is not older than ${USAGEMETER.version}: not replacing it.`;
    case "link": return `usagemeter ${where}: ~/.local/bin/usagemeter is a link or a folder; left as it is.`;
    case "unknown": return `Warning: usagemeter ${where}: ~/.local/bin/usagemeter reports no usagemeter version; left as it is.`;
    case "disconnected": return `Warning: usagemeter ${where}: skipped, the machine is not connected.`;
    case "removed": return `Removed usagemeter ${where}. Its store is kept.`;
    case "absent": return `usagemeter ${where}: nothing to remove.`;
    case "other": return `Left usagemeter ${where}: ${r.why}, not the one the pack put there.`;
    case "kept": return `Left usagemeter ${where}: ${r.why}.`;
    default: return `Warning: usagemeter ${where}: ${r.why ?? "failed"}.`;
  }
}
