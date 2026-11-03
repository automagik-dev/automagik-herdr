// Model detection (A12): the model a running agent uses, read from real foreground argv
// shapes seen on this host with `hc get <t> --json`, its configured default, the pin list
// and the flags Start passes.
import { test } from "node:test";
import assert from "node:assert/strict";

import { AGENTS, LEGACY_AGENTS, agentArgv, agentKeyOfArgv, configPaths, defaultModel, defaultModelFrom, detectModel, knownModels, knownModelsFrom, modelArgs, resolveAgent, shownModel, withOverrides } from "../mods/am-sidebar/models.js";

const files = (map) => ({ home: "/h", read: (p) => map[p] ?? null });

test("claude: --model with a value, after other flags (t1bw's foreground argv)", () => {
  assert.equal(detectModel(["claude", "--dangerously-skip-permissions", "--model", "claude-opus-5-5"], "claude"), "claude-opus-5-5");
  assert.equal(detectModel(["claude", "--model=claude-sonnet-5-5"], "claude"), "claude-sonnet-5-5");
  assert.equal(detectModel(["/Users/x/.local/bin/claude", "--model", "opus", "--effort", "high"], "claude"), "opus");
});

test("claude: no model flag, a resumed session, --fallback-model is not the model", () => {
  assert.equal(detectModel(["claude", "--resume", "de3aecdb-cb4b-4e5c-a320-38724f4a89a4", "--dangerously-skip-permissions"], "claude"), null);
  assert.equal(detectModel(["claude", "--fallback-model", "sonnet"], "claude"), null);
  assert.equal(detectModel(["claude", "--model"], "claude"), null);
});

test("codex: -m from the vendored binary path; -c model_* settings are not the model", () => {
  const argv = ["/n/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex",
    "--no-daemon", "--dangerously-bypass-approvals-and-sandbox", "-m", "gpt-6.1-sol", "-c", "model_reasoning_effort=high"];
  assert.equal(detectModel(argv, "codex"), "gpt-6.1-sol");
  assert.equal(detectModel(["codex", "-c", "model_provider=juice", "-c", "model_reasoning_effort=high"], "codex"), null);
  assert.equal(detectModel(["codex", "-c", 'model="o3"'], "codex"), "o3");
  assert.equal(detectModel(["codex", "--config", "model=gpt-6-astra"], "codex"), "gpt-6-astra");
  assert.equal(detectModel(["codex", "--model", "gpt-6-luna"], "codex"), "gpt-6-luna");
  assert.equal(detectModel(["codex", "-m", "a", "-m", "b"], "codex"), "b", "the last flag wins");
});

test("antigravity --model / --model= / Go's -model; omp under bun with --model; pi --model", () => {
  assert.equal(detectModel(["agy", "--model", "gemini-3.1-pro"], "antigravity"), "gemini-3.1-pro");
  assert.equal(detectModel(["agy", "--model=gemini-3.8-flash", "-i", "hi"], "antigravity"), "gemini-3.8-flash");
  assert.equal(detectModel(["/Users/x/.local/bin/agy", "-model", "claude-opus-5-5"]), "claude-opus-5-5", "found by argv");
  assert.equal(detectModel(["agy", "-m", "x"], "antigravity"), null, "agy has no -m");
  assert.equal(detectModel(["agy", "-i", "fix the build"], "antigravity"), null, "a first prompt is not a model");
  assert.equal(detectModel(["bun", "/Users/x/.bun/bin/omp", "--auto-approve", "--model", "zai/glm-5.3-flash"], "omp"), "zai/glm-5.3-flash");
  assert.equal(detectModel(["pi", "--model", "openai/gpt-4o"], "pi"), "openai/gpt-4o");
  assert.equal(detectModel(["omp", "--models", "a,b"], "omp"), null);
});

test("an agent with no known flags gives null; the argv's own agent is used when the key doesn't match", () => {
  assert.equal(detectModel(["amp", "--model", "x"], "amp"), null);
  assert.equal(detectModel(["codex", "-m", "gpt-6.1-sol"], "claude"), null, "claude has no -m");
  assert.equal(detectModel(["codex", "-m", "gpt-6.1-sol"], "amp"), "gpt-6.1-sol", "amp has no flags: the argv's agent decides");
  assert.equal(detectModel([], "claude"), null);
  assert.equal(detectModel(undefined, "claude"), null);
});

