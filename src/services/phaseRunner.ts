// src/services/phaseRunner.ts
import path from "node:path";
import fs from "node:fs";
import { togetherChatCompletion } from "./llm.js";
import { executeActions, type Action } from "../core/actions.js";

/**
 * The LLM should return a JSON object:
 * { "actions": Array<Action>, "notes"?: string }
 * where Action ∈ { patch, exec, check, env_request }.
 */
type Plan = { actions: Action[]; notes?: string };

export interface PhaseRunnerOptions {
  maxRetries?: number;
  temperature?: number;
  model?: string;
  // paths to run default checks/build on (e.g., frontendRoot "web")
  checkPaths?: string[];
  // merged into executor shell allowlist (for exec actions)
  shellAllowlist?: string[];
}

const SYSTEM_POLICY = `
You are the AF build agent. Produce only valid JSON with an "actions" array.
Allowed action types only: "patch", "exec", "check", "env_request".
- "patch": { "type":"patch", "diff":"<unified diff>", "description":"..." }
  * Create parent dirs in patch headers. Always include correct '---' and '+++' file markers and @@ hunks.
  * Use UTF-8 and LF line endings.
- "exec": { "type":"exec", "cmd":"...", "cwd":"optional" }
  * Only use commands commonly present in the project (npm, npx, node, git, gh, vercel, supabase, railway, tsc, eslint, prettier, vitest, yarn, pnpm, bun).
- "check": { "type":"check" }
  * This triggers typecheck/build on the provided repo paths.
- "env_request": {
    "type":"env_request",
    "variables":[
      { "name":"NEXT_PUBLIC_SUPABASE_URL", "requiredProviders":["local","github","vercel","railway"], "scopes":["development","preview","production"] },
      { "name":"NEXT_PUBLIC_SUPABASE_ANON_KEY", "requiredProviders":["local","github","vercel","railway"], "scopes":["development","preview","production"] },
      { "name":"SUPABASE_SERVICE_ROLE", "requiredProviders":["local","github","vercel","railway"], "scopes":["development","preview","production"] },
      { "name":"TOGETHER_API_KEY", "requiredProviders":["local","github","vercel","railway"], "scopes":["development","preview","production"] },
      { "name":"TOGETHER_MODEL", "requiredProviders":["local","github","vercel","railway"], "scopes":["development","preview","production"] },
      { "name":"TRANSCRIBE_URL", "requiredProviders":["local","github","vercel","railway"], "scopes":["development","preview","production"] },
      { "name":"INGESTOR_URL", "requiredProviders":["local","github","vercel","railway"], "scopes":["development","preview","production"] },
      { "name":"NEXT_PUBLIC_BASE_URL", "requiredProviders":["local","github","vercel","railway"], "scopes":["development","preview","production"] }
    ]
  }
DO NOT sync envs to providers; the CLI defers that to deployment.
Never write to .env — use .env.local only.

Idempotence: re-runs must keep working; skip recreating files if already correct.
If checks fail, propose targeted patches only.
Return minimal shell commands and rely on patches otherwise.
`;

function readProductSpec(cwd: string): string {
  const p = path.join(cwd, "product.spec.yml");
  if (fs.existsSync(p)) {
    return fs.readFileSync(p, "utf8");
  }
  return "# (no product.spec.yml present)\n";
}

function firstBuildUserPrompt(goal: string, spec: string, checkPaths?: string[]) {
  return `
Goal:
${goal}

Project spec (product.spec.yml):
---
${spec}
---

Context:
- You are adding/patching files to complete the product.
- Use the APIs and structure already planned in earlier steps (Next.js app, API routes, Supabase SQL, microservices).
- Check paths: ${(checkPaths && checkPaths.length) ? checkPaths.join(", ") : "(repo root)"}

Task:
Plan the next set of actions to move toward a fully working build. Emit JSON only.
`;
}

function fixPromptFromError(goal: string, lastError: string) {
  return `
The previous actions failed. Here is the error log:

<<<ERROR LOG START>>>
${lastError.trim().slice(0, 20000)}
<<<ERROR LOG END>>>

Task:
Propose the smallest set of additional actions (patch/exec/check/env_request) to fix the build and pass checks.
Emit JSON only.
`;
}

