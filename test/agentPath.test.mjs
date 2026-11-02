// agentPath.mjs: the PATH an agent worker starts with when its `#!/usr/bin/env node` (or bun)
// interpreter isn't on the pane's PATH. Fake agents and fake runtimes in temp folders; no real
// codex, node install or Herdr is touched. The last test runs the CLI with the fake hc.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { besideDirs, envInterpreter, interpreterPath } from "../mods/spaces-agents/agentPath.mjs";
import { workerArgs } from "../mods/spaces-agents/workers.js";

const CLI = new URL("../mods/spaces-agents/bin/automagik-herdr.mjs", import.meta.url).pathname;
const FAKE_HC = new URL("./fake-hc.mjs", import.meta.url).pathname;
const exe = (path, text) => { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, text); chmodSync(path, 0o755); };
const runtime = (path, version) => exe(path, `#!/bin/sh\necho ${version}\n`);
const NODE_SCRIPT = "#!/usr/bin/env node\nconsole.log('hi');\n";

function scratch(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hb-agentpath-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const empty = join(root, "empty");
  mkdirSync(empty);
  // No nvm, no Homebrew, no ~/.bun unless a test makes one: the host's runtimes can't answer.
  const env = { HOME: join(root, "home"), NVM_DIR: join(root, "nvm"), AUTOMAGIK_HERDR_RUNTIME_DIRS: "" };
  return { root, empty, env };
}

/** npm's global layout: <prefix>/bin/codex -> ../lib/node_modules/@openai/codex/bin/codex.js, node beside. */
function npmPrefix(root, { node = "v22.22.0" } = {}) {
  const prefix = join(root, "nvm/versions/node", node);
  exe(join(prefix, "lib/node_modules/@openai/codex/bin/codex.js"), NODE_SCRIPT);
  mkdirSync(join(prefix, "bin"), { recursive: true });
  symlinkSync("../lib/node_modules/@openai/codex/bin/codex.js", join(prefix, "bin/codex"));
  runtime(join(prefix, "bin/node"), node);
  return prefix;
}

/** The PATH word workerArgs hands `/usr/bin/env`. */
const pathOf = (path) => {
  const args = workerArgs({ botId: "b-cccccccccc", branch: "feat/x", role: "dev", name: "x", cwd: "/w", parent: "t1",
    agent: "codex", model: null, effort: null, argv: ["codex"], task: "do it", template: null, path });
  const argv = args.slice(args.indexOf("--") + 1);
  assert.equal(argv[0], "/usr/bin/env");
  return argv[1].replace(/^PATH=/, "");
};

test("envInterpreter: the word env runs, past -S, other flags and VAR=x; null for anything else", () => {
  assert.equal(envInterpreter("#!/usr/bin/env node"), "node");
  assert.equal(envInterpreter("#! /usr/bin/env -S node --no-warnings"), "node");
  assert.equal(envInterpreter("#!/usr/bin/env NODE_OPTIONS=x bun"), "bun");
  assert.equal(envInterpreter("#!/usr/bin/env node\r"), "node", "a CRLF script's line loses its \\r");
  assert.equal(envInterpreter("#!/usr/bin/env -u NODE_OPTIONS node"), "node", "-u takes NAME as its argument");
  assert.equal(envInterpreter("#!/usr/bin/env -i PATH=/x -u FOO bun"), "bun");
  assert.equal(envInterpreter("#!/usr/bin/env -i node\r"), "node");
  assert.equal(envInterpreter("#!/bin/sh"), null);
  assert.equal(envInterpreter("#!/opt/homebrew/bin/node"), null);
  assert.equal(envInterpreter("\u007fELF\u0002"), null);
  assert.equal(envInterpreter(null), null);
});

test("besideDirs: every hop of the link chain, then npm's <prefix>/bin", (t) => {
  const s = scratch(t);
  const prefix = npmPrefix(s.root);
  const links = join(s.root, "links");
  mkdirSync(links);
  symlinkSync(join(prefix, "bin/codex"), join(links, "codex"));
  assert.deepEqual(besideDirs(join(links, "codex")), [links, join(prefix, "bin"), join(prefix, "lib/node_modules/@openai/codex/bin")]);
});

test("node already on the worker's PATH: PATH unchanged, nothing said", (t) => {
  const s = scratch(t);
  const prefix = npmPrefix(s.root);
  runtime(join(s.empty, "node"), "v18.0.0"); // any node env finds will do: env checks no version
  const path = `${join(prefix, "bin")}:${s.empty}`;
  const got = interpreterPath("codex", path, s.env);
  assert.deepEqual(got, { path, note: null });
  assert.equal(pathOf(got.path), path);
});

