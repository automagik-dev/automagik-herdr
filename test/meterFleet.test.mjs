// usagemeter on every linked machine (meterFleet.js, `automagik-herdr meter`, the sidebar's sync
// fan-out). The linked machines are a fake hc's (test/fake-hc.mjs): `lin` (Linux x86_64,
// connected) and `off` (Linux aarch64, disconnected), each a scratch home folder; the release is a
// file:// folder. The install script itself runs for real (sh, curl on file://, sha256). Nothing
// here reaches a real machine, a real hc or the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { METER_RELEASES, OPT_IN, assetFor, decodeExec, hcExecArgs, linkedMachines, meterPins, meterReleases, meterScope, recordAfter, releaseBase } from "../mods/am-sidebar/meterFleet.js";
import { METER_EVERY_MS, METER_EXEC_LIMIT_MS, METER_KEY, SYNC, syncMeter, syncTargets } from "../mods/am-sidebar/meter.js";
import { USAGEMETER, formatMarker, parseMarker } from "../mods/am-sidebar/release.js";
import { meterAfterUpdate } from "../mods/am-sidebar/bin/automagik-herdr.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLI = join(ROOT, "mods", "am-sidebar", "bin", "automagik-herdr.mjs");
const FAKE_HC = join(ROOT, "test", "fake-hc.mjs");
const V = USAGEMETER.version;
const exe = (path, text) => { writeFileSync(path, text); chmodSync(path, 0o755); };
const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** A scratch world: a fake hc with two linked machines, an install record, the pinned release. */
function fleet(t, { sums, pin, marker = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "am-fleet-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  mkdirSync(bin);
  exe(join(bin, "hc"), `#!/bin/sh\nexec "${process.execPath}" "${FAKE_HC}" "$@"\n`);
  const home = join(root, "home"), app = join(root, "app"), mods = join(app, "mods");
  mkdirSync(home, { recursive: true });
  mkdirSync(join(mods, "am-sidebar"), { recursive: true });
  mkdirSync(join(app, "automagik-herdr"), { recursive: true });
  const markPath = join(app, "automagik-herdr", "installed-by-install.sh");
  if (marker) writeFileSync(markPath, formatMarker({ version: "9.9.0", mods: ["am-sidebar"], layout: "added" }));
  // The release: each asset a script answering `usagemeter <V>`, and SHA256SUMS.
  const dir = join(root, "release", "usagemeter", "download", `v${V}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SHA256SUMS"), Object.values(USAGEMETER.assets).map((name) => {
    exe(join(dir, name), `#!/bin/sh\n[ "$1" = --version ] && echo "usagemeter ${V}"\nexit 0\n`);
    return `${sums ?? sha(join(dir, name))}  ${name}\n`;
  }).join(""));
  // The fakes are not the real builds: the pin is theirs (a file:// release's test hook), or `pin`.
  const pinFile = join(root, "meter-pin");
  writeFileSync(pinFile, Object.values(USAGEMETER.assets).map((name) => `${pin ?? sha(join(dir, name))}  ${name}\n`).join(""));
  // Each machine: a home, and a curl that logs every file:// URL (the downloads) before the real one.
  const curlLog = join(root, "curl.log");
  writeFileSync(curlLog, "");
  const machine = (name, state, uname) => {
    const mhome = join(root, `m-${name}`), path = join(root, `m-${name}-bin`);
    mkdirSync(mhome, { recursive: true });
    mkdirSync(path, { recursive: true });
    exe(join(path, "curl"), `#!/bin/sh\nfor a; do case $a in file://*) echo "${name} $a" >> "${curlLog}" ;; esac; done\nexec /usr/bin/curl "$@"\n`);
    return { name, state, uname, home: mhome, path };
  };
  const statePath = join(root, "hc.json"), logPath = join(root, "hc.log");
  writeFileSync(statePath, JSON.stringify({ terminals: [], next: 100, machines: [machine("lin", "connected", "Linux x86_64"), machine("off", "disconnected", "Linux aarch64")] }));
  writeFileSync(logPath, "");
  const env = {
    PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: home, HERDR_APP_HOME: app, TMPDIR: root,
    HC_FAKE_STATE: statePath, HC_FAKE_LOG: logPath, AUTOMAGIK_HERDR_RELEASE_URL: `file://${root}/release`, AUTOMAGIK_HERDR_METER_PIN: pinFile,
  };
  const cli = (...args) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { env, encoding: "utf8" });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  const meterOf = (name) => join(root, `m-${name}`, ".local", "bin", "usagemeter");
  const says = (name) => spawnSync(meterOf(name), ["--version"], { encoding: "utf8" }).stdout.trim();
  const plant = (name, version) => { mkdirSync(dirname(meterOf(name)), { recursive: true }); exe(meterOf(name), `#!/bin/sh\necho "usagemeter ${version}"\n`); };
  const downloads = () => readFileSync(curlLog, "utf8").split("\n").filter(Boolean);
  const execs = () => readFileSync(logPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((a) => a[0] === "exec");
  const mark = () => parseMarker(readFileSync(markPath, "utf8"));
  const leftovers = (name) => (existsSync(dirname(meterOf(name))) ? readdirSync(dirname(meterOf(name))).filter((n) => n.startsWith(".usagemeter")) : []);
  return { root, home, mods, dir, cli, meterOf, says, plant, downloads, execs, mark, leftovers, markPath };
}

