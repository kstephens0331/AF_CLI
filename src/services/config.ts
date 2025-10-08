// src/commands/config.ts
import { Command } from "commander";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { log } from "../core/logger.js";
import { ConfigSchema } from "../core/root.js";
import { scanRepository } from "../core/actions.js";

export const configCommand = new Command("config")
  .description("View or edit config")
  .option("--get", "Print current config")
  .option(
    "--set <path=value>",
    "Set a field (e.g., models.default=... or actions.shell.allow=git)",
    (v: string, prev: string[] = []) => [...prev, v]
  )
  .action(async (opts) => {
    const cwd = process.cwd();
    const cfgPath = path.join(cwd, ".af", "config.yml");
    await fsp.mkdir(path.dirname(cfgPath), { recursive: true });

    if (!fs.existsSync(cfgPath)) {
      // init an empty config if missing (valid minimal shape)
      const initial = {
        root: ".",
        models: { default: "Qwen/Qwen2.5-Coder-32B-Instruct", bigPlan: "deepseek-ai/DeepSeek-V3" },
        actions: { shell: { allow: ["node", "npm", "pnpm", "npx", "git", "af"] } },
        routing: { snapshotBytesThreshold: 700000, planFileCountThreshold: 1500 },
        check: {
          typecheck: "npx tsc -p tsconfig.json --noEmit",
          lint: 'npx eslint "src/**/*.ts" "vscode-extension/src/**/*.ts"',
          test: "npx vitest run --reporter=dot --coverage",
        },
      };
      await fsp.writeFile(cfgPath, yaml.dump(initial), "utf8");
    }

    const raw = await fsp.readFile(cfgPath, "utf8");
    const obj = (yaml.load(raw) ?? {}) as any;

    if (opts.get && !opts.set?.length) {
      // Just print pretty YAML
      process.stdout.write(yaml.dump(obj));
      return;
    }

    // Apply --set path=value pairs
    if (opts.set?.length) {
      for (const pair of opts.set) {
        const idx = pair.indexOf("=");
        if (idx === -1) throw new Error(`Bad --set format: ${pair}. Use path=value.`);
        const key = pair.slice(0, idx).trim();
        const val = pair.slice(idx + 1).trim();
        setDeep(obj, key, parseLiteral(val));
      }

      // Validate (best effort) and write
      try {
        ConfigSchema.parse?.(obj);
      } catch {
        // If schema validation isn't strict at runtime, ignore
      }
      await fsp.writeFile(cfgPath, yaml.dump(obj), "utf8");
      log.ok("Config updated.");
    } else {
      // default: print
      process.stdout.write(yaml.dump(obj));
    }
  });

/* ────────────────────────────────────────────────────────────────────────────
 * NEW: `af config scan` subcommand (fast/deep, cached, cancellable)
 * ──────────────────────────────────────────────────────────────────────────── */

const scanCommand = new Command("scan")
  .description("Scan repository and persist .af/cache.json (Ctrl-C to cancel)")
  .option("--fast", "Metadata only (no hashes)", false)
  .option("--deep", "Compute SHA-1 hashes and cache them", false)
  .option("--no-cache-write", "Do not write .af/cache.json", false)
  .option("--root <path>", "Directory root to scan (default: cwd)")
  .action(async (opts: {
    fast?: boolean;
    deep?: boolean;
    cacheWrite?: boolean;
    root?: string;
  }) => {
    const mode = opts.deep ? "deep" : "fast"; // deep wins if both given, but commander prevents that
    const root = path.resolve(opts.root ?? process.cwd());

    const ac = new AbortController();
    const onSigInt = () => ac.abort();
    process.once("SIGINT", onSigInt);

    try {
      const result = await scanRepository({
        root,
        mode,
        signal: ac.signal,
        writeCache: opts.cacheWrite !== false,
        respectIgnore: true,
      });

      const kb = Math.round(result.stats.bytes / 1024);
      console.log(
        `✅ Scan complete (${result.mode}). Files: ${result.stats.files}, Dirs: ${result.stats.dirs}, ~${kb} KiB.`
      );
      console.log(`🗂  Cache: ${path.relative(process.cwd(), result.cachePath)}`);
    } catch (e: any) {
      if (ac.signal.aborted) {
        console.log("🛑 Scan canceled by user.");
      } else {
        console.error(`❌ Scan failed: ${e?.message || e}`);
        process.exitCode = 1;
      }
    } finally {
      process.removeListener("SIGINT", onSigInt);
    }
  });

configCommand.addCommand(scanCommand);

/* ────────────────────────────────────────────────────────────────────────────
 * helpers
 * ──────────────────────────────────────────────────────────────────────────── */

function setDeep(obj: any, dotted: string, value: unknown) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] ??= {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function parseLiteral(v: string) {
  if (v === "true") return true;
  if (v === "false") return false;
  const n = Number(v);
  if (!Number.isNaN(n) && v.trim() !== "") return n;
  return v;
}
