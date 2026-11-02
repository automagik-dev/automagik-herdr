// A space's icon: an emoji, or an image kept under the app home (PNG, SVG, or an ICO
// converted to PNG). Mapped by full space id in shared "spaces-agents.icons".
export const KEY = "spaces-agents.icons";
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
