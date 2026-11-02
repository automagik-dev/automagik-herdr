// The Markdown files around the focused pane: its git repo's (tracked and untracked, not
// ignored), else up to four levels of its folder, skipping hidden folders, node_modules and
// a home's Library.
import { spaces, panes, focused, exec, window } from "herdr";

export const MARKDOWN = /\.(md|mdx|markdown)$/i;

// A PowerShell single-quoted string: -Command reads what follows the script as more script,
// so a path goes in as a literal, as in the Files panel. PowerShell also ends a literal at the
// typographic single quotes (‘ ’ ‚ ‛); each is doubled like ' (exec takes no env to pass it by).
export const psLiteral = (s) => `'${s.replace(/['‘’‚‛]/g, (c) => c + c)}'`;

// A file under a root, which may be "/" or end in a separator.
export const join = (root, rel) => `${root.replace(/[\\/]+$/, "")}/${rel}`;

// Where the Files panel looks: the focused pane's folder, on its machine, in its tab. A mod
// pane (a preview) has none: then its tab's first terminal, `weak` (the list keeps what it
// shows while the tab stays the same).
export function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  const tab = f?.tab ?? null;
  if (pane && !pane.terminal) {
    const shell = panes().find((p) => p.tab === pane.tab && p.terminal && p.cwd);
    return { cwd: shell?.cwd || space?.folder || null, on, tab, weak: true };
  }
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on, tab, weak: false };
}

// Resolves with { root, files: [paths relative to root, sorted] }.
export async function markdownFiles(cwd, on) {
  const top = await exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { on }).catch(() => null);
  if (top?.code === 0) {
    const root = top.stdout.trim();
    const r = await exec("git", ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--",
      ":(icase)*.md", ":(icase)*.mdx", ":(icase)*.markdown"], { on });
    if (r.code !== 0) throw new Error(r.stderr.trim() || "git ls-files failed");
    return { root, files: [...new Set(r.stdout.split("\0").filter(Boolean))].sort(byFolder) };
  }
  let files;
  if (!on && window().platform === "windows") {
    // Relative paths from PowerShell itself: its FullName may differ from cwd in case.
    const r = await exec("powershell", ["-NoProfile", "-Command",
      "& { param($p) $r = (Get-Item -LiteralPath $p -ErrorAction Stop).FullName.TrimEnd('\\', '/'); " +
      "Get-ChildItem -LiteralPath $r -Recurse -Depth 3 -File -Include *.md,*.mdx,*.markdown -ErrorAction SilentlyContinue | " +
      "ForEach-Object { $_.FullName.Substring($r.Length).TrimStart('\\', '/') } | " +
      "Where-Object { $_ -notmatch '(^|[\\\\/])(node_modules|\\.[^\\\\/]+)[\\\\/]' } } " + psLiteral(cwd)]);
    if (r.code !== 0) throw new Error(r.stderr.trim() || "Cannot list this folder");
    files = r.stdout.split(/\r?\n/).filter((p) => p && MARKDOWN.test(p));
  } else {
    // "/" and a trailing separator: find starts from the bare folder, and paths are cut after it.
    const base = cwd.replace(/[\\/]+$/, "");
    const r = await exec("find", [base || "/", "-mindepth", "1", "-maxdepth", "4",
      "-type", "d", "(", "-name", "node_modules", "-o", "-name", ".*", "-o", "-path", `${base}/Library`, ")", "-prune", "-o",
      "-type", "f", "(", "-iname", "*.md", "-o", "-iname", "*.mdx", "-o", "-iname", "*.markdown", ")", "-print0"], { on });
    // find exits 1 when some folders can't be read; what it found still counts.
    if (r.code !== 0 && !r.stdout) throw new Error(r.stderr.trim() || "Cannot list this folder");
    // NUL-separated: a name may hold a newline.
    files = r.stdout.split("\0")
      .filter((p) => p.startsWith(`${base}/`) && MARKDOWN.test(p))
      .map((p) => p.slice(base.length + 1));
  }
  return { root: cwd, files: files.sort(byFolder) };
}

// Top-level files first, then folder by folder.
function byFolder(a, b) {
  const da = a.includes("/") || a.includes("\\"), db = b.includes("/") || b.includes("\\");
  return Number(da) - Number(db) || a.localeCompare(b);
}
