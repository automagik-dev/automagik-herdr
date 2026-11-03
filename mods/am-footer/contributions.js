// Buttons other mods add to the footer rail. A mod declares them in its own mod.json:
//   "automagik": { "footer": [ { "id", "label", "icon"?, "command", "args"?, "badge"? } ] }
// Pure: no Herdr import, so node tests and main.js share it. The scan takes an `io` with
// `exec` and `readText`, as mod-manager's core.js does.

export const MAX_BUTTONS = 4;
// Drawn when a button's icon is missing, outside the app home or not an SVG.
export const FALLBACK_ICON = "mods/sidebar-chrome/circle.svg";
// Pocket Link's folder belongs to automagik-pocket; the rail has its own tab for it and never
// reads it here.
const SKIP = /^pocket-link$/i;

const text = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// A path under the app home, as svg() takes it: relative, no `..`, no backslash, ends in .svg.
export function iconPath(v) {
  const p = text(v);
  if (!p || p.startsWith("/") || p.startsWith("~") || p.includes("\\")) return null;
  if (p.split("/").some((part) => part === ".." || part === "")) return null;
  return /\.svg$/i.test(p) ? p : null;
}

// A file that looks like an SVG; anything else gets the fallback glyph.
export const iconLooksValid = (body) => typeof body === "string" && /<svg[\s>]/i.test(body);

// The count to draw: a number above 0, else nothing. Strings are not coerced. Past 9 it reads
// "9+", which still fits beside the icon in a 28 px tab.
export function badgeCount(v) {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  const n = Math.ceil(v);
  return n > 9 ? "9+" : String(n);
}

// Runs `fn` one call at a time. A call made while one runs waits for it, and the latest such call's
// arguments get one more run after it; every caller resolves when that rerun is done.
export function oneAtATime(fn) {
  let running = null, again = null;
  return (...args) => {
    if (running) { again = args; return running; }
    running = (async () => {
      try {
        for (let next = args; next; next = again) { again = null; await fn(...next); }
      } finally { running = null; }
    })();
    return running;
  };
}

// One mod.json's entries, valid ones only, in the order declared. `problems` says what was
// skipped and why, for the console; nothing here throws.
export function parseFooter(mod, body) {
  const buttons = [], problems = [];
  let json;
  try { json = JSON.parse(body); } catch { return { buttons, problems: [`${mod}: mod.json is not valid JSON`] }; }
  const list = plain(json) && plain(json.automagik) ? json.automagik.footer : undefined;
  if (list === undefined) return { buttons, problems };
  if (!Array.isArray(list)) return { buttons, problems: [`${mod}: automagik.footer is not a list`] };
  const seen = new Set();
  list.forEach((entry, i) => {
    const id = plain(entry) ? text(entry.id) : null;
    const label = plain(entry) ? text(entry.label) : null;
    const command = plain(entry) ? text(entry.command) : null;
    if (!id || !label || !command) {
      problems.push(`${mod}: footer[${i}] needs id, label and command`);
      return;
    }
    if (seen.has(id)) { problems.push(`${mod}: footer id "${id}" appears twice; the first is kept`); return; }
    seen.add(id);
    buttons.push({
      key: `${mod}/${id}`, mod, id, label, command,
      args: plain(entry.args) ? entry.args : {},
      icon: iconPath(entry.icon),
      badge: text(entry.badge),
    });
  });
  return { buttons, problems };
}

// Every mod's buttons, in mod-name order, at most MAX_BUTTONS in all.
export function collectFooter(mods, max = MAX_BUTTONS) {
  const sorted = [...mods].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const buttons = [], problems = [];
  for (const { name, text: body } of sorted) {
    if (typeof body !== "string") continue;
    const r = parseFooter(name, body);
    buttons.push(...r.buttons);
    problems.push(...r.problems);
  }
  if (buttons.length > max) problems.push(`footer: ${buttons.length} buttons, the first ${max} are shown`);
  return { buttons: buttons.slice(0, max), problems };
}

// The mod folders `find` printed (one path a line), by name: hidden ones and Pocket Link out.
export function modNames(stdout) {
  return String(stdout ?? "").split("\n").map((p) => p.trim().replace(/\/+$/, "").split("/").pop())
    .filter((n) => n && !n.startsWith(".") && !SKIP.test(n))
    .sort();
}

// Whether a watchFolder batch can change the buttons: the mods folder itself, a folder in it
// (added or removed), a mod.json, or an SVG (an icon appearing). Edits inside a mod do not.
export function touchesFooter(paths, modsDir) {
  const root = modsDir.replace(/\/+$/, "");
  return (paths ?? []).some((p) => {
    if (typeof p !== "string") return false;
    const q = p.replace(/\/+$/, "");
    if (q === root) return true;
    if (!q.startsWith(`${root}/`)) return false;
    const rest = q.slice(root.length + 1).split("/");
    return rest.length === 1 || (rest.length === 2 && rest[1] === "mod.json") || /\.svg$/i.test(q);
  });
}

// List the installed mods, read each mod.json, keep the valid buttons, then check each icon.
// Reads only; a failure leaves the rail without contributed buttons.
export async function scanFooter(io, appHome) {
  const listed = await io.exec("find", [`${appHome}/mods`, "-mindepth", "1", "-maxdepth", "1", "(", "-type", "d", "-o", "-type", "l", ")"])
    .catch(() => null);
  if (listed?.code !== 0) return { buttons: [], problems: ["footer: could not list the mods folder"] };
  const mods = [];
  for (const name of modNames(listed.stdout)) {
    let body = null;
    try { body = await io.readText(`${appHome}/mods/${name}/mod.json`); } catch { body = null; }
    mods.push({ name, text: body });
  }
  const { buttons, problems } = collectFooter(mods);
  for (const b of buttons) {
    let ok = false;
    if (b.icon) { try { ok = iconLooksValid(await io.readText(`${appHome}/${b.icon}`)); } catch { ok = false; } }
    b.glyph = ok ? b.icon : FALLBACK_ICON;
  }
  return { buttons, problems };
}
