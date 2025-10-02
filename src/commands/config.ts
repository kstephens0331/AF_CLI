import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { log } from "../core/logger.js";
import { ConfigSchema } from "../core/root.js";

export const configCommand = new Command("config")
  .description("View or edit config")
  .option("--get", "Print current config")
  .option(
  "--set <path=value>",
  "Set a field (e.g., model=...)",
  (v: string, prev: string[] = []) => [...prev, v]
)
  .action(async (opts) => {
    const root = process.cwd();
    const cfgPath = path.join(root, ".af/config.yml");
    const cfg = yaml.load(fs.readFileSync(cfgPath, "utf-8")) as any;

    if (opts.set) {
      for (const kv of opts.set as string[]) {
        const [k, ...rest] = kv.split("=");
        const val = rest.join("=");
        setPath(cfg, k, parseLiteral(val));
      }
      const parsed = ConfigSchema.parse(cfg);
      fs.writeFileSync(cfgPath, yaml.dump(parsed));
      log.ok("Updated config");
    }

    if (opts.get || !opts.set) {
      console.log(yaml.dump(cfg));
    }
  });

function setPath(obj: any, path: string, value: any) {
  const parts = path.split(".");
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
