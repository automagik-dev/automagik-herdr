// A stand-in for gpui-kit and gpui-base, enough to run create.js's form under `node --test`:
// every element is a node that records its id, text children, click handler, tooltip and
// opacity; any style method returns the element itself. `when` and `map` run their callback
// as gpui does. Not Herdr: the form's look is checked live.
export const nodes = new Map(); // id -> node, of the tree index() last walked

function element(kind, arg) {
  const node = { kind, arg, kids: [], props: {} };
  const api = {
    child: (c) => { node.kids.push(c); return proxy; },
    children: (cs) => { node.kids.push(...cs); return proxy; },
    content: (c) => { node.kids.push(c); return proxy; },
    trigger: (c) => { node.kids.push(c); return proxy; },
    when: (cond, fn) => (cond ? fn(proxy) : proxy),
    map: (fn) => fn(proxy),
    id: (x) => { node.id = x; return proxy; },
    on_click: (h) => { node.click = h; return proxy; },
    tooltip: (x) => { node.props.tooltip = x; return proxy; },
    opacity: (x) => { node.props.opacity = x; return proxy; },
  };
  const proxy = new Proxy(node, {
    get(_t, prop) {
      if (prop === "__node") return node;
      if (prop === "then" || typeof prop === "symbol") return undefined;
      return api[prop] ?? (() => proxy);
    },
  });
  if (kind === "button" || kind === "popover") api.id(arg);
  return proxy;
}

/** Fills `nodes` with every element under `root` that has an id (only what is drawn). */
export function index(root) {
  nodes.clear();
  const walk = (x) => {
    const node = x?.__node;
    if (!node) return;
    if (node.id !== undefined) nodes.set(node.id, node);
    node.kids.forEach(walk);
  };
  walk(root);
  return root;
}

/** Every text inside an element, in order. */
export function textOf(x) {
  if (x === null || x === undefined || typeof x === "boolean") return "";
  if (typeof x === "string" || typeof x === "number") return String(x);
  const node = x.__node ?? x;
  return (node.kids ?? []).map(textOf).filter(Boolean).join(" ");
}

export const div = () => element("div");
export const svg = (path) => element("svg", path);
export const image = (path) => element("image", path);
export const h_flex = () => element("h_flex");
export const v_flex = () => element("v_flex");
export class View {}
export const Button = { new: (id) => element("button", id) };
export const Popover = { new: (id) => element("popover", id) };
export const Input = { new: (state) => element("input", state) };
export const Textarea = { new: (state) => element("textarea", state) };

function textState({ value = "" } = {}) {
  let v = value;
  const on = {};
  return {
    value: () => v,
    set_value: (x) => { v = String(x); },
    on: (event, h) => { on[event] = h; return true; },
    type: (x, cx) => { v = x; on.change?.(null, cx); }, // a test typing into the field
    set_auto_grow() {}, set_rows() {}, focus() {}, release: () => true,
  };
}
export const InputState = { new: textState };
export const TextareaState = { new: textState };
