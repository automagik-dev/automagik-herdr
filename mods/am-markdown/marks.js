// The Markdown paths a terminal's text shows, for the right-click menu. No Herdr import: the
// regex and the resolution are plain, so a script can check them against real terminal text.

export const MARKDOWN = /\.(md|mdx|markdown)$/i;

// A path as it appears in output: no spaces, no quotes around it, at least one name and the
// extension. `(?:~|\/|\.{1,2}\/)?` lets an absolute or home path start the match.
const CANDIDATE = /(?:~|\/|\.{1,2}\/)?(?:[\w.@+~-]+\/)*[\w.@+~-]+\.(?:md|mdx|markdown)\b/gi;

// Paths in the order they appear (oldest first: the text reads top to bottom).
export function markdownCandidates(text) {
  const out = [];
  for (const m of text.matchAll(CANDIDATE)) {
    // A match cut out of a longer path or word (`.../pm/CLAUDE.md` inside a wrapped line) is no use.
    if (/[\w/@.-]/.test(text[m.index - 1] ?? "")) continue;
    out.push(m[0]);
  }
  return out;
}

// Where a path in terminal text points: `~` at home, an absolute path as it is, anything else
// under one of the folders it could be relative to (`cwd`, then the repo's root).
export function resolve(raw, roots, home) {
  if (raw.startsWith("~/")) return [home + raw.slice(1)];
  if (raw.startsWith("/")) return [raw];
  return [...new Set(roots.filter(Boolean).map((r) => `${r.replace(/[\\/]+$/, "")}/${raw}`))];
}

// A path as a person reads it: relative to the folder, else as it is.
export function label(path, cwd) {
  const base = cwd?.replace(/[\\/]+$/, "");
  return base && path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path;
}
