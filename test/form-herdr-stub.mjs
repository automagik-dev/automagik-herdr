// herdr-stub.mjs plus what the bot form (create.js) also imports: theme, settings, the folder
// picker and overlays (closed ones are logged in state.closed).
export * from "./herdr-stub.mjs";
import { state } from "./herdr-stub.mjs";

state.closed = [];
export const theme = () => ({
  background: "#0e1117", surface: "#11151d", chrome: "#0b0e14", popover: "#161b24", raised: "#161b24", hover: "#1a2130",
  selected: "#1f2735", border: "#2a3242", input: "#2a3242", foreground: "#e6eaf0", muted: "#8b93a3", dim: "#5d6577",
  accent: "#22d3ee", accent_foreground: "#06232a", solid: "#e6eaf0", solid_foreground: "#0e1117", ansi1: "#e06c75", ansi3: "#e5c07b",
});
export const settings = () => ({});
export const pickFolder = async () => state.pickFolder ?? null;
export const openOverlay = (spec) => { (state.opened ??= []).push(spec); return "o1"; };
export const closeOverlay = (id) => { state.closed.push(id); return null; };