test("node missing, codex reached through a link to nvm's bin: nvm's bin goes first, nothing removed", (t) => {
  const s = scratch(t);
  const prefix = npmPrefix(s.root);
  const links = join(s.root, "links");
  mkdirSync(links);
  symlinkSync(join(prefix, "bin/codex"), join(links, "codex"));
  const path = `${links}:${s.empty}`;
  const got = interpreterPath("codex", path, s.env);
  assert.equal(got.path, `${join(prefix, "bin")}:${path}`);
  assert.equal(pathOf(got.path), `${join(prefix, "bin")}:${path}`);
  assert.equal(got.note, `codex runs under node, which isn't on the worker's PATH: ${join(prefix, "bin")} put first on it.`);
});

test("node missing and not beside the agent: run.sh's order, nvm's newest 22.7+ before Homebrew's", (t) => {
  const s = scratch(t);
  const agents = join(s.root, "agents");
  exe(join(agents, "codex"), NODE_SCRIPT);
  const nvm = (v) => runtime(join(s.env.NVM_DIR, "versions/node", v, "bin/node"), v);
  nvm("v22.6.0"); nvm("v24.1.0"); nvm("v22.10.0");
  const brew = join(s.root, "brew");
  runtime(join(brew, "node"), "v25.0.0");
  const env = { ...s.env, AUTOMAGIK_HERDR_RUNTIME_DIRS: brew };
  assert.equal(pathOf(interpreterPath("codex", agents, env).path), `${join(s.env.NVM_DIR, "versions/node/v24.1.0/bin")}:${agents}`);
  rmSync(s.env.NVM_DIR, { recursive: true });
  assert.equal(pathOf(interpreterPath("codex", agents, env).path), `${brew}:${agents}`);
  runtime(join(brew, "node"), "v22.6.0"); // too old: run.sh passes it over, and so does this
  const none = interpreterPath("codex", agents, env);
  assert.equal(none.path, agents);
  assert.match(none.note, /codex runs under node .* may fail with "env: node: No such file or directory"/);
});

test("bun: a #!/usr/bin/env bun agent gets ~/.bun/bin; bun alone never stands in for node", (t) => {
  const s = scratch(t);
  const agents = join(s.root, "agents");
  exe(join(agents, "omp"), "#!/usr/bin/env bun\n");
  exe(join(agents, "codex"), NODE_SCRIPT);
  runtime(join(s.env.HOME, ".bun/bin/bun"), "1.2.3");
  assert.equal(interpreterPath("omp", agents, s.env).path, `${join(s.env.HOME, ".bun/bin")}:${agents}`);
  assert.equal(interpreterPath("codex", agents, s.env).path, agents);
});

/** A fake runtime that leaves `<path>.ran` behind when it is run. */
const tattler = (path, version) => exe(path, `#!/bin/sh\n: > "${path}.ran"\necho ${version}\n`);

test("an unsafe folder or interpreter (world-writable) is neither run nor put on PATH", (t) => {
  const s = scratch(t);
  // codex and a node side by side in a 0777 folder, reached through a link in a safe PATH
  // folder: the node there is never run.
  const open = join(s.root, "open");
  exe(join(open, "codex"), NODE_SCRIPT);
  tattler(join(open, "node"), "v24.1.0");
  chmodSync(open, 0o777);
  const links = join(s.root, "links");
  mkdirSync(links);
  symlinkSync(join(open, "codex"), join(links, "codex"));
  // A 0777 node file in a safe nvm folder, and a 0777 Homebrew folder: passed over too.
  const nvmBin = join(s.env.NVM_DIR, "versions/node/v24.1.0/bin");
  tattler(join(nvmBin, "node"), "v24.1.0");
  chmodSync(join(nvmBin, "node"), 0o777);
  const brew = join(s.root, "brew");
  tattler(join(brew, "node"), "v24.1.0");
  chmodSync(brew, 0o777);
  const got = interpreterPath("codex", links, { ...s.env, AUTOMAGIK_HERDR_RUNTIME_DIRS: brew });
  assert.equal(got.path, links);
  assert.match(got.note, /may fail/);
  for (const p of [join(open, "node"), join(nvmBin, "node"), join(brew, "node")]) assert.equal(existsSync(`${p}.ran`), false, `${p} was run`);
  // The same folder made safe: its node is run and put first.
  chmodSync(open, 0o755);
  assert.equal(interpreterPath("codex", links, s.env).path, `${open}:${links}`);
  assert.equal(existsSync(join(open, "node.ran")), true);
});

