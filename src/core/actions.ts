// src/core/actions.ts
import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import type { EnvVarRequest } from "../services/env.js";
import {
  safeMergeEnvLocal,
  queueProviderSync,
  isVercelLinked,
} from "../services/env.js";

export type ShellProviders = ("local" | "github" | "vercel" | "railway")[];
export type VercelScopes = ("development" | "preview" | "production")[];

export type PatchAction = {
  type: "patch";
  diff: string; // unified diff expected
  description?: string;
};

export type ExecAction = {
  type: "exec";
  cmd: string;
  cwd?: string;
  description?: string;
};

export type CheckAction = {
  type: "check";
  description?: string;
  // optional: explicit paths to check
  paths?: string[];
};

export type EnvRequestAction = {
  type: "env_request";
  variables?: {
    name: string;
    description?: string;
    requiredProviders?: ShellProviders;
    scopes?: VercelScopes;
    value?: string;
  }[];
  names?: string[]; // legacy
  providers?: ShellProviders; // legacy
  scopes?: VercelScopes; // legacy
};

export type ReadFileAction = {
  type: "read_file";
  path: string;
  description?: string;
};

export type WriteFileAction = {
  type: "write_file";
  path: string;
  content: string;
  description?: string;
};

export type EditFileAction = {
  type: "edit_file";
  path: string;
  oldContent: string;
  newContent: string;
  description?: string;
};

export type Action = PatchAction | ExecAction | CheckAction | EnvRequestAction | ReadFileAction | WriteFileAction | EditFileAction;

export interface ExecuteResult {
  ok: boolean;
  errorLog?: string;
  data?: any; // for read_file results
}

export interface ExecutorCfg {
  shellAllowlist?: string[];
  actions?: { shell?: { allow?: string[] } };
  // build check policy
  defaultCheck?: {
    // if true, run `npm run build` where package.json exists
    runBuild?: boolean;
  };
}

function mergeAllowlist(cfg: ExecutorCfg): string[] {
  const a = Array.isArray(cfg?.actions?.shell?.allow) ? cfg.actions.shell.allow : [];
  const b = Array.isArray(cfg?.shellAllowlist) ? cfg.shellAllowlist : [];
  return Array.from(new Set([...a, ...b]));
}

/** Apply unified diff using `git apply` for reliability. */
async function applyUnifiedDiff(cwd: string, diff: string): Promise<void> {
  // ensure repo init so `git apply` works well with CRLF, etc.
  if (!fs.existsSync(path.join(cwd, ".git"))) {
    await execa("git init", { cwd, shell: true });
    await execa("git", ["checkout", "-B", "main"], { cwd });
  }

  // try apply — if it fails, write .rej to help debugging
  try {
    await execa("git", ["apply", "--whitespace=nowarn", "-p0"], {
      cwd,
      input: diff,
      stdio: ["pipe", "inherit", "inherit"],
    });
  } catch (e: any) {
    const rejPath = path.join(cwd, ".af", "last.patch.rej.txt");
    fs.mkdirSync(path.dirname(rejPath), { recursive: true });
    fs.writeFileSync(rejPath, diff, "utf8");
    throw new Error(
      `git apply failed. Saved the diff to ${rejPath} for inspection.\n${e?.message || e}`
    );
  }
}

/** Normalize env_request payload to a single list of variables */
function normalizeEnvRequestPayload(a: EnvRequestAction): EnvVarRequest[] {
  let names: string[] = [];
  const providers: ShellProviders =
    (a.providers as ShellProviders) ?? ["local", "github", "vercel", "railway"];
  const scopes: VercelScopes =
    (a.scopes as VercelScopes) ?? ["development", "preview", "production"];

  if (Array.isArray(a.variables) && a.variables.length) {
    const rows = a.variables.map((v) => ({
      name: v.name,
      value: v.value,
      requiredProviders: (v.requiredProviders ?? providers) as ShellProviders,
      scopes: (v.scopes ?? scopes) as VercelScopes,
    }));
    return rows;
  }

  if (Array.isArray(a.names) && a.names.length) {
    names = a.names;
  }

  if (!names.length) throw new Error("env_request missing variables[] or names[]");
  return names.map((name) => ({
    name,
    requiredProviders: providers,
    scopes,
  }));
}

