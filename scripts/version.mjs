#!/usr/bin/env node
/**
 * Automagik Herdr's one version (A14), after Automagik's scripts/version.ts: the repository's
 * package.json and the pack's VERSION file (mods/spaces-agents/VERSION, which the release
 * tarball carries and update.mjs reads) both hold it. Releases are 0.N.P, tagged v0.N.P by
 * release.yml, numbers compared as numbers. Until the first release the repository carries
 * 0.0.0, which is never released (as Automagik carried 3.0.0); the first release is 0.1.0.
 *
 *   node scripts/version.mjs check          every field carries package.json's version; exit 1 when not
 *   node scripts/version.mjs set <version>  write it everywhere
 *   node scripts/version.mjs current        package.json's version
 *   node scripts/version.mjs next           the next release: a patch on the newest v0.N.P when everything
 *                                           shipping since it is a fix, else 0.(N+1).0; 0.1.0 first
 *   node scripts/version.mjs ships          yes when something since the newest release ships, else no
 *   node scripts/version.mjs last           the newest release tag (v0.N.P), or nothing
 *   node scripts/version.mjs tag-subject <version> <true|false>   the release tag's subject; true: a prerelease
 *   node scripts/version.mjs prerelease <tag>   true when the tag's subject marks a prerelease, else false
 *   node scripts/version.mjs plan <yes|no>  what release.yml does, given whether the newest tag's
 *                                           GitHub release exists: `cut`, `resume <version>` or `none`
 *
 * Shipping: every commit but those that ship nothing: `chore` (the release's own
 * `chore(release)` among them), `ci`, `docs`, `test`; Automagik's "anything new" gate plus `chore`.
 * A tag pushed by a run whose publish failed is resumed (packed and published) before anything new
 * is cut. Never edit a version
 * by hand: release.yml sets it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MAJOR = 0;
/** A release version: 0.N.P, N and P whole numbers of at most four digits, no leading zeros. */
export const VERSION = /^0\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;
/** A release tag: `v0.N.P`. */
export const RELEASE_TAG = /^v0\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;
/** Commit subjects that ship nothing: chores (the release's own commit too), CI, docs, tests. */
export const NOT_SHIPPING = /^(chore|ci|docs|test)(\([^)]*\))?!?: /;
/** A fix that breaks nothing: alone since the last release, it makes a patch. */
export const FIX = /^fix(\([^)]*\))?: /;

/** Every file that carries the version: JSON at `path`, or a text file holding only it. */
export const FIELDS = [
  { file: "package.json", path: ["version"] },
  { file: "mods/spaces-agents/VERSION" },
];

const readField = (root, { file, path }) => {
  const text = readFileSync(join(root, file), "utf8");
  if (!path) return text.trim();
  return path.reduce((node, key) => node?.[key], JSON.parse(text));
};

export const currentVersion = (root = ROOT) => readField(root, FIELDS[0]);

/** The fields that do not carry `version`, as `file:path = value`. */
export function drift(version, root = ROOT) {
  return FIELDS.flatMap((field) => {
    let value;
    try { value = readField(root, field); } catch (error) { value = `unreadable (${error.code ?? error.message})`; }
    return value === version ? [] : [`${field.file}${field.path ? `:${field.path.join(".")}` : ""} = ${String(value)}`];
  });
}

export function setVersion(version, root = ROOT) {
  if (!VERSION.test(version)) throw new Error(`not a version: ${version} (want ${MAJOR}.N.P)`);
  for (const field of FIELDS) {
    const file = join(root, field.file);
    if (!field.path) { writeFileSync(file, `${version}\n`); continue; }
    const json = JSON.parse(readFileSync(file, "utf8"));
    const parent = field.path.slice(0, -1).reduce((node, key) => node[key], json);
    parent[field.path.at(-1)] = version;
    writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  }
}

const parts = (tag) => RELEASE_TAG.exec(tag)?.slice(1).map(Number) ?? null;

/** The newest release tag in `tags` (`v0.N.P`, compared as numbers), or null; others are ignored. */
export function lastReleaseTag(tags) {
  let best = null;
  for (const tag of tags) {
    const p = parts(tag);
    if (!p) continue;
    const b = best && parts(best);
    if (!b || p[0] > b[0] || (p[0] === b[0] && p[1] > b[1])) best = tag;
  }
  return best;
}

