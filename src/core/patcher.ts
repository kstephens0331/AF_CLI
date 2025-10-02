import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { findRoot } from "./root.js";

export type PatchMode = "auto" | "whole-file-only" | "hunks";

export async function applyUnifiedDiff(cwd: string, diffText: string, mode: PatchMode = "auto") {
  const root = await findRoot(cwd);
  if (!root) throw new Error("No root");

  // Always save a patch artifact
  const tmpDir = path.join(root, ".af/tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const patchPath = path.join(tmpDir, `patch-${Date.now()}.diff`);
  fs.writeFileSync(patchPath, diffText, "utf-8");

  // If it contains our whole-file marker, do the simple path
  const hasWholeFileMarker = diffText.includes("@@ REPLACE-WHOLE-FILE @@");

  if (mode === "whole-file-only" || (mode === "auto" && hasWholeFileMarker)) {
    await applyWholeFileDiff(root, diffText);
    return;
  }

  // Otherwise attempt granular hunks via git apply 3-way
  try {
    await execa("git", ["apply", "--3way", "--reject", "--whitespace=fix", patchPath], {
      stdio: "inherit",
      cwd: root
    });
  } catch (e) {
    const rejects = findRejects(root);
    const msg = rejects.length
      ? `Some hunks failed. Reject files:\n${rejects.map((r) => ` - ${r}`).join("\n")}`
      : "git apply failed. Check patch format or rebase your changes.";
    throw new Error(msg);
  }
}

function findRejects(root: string) {
  const rejects: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir)) {
      const p = path.join(dir, entry);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) walk(p);
      else if (p.endsWith(".rej")) rejects.push(path.relative(root, p));
    }
  }
  walk(root);
  return rejects;
}

async function applyWholeFileDiff(root: string, diffText: string) {
  // Naive whole-file replacer driven by our marker.
  const files = splitByFile(diffText);
  const backupDir = path.join(root, ".af/backups", Date.now().toString());
  fs.mkdirSync(backupDir, { recursive: true });
  const touched: string[] = [];

  try {
    for (const chunk of files) {
      const rel = chunk.targetPath;
      const abs = path.join(root, rel);
      if (fs.existsSync(abs)) {
        const backupPath = path.join(backupDir, rel.replace(/[\\/]/g, "__"));
        fs.mkdirSync(path.dirname(backupPath), { recursive: true });
        fs.copyFileSync(abs, backupPath);
      }
      const newContent = materializeWholeFile(chunk);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, newContent);
      touched.push(abs);
    }
  } catch (e) {
    // rollback
    for (const abs of touched) fs.rmSync(abs, { force: true });
    for (const entry of fs.readdirSync(backupDir)) {
      const abs = path.join(backupDir, entry);
      const origRel = entry.replace(/__/g, path.sep);
      const dest = path.join(root, origRel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(abs, dest);
    }
    throw e;
  }
}

type FileChunk = { targetPath: string; hunks: string[] };

function splitByFile(diff: string): FileChunk[] {
  const lines = diff.split("\n");
  const files: FileChunk[] = [];
  let current: FileChunk | null = null;

  for (const line of lines) {
    if (line.startsWith("+++ ")) {
      const p = line.replace("+++ b/", "").trim();
      current = { targetPath: p, hunks: [] };
      files.push(current);
    } else if (current) {
      current.hunks.push(line);
    }
  }
  return files;
}

function materializeWholeFile(chunk: FileChunk) {
  const idx = chunk.hunks.findIndex((l) => l.includes("@@ REPLACE-WHOLE-FILE @@"));
  if (idx === -1) throw new Error(`Patch missing @@ REPLACE-WHOLE-FILE @@ for ${chunk.targetPath}`);
  return chunk.hunks.slice(idx + 1).join("\n");
}
