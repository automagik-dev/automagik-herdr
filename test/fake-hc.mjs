// A stand-in for herdr-core's `hc`, for the CLI tests: every call is appended to
// $HC_FAKE_LOG as one JSON argv line, and answers come from the terminals in
// $HC_FAKE_STATE ({ terminals: [hc get objects], next: number }), which `label` and `run`
// change. Only the calls automagik-herdr makes: ls [--label k=v], get, read, label, run,
// server status (state.core), templates (state.templates: [{ name, command }]).
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
appendFileSync(process.env.HC_FAKE_LOG, `${JSON.stringify(args)}\n`);
const state = JSON.parse(readFileSync(process.env.HC_FAKE_STATE, "utf8"));
const save = () => writeFileSync(process.env.HC_FAKE_STATE, JSON.stringify(state, null, 2));
const out = (x) => process.stdout.write(`${JSON.stringify(x)}\n`);
const fail = (msg, code = 1) => { process.stderr.write(`${msg}\n`); process.exit(code); };
const words = args.filter((a) => a !== "--json");
const find = (t) => state.terminals.find((x) => x.address === t || x.name === t);
// state.fail: commands that fail as a server that is down would (exit 1).
if ((state.fail ?? []).includes(words[0])) fail(`hc: can't reach the server (${words[0]})`);

switch (words[0]) {
  case "ls": {
    const want = [];
    for (let i = 1; i < words.length; i += 1) if (words[i] === "--label") want.push(words[++i]);
    const rows = state.terminals.filter((t) => t.state !== "finished" && want.every((kv) => {
      const [k, v] = [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)];
      return (t.labels ?? {})[k] === v;
    }));
    // Like the real one: rows carry no labels and no created_ms.
    out({ terminals: rows.map(({ address, name, cwd, state: s, parent, status }) => ({ address, name, cwd, state: s, parent, status: status?.state, agent: status?.app })) });
    break;
  }
  case "get": {
    const t = find(words[1]);
    // Like the real one: exit 3 and a not_found error on stderr.
    if (!t) fail(JSON.stringify({ error: { kind: "not_found", message: `no terminal "${words[1]}"` } }), 3);
    out(t);
    break;
  }
  case "read": {
    const t = find(words[1]);
    if (!t) fail(`no terminal ${words[1]}`);
    out({ text: t.screen ?? "" });
    break;
  }
  case "label": {
    const t = find(words[1]);
    if (!t) fail(`no terminal ${words[1]}`);
    if (state.failLabel === words[1]) fail(`label refused on ${words[1]}`);
    t.labels ??= {};
    for (const kv of words.slice(2)) {
      const eq = kv.indexOf("=");
      const [k, v] = [kv.slice(0, eq), kv.slice(eq + 1)];
      if (v === "") delete t.labels[k]; else t.labels[k] = v;
    }
    save();
    out({ address: t.address, labels: t.labels });
    break;
  }
  case "run": {
    const labels = {};
    let name = null, cwd = null, parent = null;
    let i = 1;
    // Options, then argv: after `--`, or from the first word that isn't an option (a template).
    for (; i < words.length && words[i] !== "--" && words[i].startsWith("--"); i += 1) {
      if (words[i] === "--label") { const kv = words[++i]; labels[kv.slice(0, kv.indexOf("="))] = kv.slice(kv.indexOf("=") + 1); }
      else if (words[i] === "--name") name = words[++i];
      else if (words[i] === "--cwd") cwd = words[++i];
      else if (words[i] === "--parent") parent = words[++i];
    }
    const argv = words.slice(words[i] === "--" ? i + 1 : i);
    // `env K=V … program …`: the program is the first word after the assignments.
    const program = /(^|\/)env$/.test(argv[0] ?? "") ? argv.slice(1).find((a) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(a)) : argv[0];
    const address = `t${state.next ?? 100}`;
    state.next = (state.next ?? 100) + 1;
    state.terminals.push({ address, name, cwd, labels, parent, state: "live", created_ms: Date.now(),
      pid: 9000 + Number(address.slice(1)), foreground: { argv, cwd, pid: 5000 + Number(address.slice(1)) }, status: { app: program === "claude" ? "claude-code" : program, state: "working" } });
    // state.onRunWrite: { path, text }: a file edit that lands while this run happens.
    if (state.onRunWrite) writeFileSync(state.onRunWrite.path, state.onRunWrite.text);
    save();
    out({ address });
    break;
  }
  case "server": {
    // `hc server status`: the core's permanent id (state.core, else a fixed one).
    if (words[1] !== "status") fail(`fake hc: no server ${words[1]}`, 2);
    out({ core: state.core ?? { id: "fakecore0000", name: "fake" }, live: state.terminals.filter((t) => t.state === "live").length });
    break;
  }
  case "templates": {
    if (!state.templates) fail("hc: no templates folder");
    out({ templates: state.templates });
    break;
  }
  default:
    fail(`fake hc: no ${words[0]}`, 2);
}
