// Import first: makes the pack's `herdr` and `fs/promises` imports resolve to the stand-ins
// (herdr-stub.mjs, fs-stub.mjs), then hands back the stub's state.
import { registerHooks } from "node:module";

const stubs = {
  herdr: new URL("./herdr-stub.mjs", import.meta.url).href,
  "fs/promises": new URL("./fs-stub.mjs", import.meta.url).href,
};
const fromPack = (context) => context.parentURL?.includes("/mods/spaces-agents/");
registerHooks({
  resolve: (specifier, context, next) =>
    (stubs[specifier] && (specifier === "herdr" || fromPack(context)) ? { url: stubs[specifier], shortCircuit: true } : next(specifier, context)),
});
export const { state } = await import(stubs.herdr);
