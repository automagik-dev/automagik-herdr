import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FIX, NOT_SHIPPING, VERSION, drift, lastReleaseTag, nextVersion, setVersion, shipping } from "../scripts/version.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/version.mjs", import.meta.url));

function scratchRepo(version = "0.0.0") {
  const root = mkdtempSync(join(tmpdir(), "version-test-"));
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "mods", "spaces-agents"), { recursive: true });
  copyFileSync(SCRIPT, join(root, "scripts", "version.mjs"));
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ name: "automagik-herdr", private: true, version, type: "module" }, null, 2)}\n`);
  writeFileSync(join(root, "mods", "spaces-agents", "VERSION"), `${version}\n`);
  return root;
}
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const cli = (root, ...args) => execFileSync(process.execPath, [join(root, "scripts", "version.mjs"), ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const commit = (root, subject) => {
  writeFileSync(join(root, "change.txt"), `${subject}\n${Math.random()}\n`);
  git(root, "add", "-A");
  git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", subject);
};

test("the repository carries one version, and 0.0.0 until the first release", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  assert.match(version, VERSION);
  assert.deepEqual(drift(version, root), []);
});

test("next: 0.1.0 first, a patch when everything shipping is a fix, else a minor", () => {
  assert.equal(nextVersion([]), "0.1.0");
  assert.equal(nextVersion(["v3.4.0", "nightly", "v0.01.0"]), "0.1.0", "other tags are ignored");
  assert.equal(nextVersion(["v0.1.0"], ["fix(cli): quote paths", "docs: typo", "chore(release): v0.1.0"]), "0.1.1");
  assert.equal(nextVersion(["v0.1.0", "v0.1.1"], ["fix: a", "fix(mod): b"]), "0.1.2");
  assert.equal(nextVersion(["v0.1.0"], ["fix: a", "feat(cli): update"]), "0.2.0");
  assert.equal(nextVersion(["v0.1.0"], ["fix!: drop the old flag"]), "0.2.0", "a breaking fix is not a patch");
  assert.equal(nextVersion(["v0.1.0"], ["refactor: split"]), "0.2.0");
  assert.equal(nextVersion(["v0.1.0"], []), "0.2.0");
  assert.equal(nextVersion(["v0.2.0", "v0.10.0", "v0.9.3"], ["feat: x"]), "0.11.0", "compared as numbers");
});

test("lastReleaseTag and the shipping rule", () => {
  assert.equal(lastReleaseTag(["v0.2.0", "v0.10.0", "v0.10.2", "v0.9.9"]), "v0.10.2");
  assert.equal(lastReleaseTag(["v1.0.0", "x"]), null);
  assert.deepEqual(shipping(["chore(release): v0.1.0", "ci: pin", "docs(readme): x", "test: y", "test!: z", "chore: deps", "fix: a"]),
    ["chore: deps", "fix: a"]);
  assert.ok(NOT_SHIPPING.test("ci(release): x"));
  assert.ok(!FIX.test("fix!: x"));
});

test("set writes every field, check finds drift, set refuses a non-version", () => {
  const root = scratchRepo();
  try {
    setVersion("0.3.1", root);
    assert.deepEqual(drift("0.3.1", root), []);
    assert.equal(readFileSync(join(root, "mods", "spaces-agents", "VERSION"), "utf8"), "0.3.1\n");
    assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).type, "module", "other keys kept");
    writeFileSync(join(root, "mods", "spaces-agents", "VERSION"), "0.3.0\n");
    assert.deepEqual(drift("0.3.1", root), ["mods/spaces-agents/VERSION = 0.3.0"]);
    assert.throws(() => setVersion("1.0.0", root), /not a version/);
    assert.throws(() => setVersion("0.01.0", root), /not a version/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the CLI over git: ships, next, set and check as release.yml runs them", () => {
  const root = scratchRepo();
  try {
    git(root, "init", "-q", "-b", "dev");
    commit(root, "feat: the pack");
    assert.equal(cli(root, "current"), "0.0.0");
    assert.equal(cli(root, "ships"), "yes", "no release yet");
    assert.equal(cli(root, "next"), "0.1.0");
    cli(root, "set", "0.1.0");
    assert.equal(cli(root, "check"), "version: 0.1.0 everywhere");
    git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "chore(release): v0.1.0");
    git(root, "-c", "user.name=t", "-c", "user.email=t@t", "tag", "-a", "v0.1.0", "-m", "Automagik Herdr 0.1.0");
    assert.equal(cli(root, "ships"), "no", "only the release commit since the tag");
    commit(root, "docs: readme");
    assert.equal(cli(root, "ships"), "no");
    commit(root, "fix(update): retry");
    assert.equal(cli(root, "ships"), "yes");
    assert.equal(cli(root, "next"), "0.1.1");
    commit(root, "feat(cli): update --check");
    assert.equal(cli(root, "next"), "0.2.0");
    writeFileSync(join(root, "mods", "spaces-agents", "VERSION"), "0.0.9\n");
    assert.throws(() => cli(root, "check"), /Command failed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
