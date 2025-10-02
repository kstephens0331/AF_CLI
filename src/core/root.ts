// src/core/root.ts
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const CONFIG_DIR = ".af";
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.yml");
export const STATE_PATH = path.join(CONFIG_DIR, "state.json");

export const ConfigSchema = z.object({
  root: z.string(),

  // Back-compat single-model field
  model: z.string().default("meta-llama/Llama-3.3-70B-Instruct-Turbo"),
  togetherApiKeyRef: z.string().default("TOGETHER_API_KEY"),
  allowWriteOutsideRoot: z.boolean().default(false),

  // Shell allowlist
  shellAllowlist: z
    .array(z.string())
    .default([
      "pnpm",
      "npm",
      "npx",
      "node",
      "git",
      "gh",
      "vercel",
      "supabase",
      "railway",
      "tsc",
      "eslint",
      "prettier",
      "vitest",
      "pytest",
      "go",
      "cargo",
      "pip",
      "uv",
      "bun",
      "yarn"
    ]),

  // Smart routing across Together.ai models — with full object defaults
  routing: z
    .object({
      planModel: z.string().default("meta-llama/Llama-3.3-70B-Instruct-Turbo"),
      codeModel: z.string().default("deepseek-ai/DeepSeek-V3"),
      bigPlanModel: z.string().default("meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo"),
      thresholds: z
        .object({
          totalBytes: z.number().default(100 * 1024 * 1024), // 100 MB
          totalFiles: z.number().default(3000)
        })
        .default({ totalBytes: 100 * 1024 * 1024, totalFiles: 3000 })
    })
    .default({
      planModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      codeModel: "deepseek-ai/DeepSeek-V3",
      bigPlanModel: "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
      thresholds: { totalBytes: 100 * 1024 * 1024, totalFiles: 3000 }
    }),

  // Planner controls for huge repos
  planner: z
    .object({
      maxRounds: z.number().default(4),
      perFileChars: z.number().default(16000),
      snapshotMaxBytes: z.number().default(1_600_000)
    })
    .default({ maxRounds: 4, perFileChars: 16000, snapshotMaxBytes: 1_600_000 }),

  // Staging defaults
  staging: z
    .object({
      enabled: z.boolean().default(true),
      dir: z.string().default(".af/staging"),
      branchPrefix: z.string().default("af/stage/")
    })
    .default({ enabled: true, dir: ".af/staging", branchPrefix: "af/stage/" }),

  // Local checks
  testing: z
    .object({
      command: z.string().default("pnpm test"),
      typecheck: z.string().default("pnpm -w tsc --noEmit"),
      lint: z.string().default("pnpm -w eslint .")
    })
    .default({
      command: "pnpm test",
      typecheck: "pnpm -w tsc --noEmit",
      lint: "pnpm -w eslint ."
    }),

  // Deploy toggles
  deploy: z
    .object({
      github: z.boolean().default(true),
      vercel: z.boolean().default(true),
      supabase: z.boolean().default(true),
      railway: z.boolean().default(true)
    })
    .default({ github: true, vercel: true, supabase: true, railway: true })
});

export async function ensureProjectRoot(cwd: string) {
  const root = await findRoot(cwd);
  if (!root) {
    throw new Error(
      "Not inside a Git repo. Initialize in your project root (`git init`) or run `af init` first."
    );
  }
  const afDir = path.join(root, ".af");
  if (!fs.existsSync(afDir)) fs.mkdirSync(afDir, { recursive: true });
}

export async function requireInitialized(cwd: string) {
  const root = await findRoot(cwd);
  if (!root) throw new Error("Cannot find project root. Run `af init`.");
  const cfg = path.join(root, CONFIG_PATH);
  if (!fs.existsSync(cfg)) {
    throw new Error("CLI not initialized. Run `af init`.");
  }
}

export async function findRoot(start: string): Promise<string | null> {
  let dir = start;
  while (true) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
