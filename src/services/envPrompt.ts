// src/services/envPrompt.ts
import fs from "node:fs";
import path from "node:path";

/** Prefer .env.local (create if missing). */
export function ensureEnvLocalPath(cwd: string): string {
  const envLocal = path.join(cwd, ".env.local");
  if (!fs.existsSync(envLocal)) {
    fs.writeFileSync(envLocal, "", "utf-8");
  }
  return envLocal;
}

/** Get a map of KEY -> raw value from an env file (very small parser). */
export function readEnvFileToMap(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) return {};
  const txt = fs.readFileSync(envPath, "utf-8");
  const out: Record<string, string> = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2] ?? "";
    // If quoted, unquote simple cases
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** Upsert a single KEY=value in the env file. */
export function setEnvVar(envPath: string, name: string, value: string): void {
  const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
  const lines = raw.split(/\r?\n/);
  const keyRe = new RegExp(`^\\s*${escapeRegExp(name)}\\s*=`);
  const encoded = needsQuoting(value) ? JSON.stringify(value) : value;

  let found = false;
  const next = lines.map((l) => {
    if (keyRe.test(l)) {
      found = true;
      return `${name}=${encoded}`;
    }
    return l;
  });
  if (!found) next.push(`${name}=${encoded}`);
  fs.writeFileSync(envPath, next.join("\n").replace(/\n+$/,"") + "\n", "utf-8");
}

/** Return a value from .env.local OR process.env (prefers .env.local). */
export function getExistingEnvValue(cwd: string, name: string): string | undefined {
  const envPath = ensureEnvLocalPath(cwd);
  const map = readEnvFileToMap(envPath);
  return map[name] ?? process.env[name];
}

/** Ask user for values for each name and return a { name: value } object. */
export async function promptForEnvValues(
  names: string[],
  opts?: { maskLikeSecrets?: boolean }
): Promise<Record<string, string>> {
  const mask = opts?.maskLikeSecrets ?? true;

  // dynamic import so we don't pull in types at build-time
  const { default: inquirer } = await import("inquirer");

  const questions = names.map((name) => ({
    type: inferPromptType(name, mask),
    name,
    message: `Enter value for ${name}:`,
    validate: (v: string) => (v && String(v).trim().length > 0 ? true : "Value is required"),
  }));

  const answers = await inquirer.prompt(questions as any);
  return answers as Record<string, string>;
}

/** Write multiple vars at once, creating .env.local if needed. */
export function writeManyEnvVars(cwd: string, pairs: Record<string, string>): string {
  const envPath = ensureEnvLocalPath(cwd);
  for (const [k, v] of Object.entries(pairs)) {
    setEnvVar(envPath, k, v);
  }
  return envPath;
}

/** Helpers */
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function needsQuoting(v: string) {
  return /[\s#'"\\]/.test(v);
}

function inferPromptType(name: string, mask: boolean) {
  if (!mask) return "input";
  // basic heuristic: keys/secrets/tokens => password
  if (/(KEY|SECRET|TOKEN|PASSWORD|SERVICE_ROLE|API|ACCESS|PRIVATE)/i.test(name)) return "password";
  return "input";
}
