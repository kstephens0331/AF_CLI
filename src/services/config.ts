// src/services/config.ts
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ConfigSchema } from "../core/root.js";

export type AppConfig = ReturnType<typeof ConfigSchema.parse>;

/**
 * Loads .af/config.yml if present; otherwise returns a default config
 * derived from the current working directory.
 */
export function loadConfig(cwd: string = process.cwd()): AppConfig {
  const cfgDir = path.join(cwd, ".af");
  const cfgPath = path.join(cfgDir, "config.yml");

  if (fs.existsSync(cfgPath)) {
    const raw = fs.readFileSync(cfgPath, "utf8");
    const parsed = yaml.load(raw) as unknown;
    // Validate & normalize using the shared schema
    return ConfigSchema.parse(parsed);
  }

  // Fall back to a minimal default that still satisfies downstream code
  return ConfigSchema.parse({ root: cwd });
}

/**
 * Convenience: ensure .af/ directory exists so callers can safely write
 * caches/state if needed.
 */
export function ensureAfDirs(cwd: string = process.cwd()): void {
  const base = path.join(cwd, ".af");
  fs.mkdirSync(path.join(base, "state"), { recursive: true });
  fs.mkdirSync(path.join(base, "backups"), { recursive: true });
  fs.mkdirSync(path.join(base, "cache"), { recursive: true });
}
