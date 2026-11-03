// The Space Row's elements (docs/space-row-rendering.md): line 2 of a space row, a hover card
// under each of its chips, and a bot row's stats button with its card. View models come from
// spaceRow.js; this file only draws them. Pies are drawn with the window's paint_path: the
// gpui `window` global, which main.js can't reach (it imports Herdr's `window()` by that name).
// Apache-2.0.

import { div, svg, PathBuilder } from "gpui-kit";
import { v_flex, h_flex, HoverCard } from "gpui-base";
import { DASH, DETAIL_ROWS, colorOf, pieAngles, polar, sliceAt, PULL } from "./spaceRow.js";

/** The hover cards' timing, from the mock: intent before opening, grace before closing. */
export const OPEN_MS = 260;
export const CLOSE_MS = 350;

const ICON = (name) => `mods/am-sidebar/icons/${name}.svg`;
const MONO = "Menlo";
const PIE = 120, R = 54, C = PIE / 2;

const ICON_TINT = { github: "dim", gitlab: "ansi3", merge: "ansi2", clock: "dim", first: "ansi2", spent: "ansi3", tokens: "ansi5" };

/**
 * What a card needs from the view between renders: which chip or button was hovered last (only
 * its card is built), which pie slice is pulled out, and a notify. `ui` is plain state on the
 * view: { lastCard: id | null, pie: { id, index } }.
 */
const pieOf = (ui, id) => (ui.pie?.id === id ? ui.pie.index : -1);

function setPie(ui, id, index, cx) {
  if (pieOf(ui, id) === index) return;
  ui.pie = { id, index };
  cx.notify();
}

// ---- line 2

function chipEl(c, id, t) {
  const tint = t[ICON_TINT[c.icon]] ?? t.dim;
  let el = h_flex().id(id).flex_none().gap(3).items_center().h(18).px(2).rounded(4).cursor_default()
    .child(svg(ICON(c.icon)).size(12).flex_none().text_color(c.na ? t.dim : tint));
  if (c.key === "forge") return el;
  el = el.child(div().flex_none().font_family(MONO).text_size(11.5).text_color(c.na ? t.dim : t.foreground).child(c.value));
  if (c.arrow) el = el.child(div().flex_none().text_size(8).text_color(c.arrow.good ? t.ansi2 : t.ansi1).child(c.arrow.glyph));
  return el;
}

/**
 * Line 2 of a space row: the chips in one line that clips rather than wraps, each opening its
 * card under it. `cards`: cardsOf(); `key`: unique per space row.
 */
export function lineTwoEl(chips, cards, key, t, ui) {
  return h_flex().id(`l2-${key}`).h(18).min_w(0).overflow_hidden().whitespace_nowrap().gap(9).items_center()
    .children(chips.map((c) => {
      const id = `chip-${key}-${c.key}`;
      const card = cards?.[c.key];
      const trigger = chipEl(c, id, t).on_hover((over, cx) => {
        if (over && ui.lastCard !== id) { ui.lastCard = id; cx.notify(); }
      });
      if (!card) return trigger;
      return HoverCard.new(`hc-${id}`).open_delay(OPEN_MS).close_delay(CLOSE_MS).anchor("top_left")
        .trigger(trigger)
        .content(ui.lastCard === id ? cardEl(card, id, t, ui) : div());
    }));
}

// ---- cards

function frame(id, t) {
  return v_flex().id(`card-${id}`).w(300).p(10).gap(6).rounded(8).bg(t.popover).border_1().border_color(t.border).shadow_lg()
    .text_size(11.5).text_color(t.foreground);
}

function header(card, t) {
  return h_flex().gap(6).items_start()
    .child(svg(ICON(card.icon)).size(13).mt(2).flex_none().text_color(t[ICON_TINT[card.icon]] ?? t.dim))
    .child(div().flex_1().min_w(0).text_size(12.5).font_weight(500).child(card.title))
    .child(v_flex().flex_none().items_end()
      .child(div().font_family(MONO).text_size(17).font_weight(500).text_color(card.big === DASH ? t.dim : t.foreground).child(card.big))
      .when(Boolean(card.was), (el) => el.child(div().font_family(MONO).text_size(10.5).text_color(t.muted).child(card.was))));
}

const foot = (text, t) => div().text_size(10.5).text_color(t.dim).child(text || "");

