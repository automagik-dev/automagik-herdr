// Pure parts of herdr-ax: pixel to point conversion, reading order, text matching, arguments.
// No process, file or network access, so the tests load it as it is.

/** The window from a cua-driver list_windows payload: Herdr's own, on screen, frontmost. */
export function pickWindow(payload, app = 'Herdr') {
  const all = (payload?.windows ?? []).filter((w) => w.app_name === app);
  const shown = all.filter((w) => w.is_on_screen !== false && w.on_current_space !== false);
  const pool = shown.length ? shown : all;
  if (!pool.length) throw new Error(`no ${app} window (is herdr-app open?)`);
  return pool.reduce((a, b) => ((b.z_index ?? -1) > (a.z_index ?? -1) ? b : a));
}

/**
 * OCR lines in shot pixels to screen points. The shot covers the window bounds exactly,
 * at the display scale (2 on retina); the scale is measured, not assumed.
 */
export function toPoints(ocr, bounds) {
  const sx = ocr.width / bounds.width;
  const sy = ocr.height / bounds.height;
  if (!(sx > 0) || Math.abs(sx - sy) / sx > 0.02) {
    throw new Error(
      `shot ${ocr.width}x${ocr.height} does not match the window ${bounds.width}x${bounds.height}` +
        ' (was the window resized after its last frame?)',
    );
  }
  const r = (n) => Math.round(n * 10) / 10;
  return ocr.lines.map((l) => ({
    text: l.text,
    x: r(bounds.x + l.x / sx),
    y: r(bounds.y + l.y / sy),
    w: r(l.w / sx),
    h: r(l.h / sy),
  }));
}

/** Top to bottom; lines whose tops are within half a line of each other read left to right. */
export function sortLines(lines) {
  const byTop = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const line of byTop) {
    const row = rows.at(-1);
    if (row && line.y - row.y < Math.min(row.h, line.h) / 2) row.items.push(line);
    else rows.push({ y: line.y, h: line.h, items: [line] });
  }
  return rows.flatMap((row) => row.items.sort((a, b) => a.x - b.x));
}

/** Lines matching text, case-insensitive: exact matches first, then substrings, each in reading order. */
export function matchLines(lines, text) {
  const want = text.trim().toLowerCase();
  if (!want) return [];
  const norm = (l) => l.text.trim().toLowerCase();
  return [
    ...lines.filter((l) => norm(l) === want),
    ...lines.filter((l) => norm(l) !== want && norm(l).includes(want)),
  ];
}

/** The nth match (1-based), or undefined. */
export function findLine(lines, text, nth = 1) {
  return matchLines(lines, text)[nth - 1];
}

/** Where to click for a line: its centre, moved by dx, dy points. */
export function clickPoint(line, dx = 0, dy = 0) {
  return { x: line.x + line.w / 2 + dx, y: line.y + line.h / 2 + dy };
}

/**
 * Screen points to pixels of cua-driver's last get_window_state frame, which is window-local
 * and may be downscaled (max_image_dimension), so the scale comes from that frame.
 */
export function toFramePixels(point, frame) {
  const b = frame.window_bounds;
  return {
    x: Math.round(((point.x - b.x) * frame.screenshot_width) / b.width),
    y: Math.round(((point.y - b.y) * frame.screenshot_height) / b.height),
  };
}

/** Whether two window bounds (points) are the same, to half a point. */
export function sameBounds(a, b) {
  if (!a || !b) return false;
  return ['x', 'y', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) <= 0.5);
}

const isNumber = (s) => /^[-+]?\d+(\.\d+)?$/.test(s);

/**
 * argv to {cmd, text, opts}. Value flags take the next token even when it is negative
 * (`--dx -40`) or use `--dx=-40`; `--gone` is a switch.
 */
export function parseArgs(argv) {
  const valued = new Set(['nth', 'dx', 'dy', 'timeout']);
  const switches = new Set(['gone', 'help']);
  const opts = {};
  const words = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h') {
      opts.help = true;
      continue;
    }
    if (!a.startsWith('--') || isNumber(a)) {
      words.push(a);
      continue;
    }
    const [name, inline] = a.slice(2).split(/=(.*)/s, 2);
    if (switches.has(name)) {
      opts[name] = true;
      continue;
    }
    if (!valued.has(name)) throw new Error(`unknown option --${name}`);
    const value = inline ?? argv[++i];
    if (value === undefined || !isNumber(value)) throw new Error(`--${name} needs a number`);
    opts[name] = Number(value);
    if (name === 'nth' && !(Number.isInteger(opts.nth) && opts.nth >= 1)) {
      throw new Error('--nth needs a whole number of 1 or more');
    }
  }
  const [cmd, ...rest] = words;
  return { cmd, text: rest.join(' '), opts };
}