/** Handle env_request: write to .env.local, queue provider sync for later */
async function handleEnvRequest(
  payload: EnvRequestAction,
  cwd: string
): Promise<{ added: string[]; kept: string[]; vercelLinked: boolean }> {
  const variables = normalizeEnvRequestPayload(payload);
  const { added, kept } = safeMergeEnvLocal(cwd, variables);
  queueProviderSync(cwd, variables); // defer to deploy stage
  return { added, kept, vercelLinked: isVercelLinked(cwd) };
}

/** Try to run a default check (build/typecheck) if requested */
async function runDefaultCheck(cwd: string, paths?: string[]): Promise<void> {
  const roots = (paths?.length ? paths : [cwd]).filter(Boolean);
  for (const root of roots) {
    const pkg = path.join(root, "package.json");
    if (fs.existsSync(pkg)) {
      const json = JSON.parse(fs.readFileSync(pkg, "utf8"));
      if (json?.scripts?.build) {
        await execa("npm run build", { cwd: root, stdio: "inherit", shell: true });
      }
    } else {
      // Try TS check if tsconfig exists
      const tsconfig = path.join(root, "tsconfig.json");
      if (fs.existsSync(tsconfig)) {
        await execa("tsc -p tsconfig.json", { cwd: root, stdio: "inherit", shell: true });
      }
    }
  }
}

export async function executeActions(
  cwd: string,
  cfg: ExecutorCfg,
  actions: Action[]
): Promise<ExecuteResult> {
  const allow = mergeAllowlist(cfg);
  const errors: string[] = [];
  const results: any[] = [];

  for (const a of actions) {
    try {
      switch (a.type) {
        case "patch": {
          if (!a.diff?.trim()) throw new Error("patch.diff is empty");
          console.log(a.description ? `✍️  ${a.description}` : "✍️  Applying patch");
          await applyUnifiedDiff(cwd, a.diff);
          break;
        }
        case "exec": {
          const bin = a.cmd.split(/\s+/)[0];
          if (allow.length && !allow.includes(bin)) {
            throw new Error(
              `Command '${bin}' is not in allowlist. Add it under .af/config.yml -> actions.shell.allow`
            );
          }
          console.log(`$ ${a.cmd}`);
          await execa(a.cmd, { stdio: "inherit", shell: true, cwd: a.cwd ?? cwd });
          break;
        }
        case "check": {
          console.log("🔎 Running checks…");
          await runDefaultCheck(cwd, a.paths);
          break;
        }
        case "env_request": {
          const res = await handleEnvRequest(a, cwd);
          console.log(
            `🔐 Env: added ${res.added.length}, kept ${res.kept.length}. Vercel linked: ${res.vercelLinked ? "yes" : "no"}`
          );
          break;
        }
        case "read_file": {
          const abs = path.isAbsolute(a.path) ? a.path : path.join(cwd, a.path);
          if (!abs.startsWith(cwd)) throw new Error("Read outside root blocked");
          console.log(`📖 Reading: ${a.path}`);
          const content = fs.readFileSync(abs, "utf-8");
          results.push({ action: "read_file", path: a.path, content });
          break;
        }
        case "write_file": {
          const abs = path.isAbsolute(a.path) ? a.path : path.join(cwd, a.path);
          if (!abs.startsWith(cwd)) throw new Error("Write outside root blocked");
          console.log(`📝 Writing: ${a.path}`);
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, a.content, "utf-8");
          break;
        }
        case "edit_file": {
          const abs = path.isAbsolute(a.path) ? a.path : path.join(cwd, a.path);
          if (!abs.startsWith(cwd)) throw new Error("Edit outside root blocked");
          console.log(`✏️  Editing: ${a.path}`);
          const current = fs.readFileSync(abs, "utf-8");
          if (!current.includes(a.oldContent)) {
            throw new Error(`oldContent not found in ${a.path}`);
          }
          const updated = current.replace(a.oldContent, a.newContent);
          fs.writeFileSync(abs, updated, "utf-8");
          break;
        }
        default: {
          const _exhaustive: never = a as never;
          throw new Error(`Unknown action type: ${(a as any)?.type}`);
        }
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      errors.push(msg);
      console.error(`❌ Action failed: ${msg}`);
      return { ok: false, errorLog: errors.join("\n\n") };
    }
  }

  return { ok: true, data: results.length ? results : undefined };
}
