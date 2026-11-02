// A space's icon: an emoji, or an image kept under the app home (PNG, SVG, or an ICO
// converted to PNG). Mapped by full space id in shared "spaces-agents.icons"; the tile's
// colour behind it, by the same id, in shared "space.colors". Pure: the icon dialog
// (spaceIcon.js) and the tests share it.
export const KEY = "spaces-agents.icons";
export const COLORS_KEY = "space.colors";
// The sidebar's palette for a space's tile; "transparent" or a hex of your own also do.
export const COLORS = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
export const isHex = (v) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
export const MAX_BYTES = 5 * 1024 * 1024;
export const MIN_SIDE = 16;
export const MAX_SIDE = 2048;
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// "png" | "svg" | "ico" | null, from the path's extension: what a drop or a typed path is.
export function kindOf(path) {
  const ext = /\.([a-z0-9]+)$/i.exec(String(path ?? "").trim())?.[1]?.toLowerCase();
  return ext === "png" || ext === "svg" || ext === "ico" ? ext : null;
}

// null when `bytes` is a usable icon, else what's wrong with it, for people.
export function pngError(bytes) {
  if (!bytes || bytes.length < 24 || SIGNATURE.some((b, i) => bytes[i] !== b)) return "Not a PNG file.";
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== "IHDR") return "Not a valid PNG: its header is missing.";
  if (bytes.length > MAX_BYTES) return `Too large: ${(bytes.length / 1048576).toFixed(1)} MB (at most 5 MB).`;
  const at = (i) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  const width = at(16), height = at(20);
  if (width !== height) return `Not square: ${width}×${height}. Use an image as wide as it is tall.`;
  if (width < MIN_SIDE || width > MAX_SIDE) return `${width}×${height} is outside ${MIN_SIDE}–${MAX_SIDE} px.`;
  return null;
}

// null when `text` is a whole SVG, else what's wrong. Its size is unknown until drawn, so
// only the file's own size is bounded here.
export function svgError(text) {
  const s = String(text ?? "");
  if (!/<svg[\s>]/i.test(s)) return "Not an SVG: it has no <svg> element.";
  if (!/<\/svg>/i.test(s)) return "Not a complete SVG: it has no closing </svg>.";
  if (s.length > MAX_BYTES) return `Too large: ${(s.length / 1048576).toFixed(1)} MB (at most 5 MB).`;
  return null;
}

// null when `raw` is one emoji, else what's wrong. No letters, digits or spaces: a flag
// (two code points) and a joined family pass, a word doesn't.
export function emojiError(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "Type or paste an emoji.";
  if (/\s/.test(s)) return "One emoji: no spaces.";
  if (/[\x00-\x7F]/.test(s)) return "That isn't an emoji — pick one or paste one.";
  if ([...s].length > 12) return "One emoji, not a word.";
  return null;
}

// What shared state holds for a space: { kind: "emoji", char } or { kind: "image", file }.
// A bare path is an image from before emoji existed.
export function readIcon(value) {
  if (!value) return null;
  if (typeof value === "string") return { kind: "image", file: value };
  if (value.kind === "image" && typeof value.file === "string" && value.file) return { kind: "image", file: value.file };
  if (value.kind === "emoji" && typeof value.char === "string" && value.char) return { kind: "emoji", char: value.char };
  return null;
}

// Where a space's image is kept, under the app home: by its full id, made filename-safe.
export function iconFile(spaceId, now, ext) {
  return `space-icons/${spaceId.replace(/[^A-Za-z0-9_-]/g, "_")}-${now}.${ext}`;
}

// null when `value` is a colour the tile can take, else what's wrong.
export function colorError(value) {
  const v = String(value ?? "").trim();
  if (!v) return "Pick a color, or type a hex like #5b8def.";
  if (!COLORS.includes(v) && v !== "transparent" && !isHex(v)) return "Pick a swatch, transparent, or a hex like #5b8def.";
  return null;
}

// The colours map with `id` set to `value` (checked first with colorError).
export function withColor(colors, id, value) {
  return { ...(colors ?? {}), [id]: String(value).trim() };
}

// The kept image a change leaves behind, to delete: only one of ours, under space-icons/.
function leftover(old, next) {
  return old?.kind === "image" && old.file.startsWith("space-icons/") && old.file !== next?.file ? old.file : null;
}

// The icons map with `id` set to `value` ({kind: "emoji", char} or {kind: "image", file}),
// and the file it replaces, if any, to delete.
export function withIcon(icons, id, value) {
  const map = { ...(icons ?? {}) };
  const drop = leftover(readIcon(map[id]), value);
  map[id] = value;
  return { map, drop };
}

// The icons map without `id` (its letter again), and its kept image to delete.
export function withoutIcon(icons, id) {
  const map = { ...(icons ?? {}) };
  const drop = leftover(readIcon(map[id]), null);
  delete map[id];
  return { map, drop };
}

// What fills the tile in theme `t`: the palette colour, the hex as typed, or null (none).
export function tileFill(color, t) {
  const c = typeof color === "string" ? color : "ansi6";
  if (c === "transparent") return null;
  return c.startsWith("#") ? c : t[c] ?? t.accent;
}

// The emoji indexes whose name holds `query` (or that are it), all of them for none.
export function emojiHits(query, chars, names) {
  const q = String(query ?? "").trim().toLowerCase();
  const hits = [];
  for (let i = 0; i < chars.length; i++) if (!q || names[i].includes(q) || chars[i] === q) hits.push(i);
  return hits;
}