test("agentArgv skips interpreters and env assignments", () => {
  assert.deepEqual(agentArgv(["env", "FOO=1", "claude", "--x"]), { program: "claude", args: ["--x"] });
  assert.deepEqual(agentArgv(["node", "--no-warnings", "/a/codex.js", "-m", "m"]), { program: "codex", args: ["-m", "m"] });
  assert.equal(agentKeyOfArgv(["cursor-agent", "--model", "x"]), "cursor");
  assert.equal(agentKeyOfArgv(["zsh"]), null);
});

test("defaultModel reads Claude's settings.json, Codex's top-level config.toml model, Antigravity's settings", () => {
  const io = files({
    "/h/.claude/settings.json": JSON.stringify({ model: "sonnet" }),
    "/h/.codex/config.toml": 'approval = "never"\nmodel = "gpt-6.1-sol" # main\n[profiles.fast]\nmodel = "gpt-6-luna"\n',
    "/h/.gemini/antigravity-cli/settings.json": JSON.stringify({ model: "Gemini 3.1 Pro" }),
    "/h/.gemini/settings.json": JSON.stringify({ model: { name: "gemini-2.5-pro" } }),
  });
  assert.equal(defaultModel("claude", io), "sonnet");
  assert.equal(defaultModel("codex", io), "gpt-6.1-sol");
  assert.equal(defaultModel("antigravity", io), "Gemini 3.1 Pro");
  assert.equal(defaultModel("gemini", io), null, "gemini is retired: its settings are not read");
  assert.deepEqual(knownModels("antigravity", io), [], "a settings label is shown, never offered as a pin");
  assert.equal(defaultModel("amp", io), null);
  assert.equal(defaultModel("codex", files({ "/h/.codex/config.toml": '[profiles.fast]\nmodel = "gpt-6-luna"\n' })), null, "a profile's model is not the default");
  assert.equal(defaultModel("claude", files({ "/h/.claude/settings.json": "{not json" })), null);
  assert.equal(defaultModel("claude", files({})), null);
});

test("knownModels: Claude's list, Codex's model cache, plus the configured default; none for others", () => {
  const io = files({
    "/h/.codex/models_cache.json": JSON.stringify({ models: [{ slug: "gpt-6.1-sol" }, { slug: "gpt-6-astra" }] }),
    "/h/.codex/config.toml": 'model = "gpt-6.1-terra"\n',
  });
  assert.ok(knownModels("claude", io).includes("claude-opus-5-5"));
  assert.ok(knownModels("claude", io).includes("opus"));
  assert.deepEqual(knownModels("codex", io), ["gpt-6.1-sol", "gpt-6-astra", "gpt-6.1-terra"]);
  assert.deepEqual(knownModels("amp", io), []);
  assert.deepEqual(knownModels("codex", files({})), []);
});

test("modelArgs: each agent's own flag; nothing without a pin or a known flag", () => {
  assert.deepEqual(modelArgs("claude", "claude-opus-5-5"), ["--model", "claude-opus-5-5"]);
  assert.deepEqual(modelArgs("codex", "gpt-6.1-sol"), ["--model", "gpt-6.1-sol"]);
  assert.deepEqual(modelArgs("omp", "zai/glm-5.3-flash"), ["--model=zai/glm-5.3-flash"]);
  assert.deepEqual(modelArgs("amp", "x"), []);
  assert.deepEqual(modelArgs("claude", undefined), []);
  // What Start passes is what detection reads back.
  for (const [agent, model] of [["claude", "opus"], ["codex", "gpt-6-astra"], ["antigravity", "gemini-3.1-pro"], ["omp", "a/b"], ["pi", "c"]]) {
    assert.equal(detectModel([AGENTS[agent].run[0], ...modelArgs(agent, model)], agent), model);
  }
});

