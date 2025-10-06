// src/services/scaffold.ts
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import _os from "node:os";
import { execa } from "execa";
import yaml from "js-yaml";

type DirStrategy = "auto" | "root" | "subdir" | "temp-merge";

export type ScaffoldOptions = {
  /** Where the product spec lives */
  specPath?: string; // default: ./product.spec.yml
  /** Strategy for non-empty roots */
  strategy?: DirStrategy; // default: "auto"
  /** When strategy==="subdir", use this name */
  subdirName?: string; // default: "web"
  /** Extra flags to pass to create-next-app */
  cnaFlags?: string[]; // default provided below
};

const DEFAULT_FLAGS = [
  "--ts",
  "--eslint",
  "--app",
  "--tailwind",
  "--import-alias",
  "@/*",
  "--use-npm",
  "--yes",
  "--no-git",
];

function exists(p: string) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isDirEmpty(dir: string) {
  const entries = fs.readdirSync(dir).filter((n) => n !== "." && n !== "..");
  return entries.length === 0;
}

function listRootConflicts(dir: string) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .map((d) => d.name)
    .filter((n) => n !== "." && n !== "..");
}

function safeRm(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

async function copyDir(src: string, dst: string) {
  // Node 18+: fs.cp is available
  // Fallback to manual copy if needed.
  const cp: any = (fs as any).cp;
  if (cp) {
    await fsp.mkdir(dst, { recursive: true });
    await (fsp as any).cp(src, dst, {
      recursive: true,
      filter: (srcPath: string) => {
        const base = path.basename(srcPath);
        // skip heavy/irrelevant dirs
        return ![".git", "node_modules", ".next"].includes(base);
      },
    });
  } else {
    // Minimal manual copy
    const entries = await fsp.readdir(src, { withFileTypes: true });
    await fsp.mkdir(dst, { recursive: true });
    for (const e of entries) {
      if ([".git", "node_modules", ".next"].includes(e.name)) continue;
      const s = path.join(src, e.name);
      const d = path.join(dst, e.name);
      if (e.isDirectory()) {
        await copyDir(s, d);
      } else if (e.isFile()) {
        await fsp.copyFile(s, d);
      }
    }
  }
}

function loadSpec(specPath: string): any | null {
  if (!exists(specPath)) return null;
  const text = fs.readFileSync(specPath, "utf8");
  try {
    const doc = yaml.load(text);
    return doc ?? null;
  } catch {
    // If the file is temporarily invalid, just ignore for now
    return null;
  }
}

function saveSpec(specPath: string, spec: any) {
  const out = yaml.dump(spec, { lineWidth: 120 });
  fs.writeFileSync(specPath, out, "utf8");
}

/**
 * Ensure there's a Next.js app scaffolded, respecting non-empty folders.
 * - If root is empty and strategy allows: scaffold at root (".")
 * - Else if strategy=subdir: scaffold at ./subdirName
 * - Else temp-merge: scaffold in .af/_bootstrap then merge into root
 * Also ensures `frontendRoot` is set in product.spec.yml.
 */
export async function scaffoldNextApp(cwd: string, opts: ScaffoldOptions = {}) {
  const specPath = path.join(cwd, opts.specPath ?? "product.spec.yml");
  const spec = loadSpec(specPath) || {};
  const cnaFlags = opts.cnaFlags ?? DEFAULT_FLAGS;

  // Preferred location from spec (if present)
  const frontendRoot: string | undefined = spec.frontendRoot;

  // Determine strategy
  const strategy: DirStrategy = (() => {
    if (opts.strategy) return opts.strategy;
    return "auto";
  })();

  const repoEmpty = isDirEmpty(cwd);

  // Decide actual target directory
  let targetDir = ".";
  if (frontendRoot && frontendRoot !== ".") {
    targetDir = frontendRoot;
  } else if (!repoEmpty) {
    // root not empty: avoid create-next-app at "."
    if (strategy === "root") {
      // We *could* attempt temp-merge automatically to still honor "root"
      // but "auto" is safer; fall through like "auto".
    }
    if (strategy === "subdir" || strategy === "auto") {
      targetDir = opts.subdirName ?? "web";
    } else {
      targetDir = "."; // temp-merge will handle "root in non-empty"
    }
  } else {
    targetDir = "."; // empty root is fine
  }

  // If we need a subdir, ensure it exists
  if (targetDir !== "." && !exists(path.join(cwd, targetDir))) {
    fs.mkdirSync(path.join(cwd, targetDir), { recursive: true });
  }

  // If target is root and root is not empty, do temp-merge flow.
  if (targetDir === "." && !repoEmpty) {
    // temp-merge
    const tempDir = path.join(cwd, ".af", "_bootstrap");
    safeRm(tempDir);
    fs.mkdirSync(tempDir, { recursive: true });

    console.log("📦 Non-empty repo detected. Scaffolding in temporary folder and merging…");
    await execa("npx", ["create-next-app@latest", tempDir, ...cnaFlags], {
      stdio: "inherit",
      cwd,
    });

    // Copy from temp into root, excluding .git, node_modules, .next
    await copyDir(tempDir, cwd);
    safeRm(tempDir);

    // ensure deps installed (package.json in root now)
    if (exists(path.join(cwd, "package.json"))) {
      await execa("npm", ["install"], { stdio: "inherit", cwd });
    }
  } else {
    // Scaffold directly into targetDir ('.' or subfolder)
    const targetPath =
      targetDir === "." ? "." : path.relative(cwd, path.join(cwd, targetDir)) || targetDir;

    // If target is ".", ensure it's actually empty to avoid CNA error
    if (targetDir === "." && !isDirEmpty(cwd)) {
      const conflicts = listRootConflicts(cwd).join(", ");
      throw new Error(
        `Refusing to scaffold into non-empty root. Conflicts: ${conflicts}. (This should have been caught by strategy.)`
      );
    }

    await execa("npx", ["create-next-app@latest", targetPath, ...cnaFlags], {
      stdio: "inherit",
      cwd,
    });

    // install deps in that target (if subdir)
    if (targetDir !== ".") {
      await execa("npm", ["install"], { stdio: "inherit", cwd: path.join(cwd, targetDir) });
    }
  }

  // Ensure product.spec.yml has frontendRoot
  const newSpec = loadSpec(specPath) || {};
  if (!newSpec.frontendRoot) {
    newSpec.frontendRoot = targetDir;
    saveSpec(specPath, newSpec);
    console.log(`📝 Updated product.spec.yml with frontendRoot: ${targetDir}`);
  }

  console.log("✅ Next.js scaffolding complete.");
}