/** The commit subjects in `subjects` that ship something. */
export const shipping = (subjects) => subjects.filter((s) => s.trim() !== "" && !NOT_SHIPPING.test(s));

/**
 * The release after the newest tag in `tags`, given the commit subjects since it: 0.1.0 when there
 * is no release yet; a patch when everything shipping is a fix; else the next minor.
 */
export function nextVersion(tags, subjects = []) {
  const last = lastReleaseTag(tags);
  if (!last) return `${MAJOR}.1.0`;
  const [minor, patch] = parts(last);
  const ships = shipping(subjects);
  if (ships.length > 0 && ships.every((s) => FIX.test(s))) return `${MAJOR}.${minor}.${patch + 1}`;
  return `${MAJOR}.${minor + 1}.0`;
}

/** A release tag's subject: the kind travels with the tag, so a run that resumes it publishes the same kind. */
export const tagSubject = (version, prerelease = false) => `Automagik Herdr ${version}${prerelease ? " (prerelease)" : ""}`;
export const isPrereleaseSubject = (subject) => / \(prerelease\)$/.test(String(subject ?? "").trim());

/**
 * What a release run does: `{ action: "resume", version }` when the newest tag `last` has no GitHub
 * release (`published` false: its run pushed the tag, then failed to publish), else
 * `{ action: "cut" }` when there is no release yet or something since `last` ships, else
 * `{ action: "none" }`. A resume cuts nothing new: the next push or dispatch does.
 */
export function planRelease({ last, published, subjects = [] }) {
  if (last && published === false) return { action: "resume", version: last.slice(1) };
  if (!last || shipping(subjects).length > 0) return { action: "cut" };
  return { action: "none" };
}

const git = (args, root) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
const tagsOf = (root) => git(["tag", "--list", `v${MAJOR}.*`], root).split("\n").filter(Boolean);
const subjectsSince = (tag, root) => (tag ? git(["log", "--no-merges", "--format=%s", `${tag}..HEAD`], root).split("\n").filter(Boolean) : []);

const invoked = (() => { try { return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (invoked) {
  const [command, arg] = process.argv.slice(2);
  if (command === "check") {
    const root = currentVersion();
    const problems = drift(root);
    if (!VERSION.test(root)) problems.unshift(`package.json:version = ${root} is not ${MAJOR}.N.P`);
    for (const problem of problems) console.error(`version: ${problem}, not ${root}`);
    if (problems.length > 0) process.exit(1);
    console.log(`version: ${root} everywhere`);
  } else if (command === "set" && arg) {
    setVersion(arg);
    console.log(`version: ${arg}`);
  } else if (command === "current") {
    console.log(currentVersion());
  } else if (command === "next") {
    const tags = tagsOf(ROOT);
    console.log(nextVersion(tags, subjectsSince(lastReleaseTag(tags), ROOT)));
  } else if (command === "ships") {
    const last = lastReleaseTag(tagsOf(ROOT));
    console.log(!last || shipping(subjectsSince(last, ROOT)).length > 0 ? "yes" : "no");
  } else if (command === "tag-subject" && arg && VERSION.test(arg)) {
    console.log(tagSubject(arg, process.argv[4] === "true"));
  } else if (command === "prerelease" && arg) {
    const subject = git(["tag", "--list", "--format=%(contents:subject)", arg], ROOT).trim();
    if (!subject) { console.error(`version: no annotated tag ${arg}`); process.exit(1); }
    console.log(isPrereleaseSubject(subject) ? "true" : "false");
  } else if (command === "last") {
    console.log(lastReleaseTag(tagsOf(ROOT)) ?? "");
  } else if (command === "plan" && (arg === "yes" || arg === "no")) {
    const last = lastReleaseTag(tagsOf(ROOT));
    const plan = planRelease({ last, published: arg === "yes", subjects: subjectsSince(last, ROOT) });
    console.log(plan.action === "resume" ? `resume ${plan.version}` : plan.action);
  } else {
    console.error("usage: node scripts/version.mjs check | set <version> | current | next | ships | last | plan <yes|no> | tag-subject <version> <true|false> | prerelease <tag>");
    process.exit(2);
  }
}