test("shownModel: a running bot shows what runs (detected, else the default, never a pin it wasn't started with); a stopped one its pin", () => {
  assert.deepEqual(shownModel({ argv: ["claude", "--model", "opus"], agentKey: "claude", pinned: "sonnet", fallback: "haiku" }), { model: "opus", source: "detected" });
  assert.deepEqual(shownModel({ argv: ["claude"], agentKey: "claude", pinned: "sonnet", fallback: "haiku" }), { model: "haiku", source: "default" });
  assert.deepEqual(shownModel({ argv: null, agentKey: "claude", pinned: "sonnet", fallback: "haiku" }), { model: "sonnet", source: "pinned" });
  assert.deepEqual(shownModel({ argv: null, agentKey: "claude", fallback: "haiku" }), { model: "haiku", source: "default" });
  assert.deepEqual(shownModel({ agentKey: "amp" }), { model: null, source: null });
});

test("withOverrides: programs.json overrides run and adds agents with a run", () => {
  const t = withOverrides(JSON.stringify({ programs: { claude: { run: ["my-claude"] }, omp: { name: "Oh My Pi", icon: "x" }, mine: { name: "Mine", run: ["mine", "--go"] }, nope: { icon: "y" } } }));
  assert.deepEqual(t.claude.run, ["my-claude"]);
  assert.deepEqual(t.omp.run, ["omp"]);
  assert.deepEqual(t.mine.run, ["mine", "--go"]);
  assert.equal(t.nope, undefined);
  assert.deepEqual(withOverrides("{bad").claude.run, ["claude"]);
  assert.deepEqual(AGENTS.claude.run, ["claude"], "the shipped table is untouched");
});

test("the *From variants take pre-read texts (the mod's async readTextFile), by configPaths' names", () => {
  const p = configPaths("/h");
  assert.equal(p.claudeSettings, "/h/.claude/settings.json");
  assert.equal(p.codexModels, "/h/.codex/models_cache.json");
  assert.equal(defaultModelFrom("claude", { claudeSettings: '{"model":"opus"}' }), "opus");
  assert.equal(defaultModelFrom("codex", { codexConfig: 'model = "gpt-6-luna"' }), "gpt-6-luna");
  assert.equal(defaultModelFrom("claude", {}), null);
  assert.deepEqual(knownModelsFrom("codex", { codexModels: '{"models":[{"slug":"a"}]}', codexConfig: 'model = "b"' }), ["a", "b"]);
  assert.ok(knownModelsFrom("claude").includes("claude-opus-5-5"));
  // A Promise where a text belongs (an un-awaited async read) is no text, never a throw.
  assert.equal(defaultModelFrom("claude", { claudeSettings: Promise.resolve("{}") }), null);
});

test("antigravity replaces gemini: agy argv is antigravity, gemini resolves to it, configPaths reads agy's settings", () => {
  assert.equal(AGENTS.gemini, undefined);
  assert.deepEqual(AGENTS.antigravity.run, ["agy"]);
  assert.equal(agentKeyOfArgv(["agy", "-i", "hello"]), "antigravity");
  assert.equal(agentKeyOfArgv(["/Users/x/.local/bin/agy", "--continue"]), "antigravity");
  assert.equal(agentKeyOfArgv(["gemini"]), null, "a gemini pane is no longer a known agent");
  assert.deepEqual(modelArgs("antigravity", "gemini-3.1-pro"), ["--model", "gemini-3.1-pro"]);
  assert.deepEqual(LEGACY_AGENTS, { gemini: "antigravity" });
  assert.equal(resolveAgent("gemini"), "antigravity");
  assert.equal(resolveAgent("agy"), "antigravity");
  assert.equal(resolveAgent("antigravity"), "antigravity");
  assert.equal(resolveAgent("gemini", withOverrides(JSON.stringify({ programs: { gemini: { run: ["gemini"] } } }))), "gemini",
    "a programs.json that adds gemini back keeps it");
  assert.equal(configPaths("/h").antigravitySettings, "/h/.gemini/antigravity-cli/settings.json");
  assert.equal(configPaths("/h").geminiSettings, undefined);
});
