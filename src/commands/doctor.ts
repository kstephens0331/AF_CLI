// src/commands/doctor.ts
import { Command } from "commander";
import { checkTools, installHint } from "../services/preflight.js";
import fs from "node:fs";
import path from "node:path";

export const doctorCommand = new Command("doctor")
  .description("Diagnose environment, config, provider CLIs, and keys")
  .option("--only <list>", "Comma-separated tools (e.g. git,vercel,supabase)")
  .action(async (opts: { only?: string }) => {
    const only = opts.only ? opts.only.split(",").map((s: string) => s.trim()).filter(Boolean) : undefined;

    // 1) Tooling
    const results = await checkTools(only);
    for (const r of results) {
      if (r.ok) {
        console.log(`✅ ${r.name} ${r.version ?? ""}`.trim());
      } else {
        console.log(`❌ ${r.name} ${r.message ? `- ${r.message}` : ""}`.trim());
        console.log(`   ↳ ${installHint(r.name)}`);
      }
    }
    const hardMissing = results.filter(r => r.required && !r.ok);

    // 2) Config presence
    const cwd = process.cwd();
    const cfgPath = path.join(cwd, ".af", "config.yml");
    const hasCfg = fs.existsSync(cfgPath);
    console.log(hasCfg ? `✅ .af/config.yml present` : `❌ .af/config.yml missing`);

    // 3) Together key sanity
    const tKey = process.env.TOGETHER_API_KEY;
    const keyOk = !!(tKey && tKey.startsWith("sk_"));
    console.log(keyOk ? `✅ TOGETHER_API_KEY looks set` : `❌ TOGETHER_API_KEY missing/invalid`);

    // Exit code if anything critical is missing
    if (hardMissing.length || !hasCfg || !keyOk) {
      process.exitCode = 1;
    }
  });
