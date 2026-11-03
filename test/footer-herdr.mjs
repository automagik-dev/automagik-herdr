// The `herdr` surface am-footer (the footer) needs beyond am-markdown-herdr.mjs: Herdr's update
// state, and an app home the test points at a scratch folder (state.appHome).
import { state } from "./herdr-stub.mjs";
export * from "./am-markdown-herdr.mjs";

export const updates = () => ({ app: {} });

// No folder watch under node: it rejects, as Herdr's does on a Linux tree too big to watch, and the
// footer keeps its 30 s timer. A test can set state.watch to answer batches itself.
export const watchFolder = (dir) => (state.watch ? state.watch(dir) : Promise.reject(new Error("no watch in tests")));