// ---- the pure parts ----

test("uname -sm picks the pinned asset (Pocket Link's aliases too); anything else has no build", () => {
  assert.equal(assetFor("Linux x86_64\n"), "usagemeter-linux-x86_64");
  assert.equal(assetFor("Linux amd64"), "usagemeter-linux-x86_64");
  assert.equal(assetFor("Linux aarch64"), "usagemeter-linux-aarch64");
  assert.equal(assetFor("Linux arm64"), "usagemeter-linux-aarch64");
  assert.equal(assetFor("Darwin arm64"), "usagemeter-darwin-arm64");
  assert.equal(assetFor("Darwin x86_64"), "usagemeter-darwin-x86_64");
  assert.equal(assetFor("FreeBSD amd64"), null);
  assert.equal(assetFor(""), null);
  assert.equal(releaseBase(), `https://github.com/automagik-dev/usagemeter/releases/download/v${V}`);
});

test("the release is the pinned GitHub one; only a file:// test folder replaces it", () => {
  assert.equal(meterReleases({}), METER_RELEASES);
  assert.equal(meterReleases({ AUTOMAGIK_HERDR_RELEASE_URL: "file:///tmp/rel/" }), "file:///tmp/rel/usagemeter");
  assert.equal(meterReleases({ AUTOMAGIK_HERDR_RELEASE_URL: "https://evil.example/x" }), METER_RELEASES);
  assert.equal(meterReleases({ AUTOMAGIK_HERDR_RELEASE_URL: "file:///tmp/../etc" }), METER_RELEASES);
});

test("the pin is release.js's sha256 per asset; only a file:// test release may bring its own", () => {
  assert.deepEqual(Object.keys(USAGEMETER.sha256).sort(), Object.values(USAGEMETER.assets).sort());
  for (const h of Object.values(USAGEMETER.sha256)) assert.match(h, /^[0-9a-f]{64}$/);
  const lines = `${"b".repeat(64)}  usagemeter-linux-x86_64\n`;
  assert.deepEqual(meterPins({}), USAGEMETER.sha256);
  assert.deepEqual(meterPins({ AUTOMAGIK_HERDR_METER_PIN: "/x" }, () => lines), USAGEMETER.sha256, "a GitHub release ignores the hook");
  assert.deepEqual(meterPins({ AUTOMAGIK_HERDR_RELEASE_URL: "https://evil.example/x", AUTOMAGIK_HERDR_METER_PIN: "/x" }, () => lines), USAGEMETER.sha256);
  assert.deepEqual(meterPins({ AUTOMAGIK_HERDR_RELEASE_URL: "file:///tmp/rel", AUTOMAGIK_HERDR_METER_PIN: "/x" }, () => lines), { "usagemeter-linux-x86_64": "b".repeat(64) });
});

