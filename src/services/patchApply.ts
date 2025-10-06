// src/services/patchApply.ts
import fs from "node:fs";
import path from "node:path";
import { findRoot } from "../core/root.js";
import { log } from "../core/logger.js";

/**
 * Apply an LLM-style patch block (*** Begin Patch ... *** End Patch).
 * Supports:
 *  - *** Add File: <relative-path>
 *  - *** Update File: <relative-path>
 *
 * For Update File blocks we replace the whole file with the '+' body.
 * The '-' body is used only for a light sanity check (we still apply even if it drifts).
 */
export async function applyPatchText(patchText: string, cwd: string = process.cwd()) {
  const root = await findRoot(cwd);
  if (!root) throw new Error("No repo root found");
  if (!patchText?.trim()) {
    log.warn("Empty patch text — nothing to apply.");
    return;
  }
  if (!patchText.includes("*** Begin Patch")) {
    // Not our custom format; let unified-diff path handle it.
    log.warn("Patch doesn't use LLM patch format; skipping custom apply.");
    return;
  }

  for (const block of splitIntoBlocks(patchText)) {
    if (block.kind === "add") {
      const abs = path.join(root, block.relPath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, ensureNL(block.content), "utf-8");
      log.ok(`Added ${block.relPath}`);
    } else {
      const abs = path.join(root, block.relPath);
      const prev = fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : null;
      const next = ensureNL(block.newContent);

      if (prev !== null && block.oldContent !== null && norm(prev) !== norm(block.oldContent)) {
        log.warn(`Content drift for ${block.relPath} — applying new content anyway.`);
      }
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, next, "utf-8");
      log.ok(`Updated ${block.relPath}`);
    }
  }
}

type AddBlock = { kind: "add"; relPath: string; content: string };
type UpdateBlock = { kind: "update"; relPath: string; oldContent: string | null; newContent: string };
type Block = AddBlock | UpdateBlock;

function splitIntoBlocks(text: string): Block[] {
  const src = text.replace(/\r\n/g, "\n");
  const blocks: Block[] = [];
  const re = /\*\*\*\s*Begin Patch([\s\S]*?)\*\*\*\s*End Patch/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(src))) {
    const body = m[1];

    // *** Add File: path
    const add = body.match(/\*\*\*\s*Add File:\s*(.+)\n([\s\S]*)/);
    if (add) {
      blocks.push({
        kind: "add",
        relPath: add[1].trim(),
        content: stripPrefixed(add[2], "+"),
      });
      continue;
    }

    // *** Update File: path
    const upd = body.match(/\*\*\*\s*Update File:\s*(.+)\n([\s\S]*)/);
    if (upd) {
      const rel = upd[1].trim();
      let after = upd[2];
      // '@@' delimiters appear around the body; keep the section between them (if present)
      const first = after.indexOf("\n@@\n");
      if (first >= 0) {
        after = after.slice(first + 4);
        const second = after.indexOf("\n@@\n");
        if (second >= 0) after = after.slice(0, second);
      }
      const oldContent = collectPrefixed(after, "-");
      const newContent = collectPrefixed(after, "+");
      blocks.push({ kind: "update", relPath: rel, oldContent: oldContent || null, newContent });
      continue;
    }
  }
  return blocks;
}

function stripPrefixed(s: string, prefix: string) {
  return s
    .split("\n")
    .filter(l => l.length > 0)
    .map(l => (l.startsWith(prefix) ? l.slice(prefix.length) : l))
    .join("\n");
}
function collectPrefixed(s: string, prefix: string) {
  return s
    .split("\n")
    .filter(l => l.startsWith(prefix))
    .map(l => l.slice(prefix.length))
    .join("\n");
}
const ensureNL = (s: string) => (s.endsWith("\n") ? s : s + "\n");
const norm = (s: string) => s.replace(/\r\n/g, "\n").trimEnd();