test("relative folders are never run or put on PATH: PATH entries, NVM_DIR, AUTOMAGIK_HERDR_RUNTIME_DIRS", (t) => {
  const s = scratch(t);
  const was = process.cwd();
  process.chdir(s.root);
  t.after(() => process.chdir(was));
  exe(join(s.root, "rel/codex"), NODE_SCRIPT);
  tattler(join(s.root, "rel/node"), "v24.1.0");
  tattler(join(s.root, "relnvm/versions/node/v24.1.0/bin/node"), "v24.1.0");
  tattler(join(s.root, "relbrew/node"), "v24.1.0");
  const env = { ...s.env, NVM_DIR: "relnvm", AUTOMAGIK_HERDR_RUNTIME_DIRS: "relbrew:." };
  // The agent only on a relative PATH entry: the CLI can't tell what the worker's cwd finds.
  assert.deepEqual(interpreterPath("codex", "rel:.", env), { path: "rel:.", note: null });
  assert.deepEqual(interpreterPath("./rel/codex", s.empty, env), { path: s.empty, note: null });
  // The agent on an absolute entry, node only in relative folders: nothing put first.
  const agents = join(s.root, "agents");
  exe(join(agents, "codex"), NODE_SCRIPT);
  const got = interpreterPath("codex", `${agents}:rel:.`, env);
  assert.equal(got.path, `${agents}:rel:.`);
  assert.match(got.note, /may fail/);
  for (const p of ["rel/node", "relnvm/versions/node/v24.1.0/bin/node", "relbrew/node"]) {
    assert.equal(existsSync(join(s.root, `${p}.ran`)), false, `${p} was run`);
  }
});

test("a binary, a #!/bin/sh script or an agent not on PATH: PATH unchanged, nothing said", (t) => {
  const s = scratch(t);
  exe(join(s.empty, "claude"), "\u007fELF\u0002\u0001\u0001");
  exe(join(s.empty, "agy"), "#!/bin/sh\nexit 0\n");
  for (const program of ["claude", "agy", "codex"]) assert.deepEqual(interpreterPath(program, s.empty, s.env), { path: s.empty, note: null });
});

test("worker CLI: a codex the pane reaches without node starts under env PATH=<nvm bin>:<pane PATH>, and says so", (t) => {
  const s = scratch(t);
  const prefix = npmPrefix(s.root);
  const bin = join(s.root, "bin");
  mkdirSync(bin);
  symlinkSync(join(prefix, "bin/codex"), join(bin, "codex"));
  exe(join(bin, "hc"), `#!/bin/sh\nexec "${process.execPath}" "${FAKE_HC}" "$@"\n`);
  symlinkSync(execFileSync("/bin/sh", ["-c", "command -v git"], { encoding: "utf8" }).trim(), join(bin, "git"));
  const project = join(s.root, "proj");
  mkdirSync(join(project, ".herdr"), { recursive: true });
  const git = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: project, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("commit", "-q", "--allow-empty", "-m", "start");
  const look = { character: "star", colour: "blue" };
  writeFileSync(join(project, ".herdr/bots.json"), JSON.stringify({ version: 1, categories: [], bots: [
    { id: "b-aaaaaaaaaa", name: "Genie", kind: "main", look, role: "r", instructions: "i", agent: "claude" },
    { id: "b-cccccccccc", name: "Dev", kind: "member", look, role: "r", instructions: "i", agent: "claude", worker: { agent: "codex" } },
  ] }));
  const app = join(s.root, "app");
  mkdirSync(join(app, "mods/spaces-agents"), { recursive: true });
  const state = join(s.root, "hc.json");
  const log = join(s.root, "hc.log");
  writeFileSync(state, JSON.stringify({ next: 100, templates: [], terminals: [{ address: "t1", name: "t1", cwd: project, state: "live",
    parent: null, created_ms: 1, labels: { bot: "b-cccccccccc" }, foreground: { argv: ["claude"], cwd: project, pid: 4000 },
    status: { app: "claude-code", state: "idle" } }] }));
  writeFileSync(log, "");
  const path = `${bin}:${s.empty}`;
  const env = { ...s.env, PATH: path, HERDR_APP_HOME: app, HC_FAKE_STATE: state, HC_FAKE_LOG: log, HC_TERMINAL_ID: "t1" };
  const r = spawnSync(process.execPath, [CLI, "worker", "fix it", "--branch", "feat/x"], { cwd: project, env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const run = readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((c) => c[0] === "run");
  assert.deepEqual(run.slice(run.indexOf("--") + 1, run.indexOf("--") + 4), ["/usr/bin/env", `PATH=${join(prefix, "bin")}:${path}`, "codex"]);
  assert.match(r.stderr, new RegExp(`automagik-herdr: codex runs under node, which isn't on the worker's PATH: ${join(prefix, "bin")} put first on it\\.`));
});
