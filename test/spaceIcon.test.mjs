// The space icon dialog (spaces-agents/spaceIcon.js, spaceIconModel.js) under `node --test`,
// with gpui and herdr stood in for (gpui-stub.mjs, form-herdr-stub.mjs): what an emoji, an
// image and a colour write to the shared keys, which kept file a change deletes, and that the
// sidebar opens it as its own dialog. Its look is checked live.
import { registerHooks } from "node:module";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = (f) => new URL(f, import.meta.url).href;
const stubs = { herdr: here("./form-herdr-stub.mjs"), "fs/promises": here("./fs-stub.mjs"), "gpui-kit": here("./gpui-stub.mjs"), "gpui-base": here("./gpui-stub.mjs") };
const fromPack = (context) => context.parentURL?.includes("/mods/spaces-agents/");
registerHooks({
  resolve: (specifier, context, next) => (stubs[specifier] && fromPack(context) ? { url: stubs[specifier], shortCircuit: true } : next(specifier, context)),
});
const { state } = await import(stubs.herdr);
const { nodes, index } = await import(stubs["gpui-kit"]);
const { SpaceIconDialog, spaceIconOverlay } = await import("../mods/spaces-agents/spaceIcon.js");
const { chars, names } = await import("../mods/spaces-agents/emoji-data.js");
const model = await import("../mods/spaces-agents/spaceIconModel.js");
const { KEY, COLORS_KEY } = model;

// A PNG header of `w`×`h`: the signature, then IHDR's length, name, width and height.
function png(w, h) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

function makeCx() {
  const cx = {
    pending: [],
    spawn(fn) { const p = Promise.resolve().then(() => fn(cx)); cx.pending.push(p); return p; },
    notify() {},
  };
  cx.settle = async () => { for (let i = 0; i < 100 && cx.pending.length; i += 1) await Promise.allSettled(cx.pending.splice(0)); };
  return cx;
}

let root;
beforeEach((t) => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "hb-space-icon-")));
  t.after?.(() => rmSync(root, { recursive: true, force: true }));
  state.appHome = join(root, "app");
  mkdirSync(state.appHome, { recursive: true });
  state.closed = [];
  state.spaces = [{ id: "w1", name: "herdr" }];
  state.shared = new Map();
});

// The dialog for space w1, opened as the sidebar opens it, drawn once.
function open() {
  const cx = makeCx();
  const dialog = new SpaceIconDialog({ ...spaceIconOverlay("w1").props, overlay: "ov1" }, cx);
  const draw = () => index(dialog.render(cx));
  draw();
  return { dialog, cx, draw };
}

// ---- the pure parts ----

test("the sidebar opens the icon dialog as its own mod, by space id", () => {
  assert.deepEqual(spaceIconOverlay("w1"), { mod: "spaces-agents", kind: "dialog", width: 440, height: 520, props: { spaceIcon: "w1" } });
});

test("one emoji passes; words, spaces and empty input are refused", () => {
  for (const ok of ["🦊", "🇧🇷", "👨‍👩‍👧"]) assert.equal(model.emojiError(ok), null, ok);
  for (const bad of ["", "  ", "fox", "🦊 🦊", "a🦊"]) assert.ok(model.emojiError(bad), JSON.stringify(bad));
});

test("an image is a square PNG of 16–2048 px, a whole SVG, or an ICO by extension", () => {
  assert.equal(model.kindOf("/x/a.PNG"), "png");
  assert.equal(model.kindOf("a.ico"), "ico");
  assert.equal(model.kindOf("a.jpg"), null);
  assert.equal(model.pngError(png(64, 64)), null);
  assert.match(model.pngError(png(64, 32)), /Not square/);
  assert.match(model.pngError(png(8, 8)), /outside 16–2048/);
  assert.match(model.pngError(Buffer.from("not a png at all, no header here")), /Not a PNG/);
  assert.equal(model.svgError('<svg viewBox="0 0 1 1"></svg>'), null);
  assert.match(model.svgError("<svg>"), /closing/);
});

test("a colour is a palette name, transparent or a hex; it is kept by space id", () => {
  for (const ok of ["ansi6", "transparent", "#5b8def", "#abc"]) assert.equal(model.colorError(ok), null, ok);
  for (const bad of ["", "red", "#12", "ansi9"]) assert.ok(model.colorError(bad), bad);
  assert.deepEqual(model.withColor({ w2: "ansi1" }, "w1", " #abc "), { w2: "ansi1", w1: "#abc" });
  assert.equal(model.tileFill("transparent", {}), null);
  assert.equal(model.tileFill("#abc", {}), "#abc");
  assert.equal(model.tileFill(null, { ansi6: "#0ff" }), "#0ff");
  assert.equal(model.tileFill("ansi4", { accent: "#123" }), "#123");
});

