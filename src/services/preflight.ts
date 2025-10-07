// src/services/preflight.ts
import fs from "node:fs";
import path from "node:path";
import { execa, execaCommand } from "execa";

export type ToolCheck = {
  name: string;
  ok: boolean;
  version?: string | null;
  message?: string;
  required?: boolean;
};

type ToolDef = {
  name: string;
  bin: string;
  args?: string[];
  required: boolean;
};

const TOOLS: ToolDef[] = [
  { name: "node",     bin: "node",     args: ["--version"], required: true },
  { name: "npm",      bin: "npm",      args: ["--version"], required: true },
  { name: "git",      bin: "git",      args: ["--version"], required: true },
  { name: "pnpm",     bin: "pnpm",     args: ["--version"], required: false },
  { name: "vercel",   bin: "vercel",   args: ["--version"], required: false },
  { name: "supabase", bin: "supabase", args: ["--version"], required: false },
  { name: "railway",  bin: "railway",  args: ["--version"], required: false },
];

const installDocs: Record<string, string> = {
  node:     "https://nodejs.org",
  npm:      "npm ships with Node.js (reinstall Node if npm is missing)",
  git:      "https://git-scm.com/downloads",
  pnpm:     "npm i -g pnpm",
  vercel:   "npm i -g vercel",
  // Installing via npm is not supported; point to official instructions.
  supabase: "https://supabase.com/docs/guides/cli/getting-started",
  railway:  "npm i -g @railway/cli",
};

/** Escape a string for safe use inside a RegExp */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/** Read KEY from .env.local, then .env, then process.env */
function getEnvFromFilesOrProcess(cwd: string, key: string): string | undefined {
  // 1) .env.local
  const envLocalPath = path.join(cwd, ".env.local");
  if (fileExists(envLocalPath)) {
    try {
      const text = fs.readFileSync(envLocalPath, "utf8");
      const re = new RegExp(
        `^\\s*${escapeRegex(key)}\\s*=\\s*("?)([^\\n\\r"]*)\\1\\s*$`,
        "m",
      );
      const m = text.match(re);
      if (m?.[2]) return m[2].trim();
    } catch { /* ignore */ }
  }

  // 2) .env
  const envPath = path.join(cwd, ".env");
  if (fileExists(envPath)) {
    try {
      const text = fs.readFileSync(envPath, "utf8");
      const re = new RegExp(
        `^\\s*${escapeRegex(key)}\\s*=\\s*("?)([^\\n\\r"]*)\\1\\s*$`,
        "m",
      );
      const m = text.match(re);
      if (m?.[2]) return m[2].trim();
    } catch { /* ignore */ }
  }

  // 3) process.env
  const fromProc = process.env[key];
  if (fromProc && fromProc.trim()) return fromProc.trim();

  return undefined;
}

/**
 * Run `<bin> --version` with a Windows-friendly fallback (quoted paths).
 */
export async function versionSafe(
  bin: string,
  args: string[] = ["--version"]
): Promise<string | null> {
  try {
    const { stdout } = await execa(bin, args);
    return stdout.trim();
  } catch {
    try {
      const { stdout } = await execaCommand([bin, ...args].join(" "), { shell: true });
      return stdout.trim();
    } catch {
      return null;
    }
  }
}

export function installHint(name: string): string {
  return installDocs[name] ?? "Search your package manager or vendor docs.";
}

/**
 * Check common CLIs and a couple of repo prerequisites.
 * If `only` is provided, limit checks to that subset (by name).
 */
export async function checkTools(only?: string[]): Promise<ToolCheck[]> {
  const names = new Set((only ?? TOOLS.map(t => t.name)).map(s => s.toLowerCase()));
  const results: ToolCheck[] = [];

  // 1) CLI binaries
  for (const t of TOOLS) {
    if (!names.has(t.name)) continue;
    const ver = await versionSafe(t.bin, t.args ?? ["--version"]);
    if (ver) {
      results.push({ name: t.name, ok: true, version: ver, required: t.required });
    } else {
      results.push({
        name: t.name,
        ok: false,
        version: null,
        required: t.required,
        message: `Command failed or not found`,
      });
    }
  }

  // 2) .af/config.yml presence (informational)
  if (!only || names.has(".af/config.yml") || names.size === 0) {
    const cfgPath = path.join(process.cwd(), ".af", "config.yml");
    const hasCfg = fs.existsSync(cfgPath);
    results.push({
      name: ".af/config.yml",
      ok: hasCfg,
      required: false,
      message: hasCfg ? undefined : "Missing .af/config.yml at repo root",
    });
  }

  // 3) TOGETHER_API_KEY presence (informational — no 'sk_' requirement)
  if (!only || names.has("together_api_key") || names.size === 0) {
    const key = getEnvFromFilesOrProcess(process.cwd(), "TOGETHER_API_KEY");
    const ok = typeof key === "string" && key.trim().length > 0;
    results.push({
      name: "TOGETHER_API_KEY",
      ok,
      required: false,
      message: ok
        ? undefined
        : "Set TOGETHER_API_KEY in .env.local (or .env). Together keys don’t use an 'sk_' prefix.",
    });
  }

  return results;
}

/** Ensure required tools are available; throw with helpful install hints if not. */
export async function requireTools(names: string[]): Promise<void> {
  const set = new Set(names.map(s => s.toLowerCase()));
  const subset = TOOLS.filter(t => set.has(t.name));
  const checks = await Promise.all(
    subset.map(async (t) => {
      const ver = await versionSafe(t.bin, t.args ?? ["--version"]);
      return { def: t, ok: !!ver, version: ver };
    }),
  );

  const missing = checks.filter(c => !c.ok).map(c => c.def.name);
  if (missing.length) {
    const lines = missing.map(n => ` - ${n}: ${installHint(n)}`).join("\n");
    throw new Error(`Required tools missing:\n${lines}`);
  }
}
