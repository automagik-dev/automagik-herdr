#!/usr/bin/env node
// herdr-bots: the old name of `automagik-herdr` (A15). It says so in one line on stderr and
// runs the same command, so a line copied before the rename still works. Apache-2.0.
import { main } from "./automagik-herdr.mjs";

process.stderr.write("herdr-bots is now automagik-herdr; this name still works for now.\n");
process.exitCode = await main(process.argv.slice(2));
