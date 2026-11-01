#!/usr/bin/env node
// Installs this pack into a Herdr app home: every folder in mods/, the keys it needs, the layout
// once, and the catalog the mod manager reads.
//
// A live app home is someone's running window, not a build directory:
//   • the installer writes only the pack's own mod folders; any other mod it finds is left alone;
//   • a pack mod's live folder is MOVED ASIDE to <app home>/automagik-herdr/backup/<mod>-<stamp>
//     (a rename, never rm -rf), then a fresh copy is written and its private state is put back;
//   • private state is never touched: .state/, other dot paths, node_modules/, logs, error files,
//     and the files herdr-app writes itself (gpui-kit.d.ts, jsconfig.json);
//   • a hand-edited pack file, or a file the pack does not ship, refuses the run (exit 1) unless
//     --force; list it and it is moved aside with the folder rather than lost;
//   • a mod owned elsewhere is not this pack's: nothing here reads, writes, updates or restarts
//     it, and the run reports it as left alone.
//
//   node scripts/install.mjs --app-home /tmp/scratch     # always test in a scratch home first
//   node scripts/install.mjs --dry-run                   # say what would change, write nothing
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The pack publishes from `dev` (wish deliverable 4). This is the one place the published index URL
// is written: the installer drops it into data/mod-manager/catalog.json, the manager reads that
// first, and test/pack-installer.test.mjs keeps the manager's fallback equal to this string.
const PUBLISHED_CATALOG = "https://raw.githubusercontent.com/automagik-dev/automagik-herdr/dev/catalog/index.json";

// Strict arguments: an unknown flag, or a flag whose value is missing or is itself a flag, stops the
// run before anything is read or written. A typo must never fall through to the live app home.
const args = process.argv.slice(2);
const WITH_VALUE = new Set(["--app-home", "--catalog", "--layout-name", "--only"]);
const BARE = new Set(["--no-layout", "--force", "--dry-run", "-h", "--help"]);
const USAGE = `Install the automagik-herdr pack.

  --app-home <dir>      Herdr's app home (default $HERDR_APP_HOME or ~/.config/herdr-app)
  --catalog <url|path>  What the mod manager lists (default ${PUBLISHED_CATALOG})
  --layout-name <name>  The layout to ship when none of that name exists (default automagik)
  --no-layout           Never copy the layout
  --only <mod>          Install just this mod (repeatable) — a scoped live install
  --force               Replace files a person edited (the old folder is moved aside, not deleted)
  --dry-run             Print what would change; write nothing
  -h, --help            This text

Only this pack's mod folders are ever written; anything else in mods/ is left alone. Test with
--app-home pointing at a scratch directory, never at a live window.`;
const flags = new Set();
const vals = new Map();
const usage = (out) => out.write(USAGE);
const refuse = (message) => {
  process.stderr.write(`install.mjs: ${message}\n\n`);
  usage(process.stderr);
  process.exit(2);
};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (BARE.has(a)) { flags.add(a); continue; }
  if (!WITH_VALUE.has(a)) refuse(`unknown argument ${JSON.stringify(a)}`);
  const v = args[i + 1];
  if (v === undefined || v === "" || v.startsWith("-")) refuse(`${a} needs a value`);
  if (!vals.has(a)) vals.set(a, []);
  vals.get(a).push(v);
  i += 1;
}
const flag = (name) => flags.has(name);
const values = (name) => vals.get(name) ?? [];
const value = (name) => values(name).at(-1) ?? null;

if (flag("--help") || flag("-h")) {
  usage(process.stdout);
  process.exit(0);
}

const dry = flag("--dry-run");
const force = flag("--force");
const appHome = resolve(value("--app-home") ?? process.env.HERDR_APP_HOME ?? join(homedir(), ".config", "herdr-app"));
const catalog = value("--catalog") ?? PUBLISHED_CATALOG;
const layoutName = value("--layout-name") ?? "automagik";
const withLayout = !flag("--no-layout");
const only = new Set(values("--only"));

const STATE = join(appHome, "automagik-herdr");
const MANIFEST = join(STATE, "manifest.json");
const BACKUPS = join(STATE, "backup");

