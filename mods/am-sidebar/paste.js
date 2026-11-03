// Image paste into a terminal on another machine: the clipboard image as a real PNG
// (clipboard-png.jxa), sent beside it (`hc put`), its path typed (`hc keys`, no Enter).

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const isPng = (bytes) => Boolean(bytes) && bytes.length > 8 && SIGNATURE.every((b, i) => bytes[i] === b);

// `hc keys` names for typing `text`, or null if a character can't be typed safely
// (hc keys takes a-z, 0-9, / . -; capitals as shift+letter). Spaces and anything else
// (_ ; quotes, newlines) refuse: an unquoted path or an Enter must never be typed.
export function keysFor(text) {
  if (!text) return null;
  const keys = [];
  for (const c of text) {
    if (/[a-z0-9/.\-]/.test(c)) keys.push(c);
    else if (/[A-Z]/.test(c)) keys.push(`shift+${c.toLowerCase()}`);
    else return null;
  }
  return keys;
}

// A terminal on another machine has a `<machine>/` address.
export const remote = (address) => typeof address === "string" && address.includes("/");
