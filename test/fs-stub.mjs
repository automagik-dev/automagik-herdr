// Herdr's `fs/promises` for a mod, as gpui-kit.d.ts declares it: these seven functions and
// nothing else (no access, stat, rename), so bots.js calling another one fails under test.
import * as fs from "node:fs/promises";

export const readFile = (path, encoding) => fs.readFile(path, encoding);
export const writeFile = (path, contents) => fs.writeFile(path, contents);
export const readdir = (path, options) => fs.readdir(path, options);
export const exists = (path) => fs.access(path).then(() => true, () => false);
export const unlink = (path) => fs.unlink(path);
export const rmdir = (path) => fs.rmdir(path);
export const mkdir = (path, options) => fs.mkdir(path, options).then(() => undefined);
