// The `herdr` surface md-menu needs beyond what herdr-stub already models: props and panes the test
// sets, a theme, key bindings, and the overlay/command calls the mod makes. Everything else —
// exec, hc, shared, setShared, focused, run — comes from herdr-stub unchanged.
export * from "./herdr-stub.mjs";

export const ui = {
  props: null,
  panes: [],
  overlays: [],
  closed: 0,
  theme: {
    background: "#000", foreground: "#fff", border: "#333", muted: "#888", dim: "#777",
    popover: "#111", selected: "#222", hover: "#2a2a2a", blocked: "#f00", accent: "#0af", done: "#0f0",
  },
};

export const props = () => ui.props;
export const panes = () => ui.panes;
export const theme = () => ui.theme;
export const keys = () => [];
export const window = () => ({ platform: "macos" });
export const layout = () => ({});
// No key press in these tests: the command loop waits, as a real pane's would until a binding fires.
export const nextCommand = () => new Promise(() => {});
export const closeOverlay = () => { ui.closed += 1; };
export const openOverlay = (o) => { ui.overlays.push(o); };
