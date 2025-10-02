import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import yaml from "js-yaml";
import { chatToActionsSmart } from "../services/nl2actions.js";
import { executeActions } from "../core/actions.js";
import { findRoot as maybeFindRoot } from "../core/root.js";

function loadAfConfig(cwd: string): any {
  const p = path.join(cwd, ".af", "config.yml");
  if (fs.existsSync(p)) {
    try {
      return yaml.load(fs.readFileSync(p, "utf-8")) ?? {};
    } catch {
      return {};
    }
  }
  return {};
}

async function resolveProjectRoot(): Promise<string> {
  try {
    const maybe = (maybeFindRoot as any);
    if (typeof maybe === "function") {
      const r = await maybe(process.cwd());
      if (typeof r === "string" && r.length) return r;
    }
  } catch {}
  return process.cwd();
}

export default function registerImplementCommand(program: Command) {
  program
    .command("implement")
    .argument("[instruction...]", "Describe what to implement. Defaults to product.spec.yml.")
    .action(async (parts: string[]) => {
      const cwd = await resolveProjectRoot();
      const cfg = loadAfConfig(cwd);
      const instruction = (parts || []).join(" ").trim();

      const msg =
        instruction ||
        "Build the full product per product.spec.yml. Use env_request for missing envs and sync to local+GitHub+Vercel+Railway; then continue automatically.";

      const plan = await chatToActionsSmart({ cwd, message: msg });

      if (plan.reply) console.log(`🧭 Plan: ${plan.reply}`);

      const status: any = await executeActions(cwd, cfg, plan.actions as any);
      if (status !== "ok") {
        console.log("⏸ Paused for human checkpoint. Resume with your next 'af implement' command.");
      } else {
        console.log("✅ Implementation complete.");
      }
    });
}