test("linked machines: temporary ones and names the record can't hold are left out", () => {
  const json = JSON.stringify({ machines: [
    { name: "lin", state: "connected" }, { name: "off", state: "disconnected" },
    { name: "tmp", state: "connected", temporary: true }, { name: "a b,c", state: "connected" }, { state: "connected" },
  ] });
  assert.deepEqual(linkedMachines(json), [{ name: "lin", connected: true }, { name: "off", connected: false }]);
  assert.deepEqual(linkedMachines("not json"), []);
  assert.deepEqual(hcExecArgs("lin", ["uname", "-sm"], 20), ["exec", "--json", "--timeout", "20", "--on", "lin", "--", "uname", "-sm"]);
});

test("hc exec --json is decoded: base64 output, a timeout or no JSON is a failure", () => {
  const b = (s) => Buffer.from(s).toString("base64");
  assert.deepEqual(decodeExec({ code: 0, stdout: JSON.stringify({ code: 3, stdout: b("x\n"), stderr: b("bad"), timed_out: false }) }, 10), { code: 3, stdout: "x\n", stderr: "bad" });
  assert.deepEqual(decodeExec({ code: 0, stdout: JSON.stringify({ code: null, timed_out: true }) }, 10), { code: -1, stdout: "", stderr: "timed out after 10 s" });
  assert.equal(decodeExec({ code: 1, stdout: "", stderr: "hc: lin is not connected\n" }, 10).stderr, "hc: lin is not connected");
});

test("the record: usagemeter-machines and usagemeter-scope round-trip; junk is dropped; recordAfter", () => {
  const base = { version: "1.0.0", mods: ["am-sidebar"], layout: "added" };
  const text = formatMarker({ ...base, usagemeter: V, usagemeterOn: { lin: V, "g9.b": "0.2.0" }, usagemeterScope: "local" });
  assert.match(text, new RegExp(`\nusagemeter-machines=lin:${V.replace(/\./g, "\\.")},g9\\.b:0\\.2\\.0\nusagemeter-scope=local\n$`));
  const back = parseMarker(text);
  assert.deepEqual(back.usagemeterOn, { lin: V, "g9.b": "0.2.0" });
  assert.equal(back.usagemeterScope, "local");
  assert.equal(formatMarker(back), text);
  assert.deepEqual(parseMarker(`${formatMarker(base)}usagemeter-machines=../x:1.0.0,ok:junk,ok2:1.2.3\nusagemeter-scope=everywhere\n`),
    { ...parseMarker(formatMarker(base)), usagemeterOn: { ok2: "1.2.3" }, usagemeterScope: null });
  assert.doesNotMatch(formatMarker(base), /usagemeter/);
  assert.deepEqual(recordAfter({ a: "0.2.0", b: V, c: V }, [
    { machine: "a", status: "installed", version: V }, { machine: "b", status: "newer", version: "9.0.0" },
    { machine: "c", status: "failed" }, { machine: null, status: "installed", version: V },
  ]), { a: V, c: V });
});

// ---- automagik-herdr meter install / uninstall ----

