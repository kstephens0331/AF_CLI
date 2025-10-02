import fs from "node:fs";
import path from "node:path";
import { listProjectFiles, readFileInRoot } from "../core/sandbox.js";
import { findRoot } from "../core/root.js";

export type IndexEntry = {
  path: string;
  size: number;
  lines: number;
  ext: string;
};

export async function buildRepoIndex(cwd: string) {
  const files = await listProjectFiles(cwd, false);
  const root = (await findRoot(cwd)) as string;
  const items: IndexEntry[] = [];
  for (const f of files) {
    const content = await readFileInRoot(cwd, f.path);
    items.push({
      path: f.path,
      size: f.size,
      lines: content.split(/\r?\n/).length,
      ext: path.extname(f.path).toLowerCase()
    });
  }
  const outDir = path.join(root, ".af/cache");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "repo-index.json");
  fs.writeFileSync(outPath, JSON.stringify({ builtAt: new Date().toISOString(), items }, null, 2));
  return outPath;
}
