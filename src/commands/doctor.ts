import { Command } from "commander";
import { checkTools, installHint } from "../services/preflight.js";

export const doctorCommand = new Command("doctor")
  .description("Diagnose environment & provider CLIs")
  .option("--only <list>", "Comma-separated tools (e.g. git,vercel,supabase)")
  .action(async (opts: { only?: string }) => {
    const only = opts.only ? opts.only.split(",").map((s: string) => s.trim()).filter(Boolean) : undefined;
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
    if (hardMissing.length) process.exitCode = 1;
  });
