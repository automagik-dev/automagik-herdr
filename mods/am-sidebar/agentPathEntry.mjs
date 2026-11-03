// `sh bin/run.sh agentPathEntry.mjs <program>`: the sidebar's Start (launch.js seatPath) asks
// here for the PATH a bot's agent needs (#56), since Herdr loads no `node:` module and so can't
// import agentPath.mjs. Prints one JSON line, { path, note }: `path` is this PATH with the
// agent's interpreter folder put first, or null when interpreterPath leaves PATH as it is;
// `note` is its line for the person, or null. Not loaded by Herdr. Apache-2.0.
import { interpreterPath } from "./agentPath.mjs";

const program = process.argv[2] ?? "";
const got = program ? interpreterPath(program, process.env.PATH) : { path: process.env.PATH, note: null };
process.stdout.write(`${JSON.stringify({ path: got.path !== process.env.PATH ? got.path : null, note: got.note })}\n`);
