// The program a terminal runs, by its argv: the first word, or what a
// `sh -c '"$@"; …' sh <cmd> …` wrapper runs. A leading `env NAME=value …` is
// looked through to the program it execs; any env option (-i, -u …) is not, and
// leaves the program as "env".
const word = (s) => (typeof s === "string" ? s.split("/").pop() : null);
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;

export function command(argv) {
  if (!argv?.length) return null;
  let rest = argv;
  if (["sh", "bash", "zsh", "dash"].includes(word(argv[0])) && argv[1] === "-c" && /^\s*"\$@"/.test(argv[2] ?? "")) rest = argv.slice(4);
  if (word(rest[0]) === "env") {
    let i = 1;
    while (i < rest.length && ASSIGN.test(rest[i])) i++;
    if (i < rest.length && !rest[i].startsWith("-")) return word(rest[i]);
  }
  return word(rest[0]);
}