test("meter install --linked: the connected machine gets the hash-checked binary; the other is a warning", (t) => {
  const s = fleet(t);
  const r = s.cli("meter", "install", "--linked");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, new RegExp(`usagemeter ${V.replace(/\./g, "\\.")} on lin: installed \\(checksum ok\\)\\.`));
  assert.match(r.out, /Warning: usagemeter on off: skipped, the machine is not connected\./);
  assert.equal(s.says("lin"), `usagemeter ${V}`);
  assert.equal(lstatSync(s.meterOf("lin")).mode & 0o777, 0o755);
  assert.equal(sha(s.meterOf("lin")), sha(join(s.dir, "usagemeter-linux-x86_64")));
  assert.equal(existsSync(s.meterOf("off")), false);
  assert.deepEqual(s.leftovers("lin"), []);
  // The machine downloaded SHA256SUMS and its own asset, from the pinned version's folder.
  assert.deepEqual(s.downloads().map((l) => l.replace(/ file:.*\/download\//, " ")), [`lin v${V}/SHA256SUMS`, `lin v${V}/usagemeter-linux-x86_64`]);
  // Only lin was asked (never the disconnected one), and nothing ran on this computer.
  assert.deepEqual([...new Set(s.execs().map((a) => a[a.indexOf("--on") + 1]))], ["lin"]);
  assert.equal(existsSync(join(s.home, ".local", "bin", "usagemeter")), false);
  assert.deepEqual(s.mark().usagemeterOn, { lin: V });
});

test("meter install: already the pinned version is skipped with no download", (t) => {
  const s = fleet(t);
  assert.equal(s.cli("meter", "install", "--linked").code, 0);
  const before = s.downloads().length, kept = sha(s.meterOf("lin"));
  const again = s.cli("meter", "install", "--machine", "lin");
  assert.equal(again.code, 0, again.err);
  assert.match(again.out, new RegExp(`usagemeter ${V.replace(/\./g, "\\.")} on lin: already installed\\.`));
  assert.equal(s.downloads().length, before);
  assert.equal(sha(s.meterOf("lin")), kept);
  assert.deepEqual(s.mark().usagemeterOn, { lin: V });
});

test("meter install: a hash mismatch installs nothing, names the machine, and the command still succeeds", (t) => {
  const s = fleet(t, { sums: "0".repeat(64) });
  const r = s.cli("meter", "install", "--linked");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Warning: usagemeter on lin: usagemeter-linux-x86_64 does not match SHA256SUMS \(sha256 [0-9a-f]{64}, expected 0{64}\): nothing was installed\./);
  assert.equal(existsSync(s.meterOf("lin")), false);
  assert.deepEqual(s.leftovers("lin"), []);
  assert.deepEqual(s.mark().usagemeterOn, {});
  // Asked for that machine by name, the failure is the exit code.
  const one = s.cli("meter", "install", "--machine", "lin");
  assert.equal(one.code, 1);
  assert.match(one.err, /usagemeter on lin: .*does not match SHA256SUMS/);
});

test("meter install: SHA256SUMS agrees but the pinned sha256 does not: nothing installed, a warning", (t) => {
  const s = fleet(t, { pin: "c".repeat(64) });
  const r = s.cli("meter", "install", "--linked");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Warning: usagemeter on lin: usagemeter-linux-x86_64 is not the build the pack pins \(sha256 [0-9a-f]{64}, pinned c{64}\): nothing was installed\./);
  assert.equal(existsSync(s.meterOf("lin")), false);
  assert.deepEqual(s.leftovers("lin"), []);
  assert.deepEqual(s.mark().usagemeterOn, {});
});

test("meter install: never a downgrade (a newer or a dev build stays); an older v0.2.0 is upgraded", (t) => {
  const s = fleet(t);
  s.plant("lin", "0.10.0");
  const kept = sha(s.meterOf("lin"));
  const r = s.cli("meter", "install", "--linked");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, new RegExp(`usagemeter 0\\.10\\.0 on lin is not older than ${V.replace(/\./g, "\\.")}: not replacing it\\.`));
  assert.equal(sha(s.meterOf("lin")), kept);
  assert.deepEqual(s.downloads(), []);
  assert.deepEqual(s.mark().usagemeterOn, {});
  s.plant("lin", `${V}-dev`);
  assert.match(s.cli("meter", "install", "--linked").out, /on lin is not older than/);
  assert.deepEqual(s.downloads(), []);
  // The last pin's v0.2.0 is older: replaced, and recorded as the pack's.
  s.plant("lin", "0.2.0");
  const up = s.cli("meter", "install", "--linked");
  assert.match(up.out, /on lin: installed \(checksum ok\)/);
  assert.equal(s.says("lin"), `usagemeter ${V}`);
  assert.deepEqual(s.mark().usagemeterOn, { lin: V });
});