/** A card, by its kind; `id` keys its elements and its pie. */
export function cardEl(card, id, t, ui) {
  let el = frame(id, t).child(header(card, t));
  if (card.empty) return el; // the whole section is null: the "–" header, nothing else
  if (card.sub) el = el.child(div().text_size(11).text_color(t.muted).child(card.sub));
  if (card.big !== DASH || card.pie.some((s) => s.value > 0)) el = el.child(pizza(card.pie, `${id}-pie`, t, ui));
  if (card.stats) el = el.child(h_flex().gap(4).children(card.stats.map((s) => statCell(s, t))));
  return el.child(foot(card.foot, t));
}

function statCell(s, t) {
  return v_flex().flex_1().min_w(0).px(7).py(5).rounded(6).bg(t.hover)
    .child(div().text_size(9.5).text_color(t.dim).child(s.label.toUpperCase()))
    .child(div().font_family(MONO).text_size(13).font_weight(600).text_color(s.color ? colorOf(s.color, t) : t.foreground).child(s.value))
    .when(Boolean(s.task), (el) => el.child(link(s.task, s.url, t)));
}

function link(task, url, t) {
  const el = div().id(`link-${task}-${url ?? ""}`).truncate().font_family(MONO).text_size(10).text_color(t.dim).child(task);
  return url ? el.cursor_pointer().hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => cx.open_url(url)) : el;
}

// ---- the pizza

function slicePath(s, pulled, stroke) {
  const [ox, oy] = pulled ? polar(0, 0, PULL, s.mid) : [0, 0];
  const b = stroke ? PathBuilder.stroke(1.6) : PathBuilder.fill();
  if (s.share >= 0.9999) {
    const [tx, ty] = polar(C + ox, C + oy, R, 0), [bx, by] = polar(C + ox, C + oy, R, Math.PI);
    return b.move_to(tx, ty).arc_to(R, R, 0, false, true, bx, by).arc_to(R, R, 0, false, true, tx, ty).close().build();
  }
  const [x0, y0] = polar(C + ox, C + oy, R, s.start), [x1, y1] = polar(C + ox, C + oy, R, s.end);
  return b.move_to(C + ox, C + oy).line_to(x0, y0).arc_to(R, R, 0, s.end - s.start > Math.PI, true, x1, y1).close().build();
}

const layer = (path, color) => window.paint_path(path, color).absolute().top(0).left(0).size(PIE);

/**
 * A pie in the "pizza" style: slices from 12 o'clock clockwise; hovering a slice or its legend
 * entry pulls it out 4 px, dims the others and shows its detail under the pie.
 */
function pizza(parts, id, t, ui) {
  const angles = pieAngles(parts.map((p) => p.value));
  const on = pieOf(ui, id);
  const drawn = parts.map((p, i) => [p, angles[i], i]).filter(([, a]) => a.end > a.start);
  const pie = div().id(id).relative().size(PIE).flex_none()
    .on_mouse_move((e, cx) => setPie(ui, id, e.local_position ? sliceAt(angles, e.local_position.x, e.local_position.y, C, C, R + PULL) : -1, cx))
    .on_hover((over, cx) => { if (!over) setPie(ui, id, -1, cx); })
    .children(drawn.flatMap(([p, a, i]) => {
      const color = colorOf(p.color, t);
      const dim = on !== -1 && on !== i;
      return [layer(slicePath(a, on === i, false), color).opacity(dim ? 0.35 : 1), layer(slicePath(a, on === i, true), t.popover)];
    }))
    .children(drawn.filter(([p, a]) => a.show && p.inside).map(([p, a, i]) => {
      const [x, y] = polar(C, C, R * 0.62, a.mid);
      return div().absolute().left(x - 14).top(y - 7).w(28).h(14).text_center().font_family(MONO).text_size(9.5).font_weight(600)
        .text_color(t.popover).opacity(on !== -1 && on !== i ? 0.35 : 1).child(p.inside);
    }));
  const legend = v_flex().flex_1().min_w(0).gap(4).children(parts.map((p, i) => h_flex().id(`${id}-lg-${i}`).gap(6).items_center().min_w(0)
    .on_hover((over, cx) => setPie(ui, id, over ? i : -1, cx))
    .child(div().size(8).flex_none().rounded_full().bg(p.value > 0 ? colorOf(p.color, t) : t.border))
    .child(div().flex_1().min_w(0).truncate().text_color(on === i ? t.foreground : t.muted).child(p.label))
    .when(Boolean(p.legend), (el) => el.child(div().flex_none().font_family(MONO).text_size(10.5).text_color(p.legend === DASH ? t.dim : t.foreground).child(p.legend)))));
  const d = on === -1 ? null : parts[on]?.detail;
  return v_flex().gap(6)
    .child(h_flex().gap(14).items_center().child(pie).child(legend))
    .child(d ? detailEl(d, t) : div().h(0));
}

