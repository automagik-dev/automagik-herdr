import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clickPoint,
  findLine,
  matchLines,
  parseArgs,
  pickWindow,
  sortLines,
  toFramePixels,
  toPoints,
} from '../scripts/herdr-ax/ax.mjs';

const bounds = { x: 0, y: 33, width: 1728, height: 1020 };

test('toPoints converts a retina shot to screen points with the window origin', () => {
  const ocr = { width: 3456, height: 2040, lines: [{ text: 'a', x: 100, y: 50, w: 41, h: 30 }] };
  assert.deepEqual(toPoints(ocr, bounds), [{ text: 'a', x: 50, y: 58, w: 20.5, h: 15 }]);
});

test('toPoints refuses a shot that does not match the window', () => {
  const ocr = { width: 3456, height: 1800, lines: [] };
  assert.throws(() => toPoints(ocr, bounds), /does not match/);
});

test('sortLines reads top to bottom, and left to right within a row', () => {
  const l = (text, x, y) => ({ text, x, y, w: 10, h: 10 });
  const got = sortLines([l('c', 0, 40), l('b', 50, 11), l('a', 0, 13), l('d', 0, 25)]);
  assert.deepEqual(got.map((x) => x.text), ['a', 'b', 'd', 'c']);
});

test('matchLines puts exact matches before substrings, case-insensitive', () => {
  const lines = [{ text: 'General Orchestrator 2' }, { text: 'general orchestrator' }, { text: 'x' }];
  assert.deepEqual(matchLines(lines, 'General Orchestrator').map((l) => l.text), [
    'general orchestrator',
    'General Orchestrator 2',
  ]);
  assert.equal(findLine(lines, 'orchestrator', 2).text, 'general orchestrator');
  assert.equal(findLine(lines, 'nope'), undefined);
  assert.equal(findLine(lines, '  '), undefined);
});

test('clickPoint and toFramePixels map a line to a downscaled cua-driver frame', () => {
  const at = clickPoint({ x: 100, y: 133, w: 40, h: 10 }, -40, 0);
  assert.deepEqual(at, { x: 80, y: 138 });
  const frame = { window_bounds: bounds, screenshot_width: 1365, screenshot_height: 806 };
  assert.deepEqual(toFramePixels(at, frame), { x: 63, y: 83 });
});

test('pickWindow takes the frontmost on-screen Herdr window', () => {
  const windows = [
    { app_name: 'Herdr', window_id: 1, z_index: 5, is_on_screen: false },
    { app_name: 'Herdr', window_id: 2, z_index: 3, is_on_screen: true },
    { app_name: 'Herdr', window_id: 3, z_index: 4, is_on_screen: true },
    { app_name: 'Herdr Pocket', window_id: 4, z_index: 9, is_on_screen: true },
  ];
  assert.equal(pickWindow({ windows }).window_id, 3);
  assert.throws(() => pickWindow({ windows: [] }), /no Herdr window/);
});

test('parseArgs takes negative values and = forms', () => {
  assert.deepEqual(parseArgs(['click', 'General', 'Orchestrator', '--dx', '-40', '--dy=2']), {
    cmd: 'click',
    text: 'General Orchestrator',
    opts: { dx: -40, dy: 2 },
  });
  assert.deepEqual(parseArgs(['expect', 'x', '--gone', '--nth', '2']).opts, { gone: true, nth: 2 });
  assert.throws(() => parseArgs(['find', 'x', '--nth']), /needs a number/);
  assert.throws(() => parseArgs(['find', 'x', '--bogus']), /unknown option/);
});