test("meter install --machine: a disconnected machine exits 1, an unknown one 2; flags are exclusive", (t) => {
  const s = fleet(t);
  const off = s.cli("meter", "install", "--machine", "off");
  assert.equal(off.code, 1);
  assert.match(off.err, /usagemeter on off: skipped, the machine is not connected/);
  assert.equal(s.cli("meter", "install", "--machine", "nope").code, 2);
  assert.equal(s.cli("meter", "install", "--linked", "--local").code, 2);
  assert.equal(s.cli("meter", "frobnicate").code, 2);
  assert.deepEqual(s.execs(), []);
});

test("meter install --local: this computer only (update's path), recorded, no machine asked", (t) => {
  const s = fleet(t);
  const r = s.cli("meter", "install", "--local");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, new RegExp(`usagemeter ${V.replace(/\./g, "\\.")} on this computer: installed \\(checksum ok\\)\\.`));
  const here = join(s.home, ".local", "bin", "usagemeter");
  assert.equal(spawnSync(here, ["--version"], { encoding: "utf8" }).stdout.trim(), `usagemeter ${V}`);
  assert.equal(s.mark().usagemeter, V);
  assert.deepEqual(s.execs(), []);
  // The last pin's v0.2.0 here is upgraded the same way.
  writeFileSync(here, "#!/bin/sh\necho 'usagemeter 0.2.0'\n");
  assert.match(s.cli("meter", "install", "--local").out, /on this computer: installed/);
  assert.equal(spawnSync(here, ["--version"], { encoding: "utf8" }).stdout.trim(), `usagemeter ${V}`);
});

test("meter install with no hc: this computer only, the machines a note", (t) => {
  // The CLI also looks beside node for hc: a real one there would be found, so the case can't be made.
  if (existsSync(join(dirname(process.execPath), "hc"))) { t.skip("an hc sits beside node"); return; }
  const s = fleet(t);
  rmSync(join(s.root, "bin", "hc"));
  const r = s.cli("meter", "install", "--linked");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /usagemeter on linked machines: skipped \(hc \(herdr-core\) is not on PATH\)\./);
});

test("meter uninstall: only where the record says the pack put it, and only that version", (t) => {
  const s = fleet(t);
  assert.equal(s.cli("meter", "install", "--linked").code, 0);
  const u = s.cli("meter", "uninstall");
  assert.equal(u.code, 0, u.err);
  assert.match(u.out, /Removed usagemeter on lin\. Its store is kept\./);
  assert.equal(existsSync(s.meterOf("lin")), false);
  assert.deepEqual(s.mark().usagemeterOn, {});
  // Not recorded (the person's own on lin): never asked, never removed.
  s.plant("lin", V);
  const none = s.cli("meter", "uninstall");
  assert.equal(none.code, 0, none.err);
  assert.equal(s.says("lin"), `usagemeter ${V}`);
  // Recorded, then replaced by a newer one: left. Recorded on a disconnected machine: left, kept.
  writeFileSync(s.markPath, formatMarker({ ...s.mark(), usagemeterOn: { lin: "0.2.0", off: V } }));
  const left = s.cli("meter", "uninstall");
  assert.match(left.out, new RegExp(`Left usagemeter on lin: it is usagemeter ${V.replace(/\./g, "\\.")}, not the one the pack put there\\.`));
  assert.match(left.out, /Left usagemeter on off: the machine is not connected\./);
  assert.equal(s.says("lin"), `usagemeter ${V}`);
  assert.deepEqual(s.mark().usagemeterOn, { off: V });
  // Pocket Link beside the pack: every machine left, none asked.
  writeFileSync(s.markPath, formatMarker({ ...s.mark(), usagemeterOn: { lin: V } }));
  mkdirSync(join(s.mods, "pocket-link"));
  const before = s.execs().length;
  assert.match(s.cli("meter", "uninstall").out, /Left usagemeter on lin: Pocket Link .* runs it too\./);
  assert.equal(s.execs().length, before);
  assert.equal(s.says("lin"), `usagemeter ${V}`);
});