function detailEl(d, t) {
  let el = v_flex().gap(4).pt(6).border_t(1).border_color(t.border)
    .child(div().font_weight(600).text_size(11).child(d.title));
  if (d.cells) el = el.child(h_flex().flex_wrap().gap(3).children(d.cells.map(([k, v]) => v_flex().w(88).px(6).py(4).rounded(5).bg(t.hover)
    .child(div().text_size(9.5).text_color(t.dim).child(k.toUpperCase()))
    .child(div().font_family(MONO).text_size(11.5).font_weight(600).text_color(v === DASH ? t.dim : t.foreground).child(v)))));
  if (d.rows?.length) el = el.child(h_flex().flex_wrap().gap(3).children(d.rows.slice(0, DETAIL_ROWS).map((r) => h_flex().w(88).px(6).py(3).rounded(5).bg(t.hover).justify_between()
    .child(link(r.task, r.url, t).text_color(t.foreground)).child(div().font_family(MONO).text_size(10.5).text_color(t.muted).child(r.value)))));
  if ((d.rows?.length ?? 0) > DETAIL_ROWS) el = el.child(div().text_size(10.5).text_color(t.dim).child(`+${d.rows.length - DETAIL_ROWS}`));
  return el;
}

// ---- the bot row's stats button

/**
 * The three-bars button of a bot row: in the layout always (hovering a row changes no layout),
 * seen only while `shown`; its card opens from the button only. `card`: botCard().
 */
export function statsButtonEl(card, key, shown, t, ui) {
  const id = `stats-${key}`;
  const button = div().id(id).flex_none().size(20).rounded(5).flex().items_center().justify_center()
    .opacity(shown ? 1 : 0).text_color(t.dim)
    .when(shown, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => cx.stop_propagation())
    .on_hover((over, cx) => { if (over && ui.lastCard !== id) { ui.lastCard = id; cx.notify(); } })
    .child(svg(ICON("stats")).size(12));
  if (!card) return button;
  return HoverCard.new(`hc-${id}`).open_delay(OPEN_MS).close_delay(CLOSE_MS).anchor("top_right")
    .trigger(button)
    .content(ui.lastCard === id ? botCardEl(card, id, t) : div());
}

/** The bot card: three numbers, one bar, the legend with $. */
export function botCardEl(card, id, t) {
  const cell = ([k, v]) => v_flex().flex_1().min_w(0).px(7).py(5).rounded(6).bg(t.hover)
    .child(div().text_size(9.5).text_color(t.dim).child(k.toUpperCase()))
    .child(div().font_family(MONO).text_size(13).font_weight(600).text_color(v === DASH ? t.dim : t.foreground).child(v));
  let el = v_flex().id(`card-${id}`).w(260).p(10).gap(6).rounded(8).bg(t.popover).border_1().border_color(t.border).shadow_lg()
    .text_size(11.5).text_color(t.foreground)
    .child(div().text_size(12.5).font_weight(600).truncate().child(card.title))
    .child(h_flex().gap(4).children(card.cells.map(cell)));
  if (card.bar.length) el = el.child(h_flex().h(8).mt(4).gap(1).rounded(3).overflow_hidden()
    .children(card.bar.map((b) => div().h_full().flex_none().w(Math.max(1, Math.round(b.share * (240 - (card.bar.length - 1))))).bg(colorOf(b.color, t)))));
  el = card.empty
    ? el.child(div().text_size(11).text_color(t.dim).child("no breakdown yet"))
    : el.child(v_flex().gap(1).children(card.legend.map((x) => h_flex().h(17).gap(6).items_center().min_w(0)
      .child(div().size(8).flex_none().rounded(2).bg(colorOf(x.color, t)))
      .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(x.label))
      .child(div().flex_none().font_family(MONO).text_size(11).font_weight(600).text_color(x.value === DASH ? t.dim : t.foreground).child(x.value)))));
  return el.child(foot(card.foot, t));
}
