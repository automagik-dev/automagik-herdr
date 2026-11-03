// A stand-in for `herdr-app` in the CLI tests: `ls` answers the window in the state file
// (HERDR_APP_FAKE_STATE), `do space.new <json>` adds a space with one tab and a shell to it and
// prints the new pane and terminal, as the real one documents; every call is logged
// (HERDR_APP_FAKE_LOG). `down: true` in the state is no window; `rival: true` has another start's
// space on the same folder open just before ours (two starts at once); `space.close` removes one.
// The real window is never touched.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const [command, ...rest] = process.argv.slice(2);
const statePath = process.env.HERDR_APP_FAKE_STATE;
appendFileSync(process.env.HERDR_APP_FAKE_LOG, `${JSON.stringify([command, ...rest])}\n`);
const state = JSON.parse(readFileSync(statePath, "utf8"));
if (state.down) {
  process.stderr.write("herdr-app: no window is open\n");
  process.exit(1);
}
if (command === "ls") {
  process.stdout.write(JSON.stringify({ spaces: state.spaces ?? [], recent: [] }));
  process.exit(0);
}
if (command === "do" && rest[0] === "space.new") {
  const args = JSON.parse(rest[1] ?? "{}");
  const n = state.next ?? 1;
  state.next = n + 1;
  state.spaces = (state.spaces ?? []).map((s) => ({ ...s, active: false }));
  if (state.rival) {
    state.rival = false;
    state.spaces.push({ id: "sp-rival", name: args.name ?? "", folder: args.folder ?? "", machine: null, active: false,
      tabs: [{ id: "tb-rival", name: "1", active: true, terminals: [{ terminal: "t-rival", pane: "p-rival" }] }] });
  }
  state.spaces.push({ id: `sp-new${n}`, name: args.name ?? "", folder: args.folder ?? "", machine: null, active: true,
    tabs: [{ id: `tb-new${n}`, name: "1", active: true, terminals: [{ terminal: `t-sh${n}`, pane: `p-new${n}` }] }] });
  writeFileSync(statePath, JSON.stringify(state));
  process.stdout.write(JSON.stringify({ pane: `p-new${n}`, terminal: `t-sh${n}` }));
  process.exit(0);
}
if (command === "do" && rest[0] === "space.close") {
  const { id } = JSON.parse(rest[1] ?? "{}");
  state.spaces = (state.spaces ?? []).filter((s) => s.id !== id);
  writeFileSync(statePath, JSON.stringify(state));
  process.stdout.write("{}");
  process.exit(0);
}
process.stderr.write(`fake herdr-app: ${command} is not faked\n`);
process.exit(3);