const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const posix = (p) => p.split(sep).join("/");
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

/** Every file under dir, relative and posix, or [] when it isn't there. */
function files(dir) {
  const out = [];
  const walk = (at) => {
    let entries;
    try {
      entries = readdirSync(at, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(posix(relative(dir, full)));
    }
  };
  walk(dir);
  return out.sort();
}

/** A mod's private state, or a file the app writes itself: never ours to copy, remove or judge. */
const privatePath = (rel) =>
  rel.startsWith(".")
  || rel.includes("/.")
  || rel === "node_modules" || rel.startsWith("node_modules/")
  || /^(gpui-kit\.d\.ts|jsconfig\.json)$/.test(rel)
  || /\.error$/.test(rel);

const readManifest = () => {
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    return { version: 1, mods: {} };
  }
};
const write = (path, data) => {
  if (dry) {
    console.log(`  would write ${path}`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
};

// ---- only the pack's own mods ----
const modsDir = join(ROOT, "mods");
const packAll = readdirSync(modsDir).filter((name) => existsSync(join(modsDir, name, "main.js"))).sort();
const packMods = packAll.filter((name) => !only.size || only.has(name));
if (!packMods.length) {
  console.error("no mods to install");
  process.exit(1);
}

const manifest = readManifest();
const liveModsDir = join(appHome, "mods");
const liveNames = existsSync(liveModsDir)
  ? readdirSync(liveModsDir).filter((name) => !name.startsWith(".")).sort()
  : [];
for (const name of liveNames) {
  // A pack mod this run simply did not select is not "foreign": say nothing about it.
  if (!packAll.includes(name)) console.log(`  left alone: mods/${name} (not this pack's)`);
}

const plan = [];
const blockers = [];
for (const name of packMods) {
  const from = join(modsDir, name);
  const to = join(liveModsDir, name);
  const packFiles = files(from);
  const liveFiles = files(to);
  const shippedBefore = manifest.mods?.[name]?.files ?? {};
  const unknown = liveFiles.filter((rel) => !packFiles.includes(rel) && !privatePath(rel) && !(rel in shippedBefore));
  const edited = liveFiles.filter((rel) => {
    if (!packFiles.includes(rel) || privatePath(rel)) return false;
    if (sha(join(to, rel)) === sha(join(from, rel))) return false;
    return shippedBefore[rel] !== sha(join(to, rel));
  });
  plan.push({ name, from, to, packFiles, liveFiles, unknown, edited });
  if ((unknown.length || edited.length) && !force) blockers.push({ name, unknown, edited });
}

if (blockers.length) {
  console.error("refusing to install — these folders hold work this installer did not write:");
  for (const b of blockers) {
    for (const rel of b.unknown) console.error(`  ${b.name}: has ${rel}, which this pack does not ship`);
    for (const rel of b.edited) console.error(`  ${b.name}: edited by hand: ${rel}`);
  }
  console.error("nothing was changed. With --force the folder is moved aside first (nothing is lost),");
  console.error("its private state is kept, and only the pack's own files are replaced.");
  process.exit(1);
}

// ---- preflight: nothing moves until every input is known good ----
// Both key files matter: the pack's is merged, and the app home's is the one mergeKeys() rewrites
// later, after the mods are already written. A malformed file must stop the run here instead.
const preflightKeys = (path, whose) => {
  if (!existsSync(path)) return;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
  } catch (e) {
    console.error(`refusing to install — ${whose} keys.json is unreadable: ${e.message}`);
    process.exit(1);
  }
};
preflightKeys(join(ROOT, "keys.json"), "the pack's");
preflightKeys(join(appHome, "keys.json"), "this app home's");
const absent = [];
for (const { name, from, packFiles } of plan) {
  for (const rel of packFiles) if (!statSync(join(from, rel), { throwIfNoEntry: false })?.isFile()) absent.push(`mods/${name}/${rel}`);
}
if (absent.length) {
  console.error("refusing to install — pack files listed but missing:");
  for (const rel of absent) console.error(`  ${rel}`);
  process.exit(1);
}

console.log(`pack → ${appHome}${dry ? " (dry run)" : ""}`);

for (const { name, from, to, packFiles, liveFiles } of plan) {
  const kept = liveFiles.filter((rel) => privatePath(rel));
  let aside = null;

  if (existsSync(to)) {
    aside = join(BACKUPS, `${name}-${stamp()}`);
    if (dry) {
      console.log(`  would move mods/${name} aside → ${posix(relative(appHome, aside))}`);
    } else {
      mkdirSync(dirname(aside), { recursive: true });
      renameSync(to, aside);            // a move, never a delete
      console.log(`  moved aside: ${posix(relative(appHome, aside))}`);
    }
  }

  for (const rel of packFiles) {
    if (dry) {
      console.log(`  would write mods/${name}/${rel}`);
      continue;
    }
    mkdirSync(dirname(join(to, rel)), { recursive: true });
    cpSync(join(from, rel), join(to, rel));
  }

  // Put back the mod's private state exactly where it was.
  if (!dry && aside) {
    let restored = 0;
    for (const rel of kept) {
      mkdirSync(dirname(join(to, rel)), { recursive: true });
      cpSync(join(aside, rel), join(to, rel));
      restored += 1;
    }
    if (restored) console.log(`  kept ${restored} private file(s) of mods/${name}`);
  }

  if (!dry) console.log(`  installed mods/${name}`);
}

// ---- keys: free ones only ----
function mergeKeys() {
  const theirsPath = join(ROOT, "keys.json");
  if (!existsSync(theirsPath)) return;
  const theirs = JSON.parse(readFileSync(theirsPath, "utf8"));
  const minePath = join(appHome, "keys.json");
  const mine = existsSync(minePath) ? JSON.parse(readFileSync(minePath, "utf8")) : {};
  const added = [];
  const kept = [];
  for (const [section, entries] of Object.entries(theirs)) {
    for (const [key, action] of Object.entries(entries ?? {})) {
      const current = mine[section]?.[key];
      if (current === undefined) {
        (mine[section] ??= {})[key] = action;
        added.push(`${key} → ${action} (${section})`);
      } else if (current !== action) {
        kept.push(`${key} stays ${current} (${section})`);
      }
    }
  }
  if (added.length) write(minePath, JSON.stringify(mine, null, 2) + "\n");
  for (const line of added) console.log(`  key + ${line}`);
  for (const line of kept) console.log(`  key = ${line}`);
}
mergeKeys();

// ---- the catalog the manager reads ----
write(join(appHome, "data", "mod-manager", "catalog.json"), JSON.stringify({ url: catalog }, null, 2) + "\n");
console.log(`  catalog: ${catalog}`);

// ---- one layout, shipped once ----
const layoutFrom = join(ROOT, "layouts", `${layoutName}.json`);
const layoutTo = join(appHome, "layouts", `${layoutName}.json`);
if (withLayout && existsSync(layoutFrom)) {
  if (existsSync(layoutTo)) console.log(`  layout kept: layouts/${layoutName}.json is already there`);
  else {
    write(layoutTo, readFileSync(layoutFrom));
    console.log(`  layout added: layouts/${layoutName}.json — switch when you want it: herdr-app do layout.switch --name ${layoutName}`);
  }
}

// ---- manifest: what this installer wrote, so the next run can tell its files from a person's ----
if (!dry) {
  const next = { version: 1, mods: { ...(manifest.mods ?? {}) } };
  for (const { name, from, packFiles } of plan) {
    next.mods[name] = { files: Object.fromEntries(packFiles.map((rel) => [rel, sha(join(from, rel))])), at: new Date().toISOString() };
  }
  write(MANIFEST, JSON.stringify(next, null, 2) + "\n");
}

// ---- the one proof that matters: the app loads each mod ----
if (!dry) {
  for (const name of packMods) {
    try {
      execFileSync("herdr-app", ["check", join(liveModsDir, name)], { stdio: "pipe" });
      console.log(`  check passed: ${name}`);
    } catch (error) {
      console.error(`  check FAILED: ${name}`);
      console.error(String(error.stdout ?? "").trim() || String(error.message ?? error));
      process.exitCode = 1;
    }
  }
}