// Extract the first JSON object or array from a string.
export function extractJSON<T = any>(raw: string): T | null {
  if (!raw) return null;
  // Prefer fenced ```json blocks
  const fence =
    raw.match(/```\s*json\s*\n([\s\S]*?)```/i) ||
    raw.match(/```\s*\n([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : raw;

  // Find first balanced JSON object/array
  const start =
    candidate.indexOf("{") >= 0 ? candidate.indexOf("{") : candidate.indexOf("[");
  if (start === -1) return null;

  let depth = 0;
  let end = -1;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === "[") depth++;
    else if (ch === "]") depth--;
    if (depth === 0 && i > start) {
      end = i + 1;
      break;
    }
  }
  const jsonSlice = end !== -1 ? candidate.slice(start, end) : candidate.slice(start);
  try {
    return JSON.parse(jsonSlice) as T;
  } catch {
    return null;
  }
}

export async function runPhasedBuild(
  cwd: string,
  goal: string,
  opts: PhaseRunnerOptions = {}
): Promise<{ ok: boolean; attempts: number; lastError?: string }> {
  const maxRetries = Math.max(1, opts.maxRetries ?? 5);
  const temperature = opts.temperature ?? 0.2;
  const model =
    opts.model ||
    process.env.TOGETHER_MODEL ||
    "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo";
  const checkPaths = opts.checkPaths;
  const shellAllowlist = opts.shellAllowlist;

  const spec = readProductSpec(cwd);

  // 1) Initial plan
  const initText = await togetherChatCompletion({
    cwd,
    model,
    temperature,
    messages: [
      { role: "system", content: SYSTEM_POLICY },
      { role: "user", content: firstBuildUserPrompt(goal, spec, checkPaths) },
    ],
  });

  let plan: Plan | null = extractJSON<Plan>(initText);
  if (!plan) {
    throw new Error("LLM did not return valid JSON plan for initial step.");
  }

  let attempts = 0;
  let lastError: string | undefined;

  // Keep this 'any' to avoid tight coupling with core/actions typing.
  const execCfg: any = {
    actions: {
      shell: {
        allow:
          shellAllowlist ??
          [
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
            "yarn",
          ],
      },
    },
    defaultCheck: { runBuild: true },
  };

  while (attempts < maxRetries) {
    attempts++;

    // Always append a "check" action at the end if not present
    const actions: Action[] = Array.isArray(plan.actions) ? [...plan.actions] : [];
    if (!actions.some((a) => a.type === "check")) {
      actions.push({
        type: "check",
        description: "Run build/type checks",
        paths: checkPaths,
      } as any);
    }

    let result: any;
    try {
      result = await executeActions(cwd, execCfg, actions);
    } catch (err: any) {
      // If executor threw, craft a fix plan based on the error
      lastError = String(err?.stack || err?.message || err);
      const fixText = await togetherChatCompletion({
        cwd,
        model,
        temperature,
        messages: [
          { role: "system", content: SYSTEM_POLICY },
          { role: "user", content: fixPromptFromError(goal, lastError) },
        ],
      });
      const newPlan = extractJSON<Plan>(fixText);
      plan = newPlan ?? { actions: [] };
      continue;
    }

    const succeeded = result === "ok" || result?.ok === true;
    if (succeeded) {
      return { ok: true, attempts };
    }

    // If failed, ask for fixes
    lastError = result?.errorLog || "Unknown error";
    const fixText = await togetherChatCompletion({
      cwd,
      model,
      temperature,
      messages: [
        { role: "system", content: SYSTEM_POLICY },
        { role: "user", content: fixPromptFromError(goal, lastError || "") },
      ],
    });
    const newPlan = extractJSON<Plan>(fixText);
    if (!newPlan) {
      // Give the LLM one more chance to just return a tiny patch
      const tinyFixText = await togetherChatCompletion({
        cwd,
        model,
        temperature,
        messages: [
          { role: "system", content: SYSTEM_POLICY },
          {
            role: "user",
            content: `You returned invalid JSON. Create one small "patch" to fix the error:\n${(lastError || "").slice(
              0,
              4000
            )}\nReturn JSON only.`,
          },
        ],
      });
      plan = extractJSON<Plan>(tinyFixText);
      if (!plan) {
        return { ok: false, attempts, lastError: "LLM returned invalid JSON twice." };
      }
    } else {
      plan = newPlan;
    }
  }

  return { ok: false, attempts, lastError };
}
