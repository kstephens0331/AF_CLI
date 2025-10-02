import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import ignore from "ignore";
import { findRoot } from "./root.js";

export type FileEntry = { path: string; size: number };

export async function listProjectFiles(cwd: string, includeHidden = false) {
  const root = await findRoot(cwd);
  if (!root) throw new Error("No root");
  const ig = ignore().add([".git", ".af", "node_modules", "**/*.lock"]);
  const entries: FileEntry[] = [];
  const paths = await fg(["**/*"], { cwd: root, dot: includeHidden });
  for (const rel of paths) {
    if (ig.ignores(rel)) continue;
    const abs = path.join(root, rel);
    const stat = fs.statSync(abs);
    if (stat.isFile()) entries.push({ path: rel, size: stat.size });
  }
  return entries;
}

export async function readFileInRoot(cwd: string, relPath: string) {
  const root = await findRoot(cwd);
  if (!root) throw new Error("No root");
  const abs = path.normalize(path.join(root, relPath));
  if (!abs.startsWith(root)) throw new Error("Write outside root blocked");
  return fs.readFileSync(abs, "utf-8");
}

export async function writeFileInRoot(cwd: string, relPath: string, content: string) {
  const root = await findRoot(cwd);
  if (!root) throw new Error("No root");
  const abs = path.normalize(path.join(root, relPath));
  if (!abs.startsWith(root)) throw new Error("Write outside root blocked");
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}
