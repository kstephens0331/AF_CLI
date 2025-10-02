// src/services/env.ts
import fs from "node:fs";
import path from "node:path";

export type Provider = "local" | "github" | "vercel" | "railway";
export type Scope = "development" | "preview" | "production";

export interface EnvVarRequest {
  name: string;
  value?: string; // may be supplied by the user; if missing we create a blank entry
  requiredProviders?: Provider[];
  scopes?: Scope[];
}

const PENDING_FILE = ".af/pending-env-sync.json";

function ensureDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readEnvFile(fp: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(fp)) return map;
  const lines = fs.readFileSync(fp, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2] ?? "";
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    map.set(m[1], v);
  }
  return map;
}

function writeEnvFile(fp: string, map: Map<string, string>) {
  const keys = Array.from(map.keys()).sort();
  const body =
    keys
      .map((k) => {
        const v = map.get(k) ?? "";
        const needsQuotes = /[\s#'"\\]/.test(v);
        return `${k}=${needsQuotes ? JSON.stringify(v) : v}`;
      })
      .join("\n") + "\n";
  ensureDir(fp);
  fs.writeFileSync(fp, body, "utf8");
}

/**
 * Merge variables into .env.local without overwriting existing values.
 * - Adds new keys with provided value, or blank if none is provided
 * - Never writes to .env (only .env.local)
 */
export function safeMergeEnvLocal(
  cwd: string,
  vars: EnvVarRequest[]
): { added: string[]; kept: string[] } {
  const envLocal = path.join(cwd, ".env.local");
  const current = readEnvFile(envLocal);
  const added: string[] = [];
  const kept: string[] = [];

  for (const v of vars) {
    const key = (v.name || "").trim();
    if (!key) continue;

    if (current.has(key)) {
      kept.push(key);
      continue; // preserve user’s current value
    }
    if (v.value != null && v.value !== "") {
      current.set(key, v.value);
    } else {
      // reserve the key but leave it blank for the user to fill
      current.set(key, "");
    }
    added.push(key);
  }

  writeEnvFile(envLocal, current);
  return { added, kept };
}

/** Queue envs for later provider sync (Vercel/Railway/GitHub). */
export function queueProviderSync(cwd: string, vars: EnvVarRequest[]) {
  const fp = path.join(cwd, PENDING_FILE);
  let prev: { variables: EnvVarRequest[] } = { variables: [] };
  if (fs.existsSync(fp)) {
    try {
      prev = JSON.parse(fs.readFileSync(fp, "utf8"));
    } catch {
      // ignore parse errors; we’ll overwrite with a clean file
    }
  }

  const byName = new Map<string, EnvVarRequest>();
  for (const v of prev.variables) byName.set(v.name, v);

  for (const v of vars) {
    const existing = byName.get(v.name);
    if (existing) {
      if ((v.value ?? "") !== "") existing.value = v.value;
      existing.requiredProviders = Array.from(
        new Set([...(existing.requiredProviders ?? []), ...(v.requiredProviders ?? [])])
      ) as Provider[];
      existing.scopes = Array.from(
        new Set([...(existing.scopes ?? []), ...(v.scopes ?? [])])
      ) as Scope[];
      byName.set(v.name, existing);
    } else {
      byName.set(v.name, { ...v });
    }
  }

  ensureDir(fp);
  fs.writeFileSync(fp, JSON.stringify({ variables: Array.from(byName.values()) }, null, 2), "utf8");
}

/** Simple check to avoid calling Vercel before link. */
export function isVercelLinked(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, ".vercel", "project.json"));
}

export async function updateEnvFile(
  cwd: string,
  kv: Record<string, string | undefined>
): Promise<{ added: string[]; kept: string[] }> {
  const vars: EnvVarRequest[] = Object.entries(kv).map(([name, value]) => ({
    name,
    value: value ?? "",
    requiredProviders: ["local"], // queued for providers separately
    scopes: ["development", "preview", "production"],
  }));

  return safeMergeEnvLocal(cwd, vars);
}
