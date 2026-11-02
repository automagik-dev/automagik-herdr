// The briefing hook's fixed entry point (Group 6b). The pack copies this file to
// <app home>/automagik-herdr/briefing.mjs, outside mods/, and every Claude bot's and worker's
// hook runs that copy. It runs the briefing.mjs of whichever sidebar folder is installed
// (mods/am-sidebar, else mods/spaces-agents), so a hook survives the folder's rename and a
// rollback across it. briefing.mjs runs only as the program node started, so the script becomes
// argv[1] before it is imported (stdin, env and exit code stay this process's). Fail-open like
// briefing.mjs: no folder, nothing printed, exit 0. The installer and updater replace the copy;
// edits to it are lost. Apache-2.0.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const mods = join(dirname(dirname(fileURLToPath(import.meta.url))), "mods");
const target = ["am-sidebar", "spaces-agents"].map((m) => join(mods, m, "briefing.mjs")).find((p) => existsSync(p));
if (target) {
  process.argv[1] = target;
  try {
    await import(pathToFileURL(target).href);
  } catch (e) {
    process.stderr.write(`automagik-herdr briefing: ${String(e?.message ?? e).split("\n")[0]}\n`);
    process.exitCode = 0;
  }
}