test("a new icon replaces the old one and names the kept image to delete, only one of ours", () => {
  const image = (file) => ({ kind: "image", file });
  const emoji = { kind: "emoji", char: "🦊" };
  assert.deepEqual(model.withIcon({ w1: image("space-icons/w1-1.png") }, "w1", emoji), { map: { w1: emoji }, drop: "space-icons/w1-1.png" });
  assert.equal(model.withIcon({ w1: image("space-icons/w1-1.png") }, "w1", image("space-icons/w1-1.png")).drop, null);
  assert.equal(model.withIcon({ w1: image("/Users/x/logo.png") }, "w1", emoji).drop, null);
  assert.equal(model.withIcon({ w1: image("space-icons/../../x") }, "w1", emoji).drop, null, "a path that climbs out is never deleted");
  // A bare path is an image from before emoji existed.
  assert.equal(model.withIcon({ w1: "space-icons/old.png" }, "w1", emoji).drop, "space-icons/old.png");
  assert.deepEqual(model.withoutIcon({ w1: emoji, w2: emoji }, "w1"), { map: { w2: emoji }, drop: null });
  assert.equal(model.withoutIcon({ w1: image("space-icons/w1-1.svg") }, "w1").drop, "space-icons/w1-1.svg");
  assert.equal(model.iconFile("ssh://box/w 1", 7, "png"), "space-icons/ssh___box_w_1-7.png");
});

test("emoji search is by Unicode name; no query lists them all", () => {
  assert.equal(model.emojiHits("", chars, names).length, chars.length);
  const fox = model.emojiHits("Fox", chars, names).map((i) => names[i]);
  assert.ok(fox.includes("fox face"), fox.join(", "));
  assert.deepEqual(model.emojiHits("no such emoji name", chars, names), []);
});

// ---- the dialog, against shared state ----

test("a grid cell sets the space's emoji and closes the dialog", async () => {
  const { cx } = open();
  nodes.get("em-0").click(null, cx);
  await cx.settle();
  assert.deepEqual(state.shared.get(KEY), { w1: { kind: "emoji", char: chars[0] } });
  assert.deepEqual(state.closed, ["ov1"]);
});

test("a typed word is refused with a message and writes nothing", async () => {
  const { dialog, cx } = open();
  dialog.applyEmoji("fox", cx);
  await cx.settle();
  assert.ok(dialog.error);
  assert.equal(state.shared.get(KEY), undefined);
  assert.deepEqual(state.closed, []);
});

test("a colour applies live and keeps the dialog open; transparent included, a bad hex refused", async () => {
  const { dialog, cx, draw } = open();
  dialog.tab = "color";
  draw();
  nodes.get("si-color-ansi3").click(null, cx);
  assert.deepEqual(state.shared.get(COLORS_KEY), { w1: "ansi3" });
  draw();
  nodes.get("si-color-transparent").click(null, cx);
  assert.deepEqual(state.shared.get(COLORS_KEY), { w1: "transparent" });
  dialog.setColor("#zzz", cx);
  assert.ok(dialog.error);
  assert.deepEqual(state.shared.get(COLORS_KEY), { w1: "transparent" });
  assert.deepEqual(state.closed, []);
});

test("a PNG is kept under space-icons/; an SVG then replaces it and the PNG is deleted", async () => {
  const { dialog, cx } = open();
  const pngPath = join(root, "logo.png");
  writeFileSync(pngPath, png(64, 64));
  dialog.applyImage(pngPath, cx);
  await cx.settle();
  assert.equal(dialog.error, null);
  const first = state.shared.get(KEY).w1;
  assert.equal(first.kind, "image");
  assert.match(first.file, /^space-icons\/w1-\d+\.png$/);
  assert.ok(existsSync(join(state.appHome, first.file)));

  const svgPath = join(root, "logo.svg");
  writeFileSync(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>');
  const again = open();
  again.dialog.applyImage(svgPath, again.cx);
  await again.cx.settle();
  const second = state.shared.get(KEY).w1;
  assert.match(second.file, /^space-icons\/w1-\d+\.svg$/);
  assert.ok(existsSync(join(state.appHome, second.file)));
  assert.equal(existsSync(join(state.appHome, first.file)), false);
  assert.deepEqual(state.closed, ["ov1", "ov1"]);
});

test("a PNG that isn't square is refused and nothing is kept", async () => {
  const { dialog, cx } = open();
  const path = join(root, "wide.png");
  writeFileSync(path, png(64, 32));
  dialog.applyImage(path, cx);
  await cx.settle();
  assert.match(dialog.error, /Not square/);
  assert.equal(state.shared.get(KEY), undefined);
  assert.equal(existsSync(join(state.appHome, "space-icons")), false);
});

test("Use letter removes the icon and deletes its kept image", async () => {
  mkdirSync(join(state.appHome, "space-icons"), { recursive: true });
  writeFileSync(join(state.appHome, "space-icons/w1-1.png"), png(64, 64));
  state.shared.set(KEY, { w1: { kind: "image", file: "space-icons/w1-1.png" }, w2: { kind: "emoji", char: "🦊" } });
  const { cx } = open();
  nodes.get("si-reset").click(null, cx);
  await cx.settle();
  assert.deepEqual(state.shared.get(KEY), { w2: { kind: "emoji", char: "🦊" } });
  assert.equal(existsSync(join(state.appHome, "space-icons/w1-1.png")), false);
  assert.deepEqual(state.closed, ["ov1"]);
});
