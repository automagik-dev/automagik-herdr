#!/usr/bin/env node
// herdr-ax: an accessibility tree for the Herdr window, read with OCR (macOS only).
// Herdr draws with GPUI and exposes no macOS AX tree, so this reads the window's own frame
// (`herdr-app shot`) with Apple Vision and clicks through cua-driver by pixel. See README.md.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clickPoint,
  findLine,
  parseArgs,
  pickWindow,
  sameBounds,
  sortLines,
  toFramePixels,
  toPoints,
} from './ax.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = process.env.HERDR_AX_APP || 'Herdr';

const USAGE = `herdr-ax: an OCR accessibility tree for the Herdr window (macOS)

Usage:
  herdr-ax tree                          every text line, top to bottom: [{text,x,y,w,h}]
  herdr-ax find <text> [--nth N]         the Nth line matching text (exact first, then substring)
  herdr-ax click <text> [--nth N] [--dx N] [--dy N]
                                         click the line's centre, moved by dx, dy points
  herdr-ax expect <text> [--gone] [--timeout S]
                                         wait up to S seconds (default 5) for text to show (or go)

Coordinates are screen points. Matching is case-insensitive. find, click and expect exit 1
when nothing matches. Needs herdr-app, cua-driver (with a running daemon) and swiftc.`;

/** Run a program; a missing one says so by name instead of `spawnSync x ENOENT`. */
function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw Object.assign(new Error(`${err.path ?? cmd} not found (install it or put it on PATH)`), { missing: true });
    }
    throw err;
  }
}

const driver = (tool, args) => JSON.parse(run('cua-driver', ['call', tool, JSON.stringify(args)]));

/** The OCR binary, compiled once per source version into the temp folder. */
function ocrbox() {
  if (process.env.HERDR_AX_OCRBOX) return process.env.HERDR_AX_OCRBOX;
  const src = join(HERE, 'ocrbox.swift');
  const hash = createHash('sha256').update(readFileSync(src)).digest('hex').slice(0, 12);
  const dir = join(tmpdir(), `herdr-ax-${hash}`);
  const bin = join(dir, 'ocrbox');
  if (existsSync(bin)) return bin;
  mkdirSync(dir, { recursive: true });
  const part = `${bin}.${process.pid}`;
  const args = ['-O', '-o', part, src, '-framework', 'Vision', '-framework', 'AppKit'];
  process.stderr.write('herdr-ax: compiling ocrbox.swift (once)\n');
  try {
    try {
      run('swiftc', args);
    } catch (err) {
      if (!err.missing) throw err; // a real compile error: keep its message
      run('xcrun', ['swiftc', ...args]);
    }
    renameSync(part, bin);
  } catch (err) {
    rmSync(part, { force: true });
    if (err.missing) {
      throw new Error('swiftc not found: install Xcode or the Command Line Tools (xcode-select --install)');
    }
    err.message = `compiling ocrbox.swift failed: ${err.message}`;
    throw err;
  }
  return bin;
}

/** Herdr's window and every text line in it, in screen points, top to bottom. */
function snapshot() {
  const win = pickWindow(driver('list_windows', { app: APP }), APP);
  const dir = mkdtempSync(join(tmpdir(), 'herdr-ax-shot-'));
  try {
    const shot = join(dir, 'shot.png');
    run('herdr-app', ['shot', shot]);
    const ocr = JSON.parse(run(ocrbox(), [shot]));
    return { win, lines: sortLines(toPoints(ocr, win.bounds)) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const print = (v) => process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);
const needText = (text, cmd) => {
  if (!text) throw new Error(`${cmd} needs a text`);
};

async function main(argv) {
  const { cmd, text, opts } = parseArgs(argv);
  if (opts.help || !cmd || cmd === 'help') {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (process.platform !== 'darwin') throw new Error('herdr-ax runs on macOS only');
  const nth = opts.nth ?? 1;

  if (cmd === 'tree') {
    print(snapshot().lines);
    return 0;
  }

  if (cmd === 'find') {
    needText(text, cmd);
    const line = findLine(snapshot().lines, text, nth);
    if (!line) return notFound(text, nth);
    print(line);
    return 0;
  }

  if (cmd === 'click') {
    needText(text, cmd);
    const { win, lines } = snapshot();
    const line = findLine(lines, text, nth);
    if (!line) return notFound(text, nth);
    const at = clickPoint(line, opts.dx ?? 0, opts.dy ?? 0);
    const target = { pid: win.pid, window_id: win.window_id };
    // Pixel clicks land in the frame of the last get_window_state screenshot; take a fresh one.
    // A capture lives in its session, and each `cua-driver call` is its own unless named.
    const session = `herdr-ax-${process.pid}`;
    const frame = driver('get_window_state', { ...target, include_accessibility_tree: false, session });
    // The point was read against list_windows' bounds; a window moved since then is refused.
    if (!sameBounds(win.bounds, frame.window_bounds)) {
      const s = (b) => `${b?.x},${b?.y} ${b?.width}x${b?.height}`;
      throw new Error(
        `the window moved or resized while reading (${s(win.bounds)} -> ${s(frame.window_bounds)}); run again`,
      );
    }
    const pixel = toFramePixels(at, frame);
    const w = frame.screenshot_width;
    const h = frame.screenshot_height;
    if (pixel.x < 0 || pixel.y < 0 || pixel.x >= w || pixel.y >= h) {
      throw new Error(`click point ${at.x},${at.y} is outside the window`);
    }
    driver('click', { ...target, ...pixel, capture_id: frame.capture_id, session });
    print({ clicked: line, at, pixel, ...target });
    return 0;
  }

  if (cmd === 'expect') {
    needText(text, cmd);
    const deadline = Date.now() + (opts.timeout ?? 5) * 1000;
    for (;;) {
      const line = findLine(snapshot().lines, text, nth);
      if (opts.gone ? !line : line) {
        print(opts.gone ? { gone: text } : line);
        return 0;
      }
      if (Date.now() >= deadline) {
        process.stderr.write(`herdr-ax: "${text}" ${opts.gone ? 'still shows' : 'did not show'}\n`);
        return 1;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  throw new Error(`unknown command ${cmd} (herdr-ax --help)`);
}

function notFound(text, nth) {
  process.stderr.write(`herdr-ax: no line matches "${text}"${nth > 1 ? ` (--nth ${nth})` : ''}\n`);
  return 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    // execFileSync puts stderr in the message already; cua-driver prints a refusal on stdout.
    const detail = err.stdout?.toString().trim();
    process.stderr.write(`herdr-ax: ${err.message}${detail ? `\n${detail}` : ''}\n`);
    process.exit(2);
  },
);
