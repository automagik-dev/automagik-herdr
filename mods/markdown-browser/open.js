// Hands a Markdown file to the system's default app for it.
import { exec, window } from "herdr";
import { psLiteral } from "./list.js";

// Only a Markdown file goes to the default app: not a link named *.md to a program or an app
// bundle (the default handler would run it). Resolves with { path } (what to open: the
// checked path itself) or { why }.
async function check(file) {
  let r;
  if (window().platform === "windows") {
    // Not a folder, symlink or junction: the file itself, by its full name.
    r = await exec("powershell", ["-NoProfile", "-Command",
      "& { param($p) $i = Get-Item -LiteralPath $p -Force -ErrorAction Stop; " +
      "if ($i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint)) { exit 1 }; " +
      "[Console]::Out.Write($i.FullName) } " + psLiteral(file)]);
  } else {
    // Every byte of the resolved path: $(...) drops trailing newlines, so realpath's line ends
    // in a sentinel that comes off with exactly one newline.
    r = await exec("sh", ["-c",
      'p=$(realpath -- "$1" && printf x) || exit 1; p=${p%x}; p=${p%?}; [ -f "$p" ] && printf %s "$p"',
      "markdown-browser", file]);
  }
  if (r.code !== 0 || /[\0-\x1f\x7f]/.test(r.stdout) || !/\.(md|mdx|markdown)$/i.test(r.stdout))
    return { why: "Not a Markdown file" };
  return { path: r.stdout };
}

function command(file) {
  switch (window().platform) {
    case "macos": return ["open", [file]];
    // start would need cmd's quoting; explorer.exe exits 1 even when it opened the file.
    case "windows": return ["rundll32", ["url.dll,FileProtocolHandler", file]];
    default: return ["xdg-open", [file]];
  }
}

// Resolves with null, or why it couldn't open.
export async function openDefault(file) {
  const { path, why } = await check(file).catch((e) => ({ why: String(e?.message ?? e) }));
  if (why) return why;
  const [cmd, args] = command(path);
  try {
    const r = await exec(cmd, args);
    return r.code === 0 ? null : (r.stderr.trim() || `${cmd} exited with ${r.code}`);
  } catch (e) {
    return String(e?.message ?? e);
  }
}