test("an old opt-out (no scope line, no usagemeter= line): update installs nowhere and says how to opt in", async (t) => {
  // What dev's install.sh --no-usagemeter left: a record with no usagemeter line at all.
  const s = fleet(t);
  assert.equal(meterScope(s.mark()), null);
  const calls = [];
  const io = { modsDir: s.mods, meter: async (args) => { calls.push(args); return { code: 0, stdout: '{"results":[],"notes":[]}' }; } };
  const r = await meterAfterUpdate(io);
  assert.deepEqual(r, { lines: [OPT_IN], results: [] });
  assert.match(OPT_IN, /automagik-herdr meter install$/);
  assert.deepEqual(calls, [], "nothing ran, here or on a machine");
  // The sidebar's sync stays on this computer too.
  assert.deepEqual(syncTargets([{ name: "lin", state: "connected" }], meterScope(s.mark())), []);
  // A record that shows the pack installed it (here or on a machine) is a yes: everywhere.
  assert.equal(meterScope({ ...s.mark(), usagemeter: "0.2.0" }), "all");
  assert.equal(meterScope({ ...s.mark(), usagemeterOn: { lin: V } }), "all");
  assert.equal(meterScope({ ...s.mark(), usagemeter: V, usagemeterScope: "none" }), "none");
  assert.equal(meterScope(null), null);
  // An explicit meter install is the yes: it records all (or local with --local), and update follows.
  assert.equal(s.cli("meter", "install", "--local").code, 0);
  assert.equal(s.mark().usagemeterScope, "local");
  assert.equal(s.cli("meter", "install").code, 0);
  assert.equal(s.mark().usagemeterScope, "all");
  assert.equal(s.cli("meter", "install", "--local").code, 0);
  assert.equal(s.mark().usagemeterScope, "all", "--local never narrows an all");
  await meterAfterUpdate(io);
  assert.deepEqual(calls, [["meter", "install", "--json"]]);
});

test("update runs the new pack's meter install, as the recorded scope says", async (t) => {
  const s = fleet(t);
  writeFileSync(s.markPath, formatMarker({ ...s.mark(), usagemeterScope: "all" }));
  const calls = [];
  const io = { modsDir: s.mods, meter: async (args) => { calls.push(args); return { code: 0, stdout: JSON.stringify({ results: [{ machine: "lin", status: "installed", version: V }], notes: [] }) }; } };
  assert.deepEqual((await meterAfterUpdate(io)).lines, [`usagemeter ${V} on lin: installed (checksum ok).`]);
  writeFileSync(s.markPath, formatMarker({ ...s.mark(), usagemeterScope: "local" }));
  await meterAfterUpdate(io);
  writeFileSync(s.markPath, formatMarker({ ...s.mark(), usagemeterScope: "none" }));
  assert.deepEqual((await meterAfterUpdate(io)).lines, ["usagemeter: skipped (install.sh --no-usagemeter)."]);
  assert.deepEqual(calls, [["meter", "install", "--json"], ["meter", "install", "--json", "--local"]]);
  writeFileSync(s.markPath, formatMarker({ ...s.mark(), usagemeterScope: "all" }));
  // A pack whose CLI can't answer: one warning, never a failed update.
  const bad = await meterAfterUpdate({ modsDir: s.mods, meter: async () => ({ code: 1, stdout: "", stderr: "boom\n" }) });
  assert.match(bad.lines[0], /^Warning: usagemeter was not checked: boom\./);
  // Without an injected runner, a test's modsDir never spawns anything.
  assert.deepEqual(await meterAfterUpdate({ modsDir: s.mods }), { lines: [], results: [] });
});

// ---- the sidebar's sync fan-out (meter.js) ----

