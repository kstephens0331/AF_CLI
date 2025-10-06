import { execaCommand } from "execa";
import os from "node:os";

export type ToolResult = {
  name: string;
  ok: boolean;
  version?: string;
  message?: string;
  required: boolean;
};

type Tool = { name: string; cmd: string; args?: string; required?: boolean };

const TOOLS: Tool[] = [
  { name: "node",    cmd: process.execPath, args: "--version", required: true },
  { name: "npm",     cmd: "npm",     args: "--version", required: true },
  { name: "git",     cmd: "git",     args: "--version", required: true },
  // optional providers — only required if you use them
  { name: "vercel",  cmd: "vercel",  args: "--version", required: false },
  { name: "supabase",cmd: "supabase",args: "--version", required: false },
  { name: "railway", cmd: "railway", args: "--version", required: false },
  { name: "pnpm",    cmd: "pnpm",    args: "--version", required: false },
];

export async function checkTools(only?: string[]): Promise<ToolResult[]> {
  const wanted = only?.length ? TOOLS.filter(t => only.includes(t.name)) : TOOLS;
  const results: ToolResult[] = [];
  for (const t of wanted) {
    try {
      const { stdout } = await execaCommand(`${t.cmd} ${t.args ?? ""}`.trim(), { shell: true });
      results.push({ name: t.name, ok: true, version: stdout.trim().split(/\r?\n/)[0], required: !!t.required });
    } catch (err: any) {
      const msg = String(err?.shortMessage || err?.message || "").trim();
      results.push({ name: t.name, ok: false, message: msg || "not found", required: !!t.required });
    }
  }
  return results;
}

export async function requireTools(names: string[]) {
  const res = await checkTools(names);
  const missing = res.filter(r => !r.ok);
  if (missing.length) {
    const hints = missing.map(m => installHint(m.name)).join(os.EOL);
    const list = missing.map(m => `- ${m.name} (${m.message ?? "not found"})`).join(os.EOL);
    throw new Error(`Missing required tools:${os.EOL}${list}${os.EOL}${os.EOL}Install hints:${os.EOL}${hints}`);
  }
}

export function installHint(name: string): string {
  switch (name) {
    case "git":     return "git: https://git-scm.com/download/win";
    case "vercel":  return "vercel: npm i -g vercel";
    case "supabase":return "supabase: npm i -g supabase";
    case "railway": return "railway: npm i -g @railway/cli";
    case "pnpm":    return "pnpm: corepack enable && corepack prepare pnpm@latest --activate";
    case "npm":     return "npm: reinstall Node from https://nodejs.org (includes npm)";
    case "node":    return "node: https://nodejs.org";
    default:        return `${name}: check PATH or install via your package manager`;
  }
}