test("sync fan-out: this computer, then each connected linked machine in turn; failures are silent", async () => {
  const machines = [{ name: "lin", state: "connected" }, { name: "off", state: "disconnected" }, { name: "tmp", state: "connected", temporary: true }];
  assert.deepEqual(syncTargets(machines, "all"), ["lin"]);
  assert.deepEqual(syncTargets(machines), [], "nobody asked: this computer only");
  assert.deepEqual(syncTargets(machines, "local"), []);
  assert.deepEqual(syncTargets(machines, "none"), []);
  const calls = [];
  const exec = async (bin, args, opts) => { calls.push([bin, args, opts?.on ?? null]); if (opts?.on === "g9") throw new Error("unreachable"); return { code: 0 }; };
  const state = {};
  const r = await syncMeter({ exec, bin: "/h/.local/bin/usagemeter", state, machines: ["lin", "g9"] });
  assert.deepEqual(calls, [["/h/.local/bin/usagemeter", ["sync"], null], ["sh", ["-c", SYNC], "lin"], ["sh", ["-c", SYNC], "g9"]]);
  assert.deepEqual(r.on, { lin: 0, g9: null });
  assert.equal(r.ran, true);
  assert.equal(state.busy, false);
  // A missing binary here still syncs the machines; no machines: the run is as before.
  const missing = await syncMeter({ exec: async (bin, args, o) => { if (!o?.on) throw new Error("ENOENT"); return { code: 0 }; }, bin: "/x", machines: ["lin"] });
  assert.equal(missing.why, "missing");
  assert.deepEqual(missing.on, { lin: 0 });
  assert.equal("on" in await syncMeter({ exec: async () => ({ code: 0 }), bin: "/x" }), false);
});

test("a machine that hangs during sync: left at the 30 s limit, the run goes on and ends, the next run is due", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  assert.equal(METER_EXEC_LIMIT_MS, 30_000);
  const store = new Map();
  let clock = 1_000_000;
  const calls = [];
  // `hang` never answers (its sync is stuck); `lin` answers at once.
  const exec = (bin, args, opts) => { calls.push(opts?.on ?? "here"); return opts?.on === "hang" ? new Promise(() => {}) : Promise.resolve({ code: 0 }); };
  const state = {};
  const run = () => syncMeter({ exec, bin: "/h/usagemeter", now: () => clock, get: (k) => store.get(k) ?? null, set: (k, v) => store.set(k, v), state, machines: ["hang", "lin"] });
  let done = null;
  const first = run().then((r) => { done = r; });
  for (let i = 0; i < 5; i += 1) await new Promise(setImmediate);
  assert.deepEqual(calls, ["here", "hang"], "stuck on hang");
  assert.equal(done, null);
  t.mock.timers.tick(METER_EXEC_LIMIT_MS - 1);
  for (let i = 0; i < 5; i += 1) await new Promise(setImmediate);
  assert.equal(done, null, "not before the limit");
  t.mock.timers.tick(1);
  await first;
  assert.deepEqual(calls, ["here", "hang", "lin"], "the run moved on to the next machine");
  assert.deepEqual(done.on, { hang: "timed out", lin: 0 });
  assert.equal(done.ran, true);
  assert.equal(done.wait, METER_EVERY_MS, "the next look is scheduled as usual");
  assert.equal(state.busy, false, "the run is over: the next one may start");
  assert.equal(store.get(METER_KEY), 1_000_000);
  // The next run, when it is due, starts again from this computer.
  clock += METER_EVERY_MS;
  const again = run();
  for (let i = 0; i < 5; i += 1) await new Promise(setImmediate);
  t.mock.timers.tick(METER_EXEC_LIMIT_MS);
  assert.equal((await again).ran, true);
  assert.deepEqual(calls.slice(3), ["here", "hang", "lin"]);
});

test("SYNC on a machine: no binary is silent (exit 0); one there runs `sync`", (t) => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "am-sync-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const run = () => spawnSync("sh", ["-c", SYNC], { env: { HOME: home, PATH: "/usr/bin:/bin" }, encoding: "utf8" });
  assert.equal(run().status, 0);
  mkdirSync(join(home, ".local", "bin"), { recursive: true });
  exe(join(home, ".local", "bin", "usagemeter"), `#!/bin/sh\necho "ran $*"\n`);
  assert.equal(run().stdout, "ran sync\n");
});
