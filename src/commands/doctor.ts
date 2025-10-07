import { Command } from "commander";
import type { ToolCheck } from "../services/preflight.js";
import { checkTools, installHint } from "../services/preflight.js";

function normalizeName(name: string): string {
  // collapse variants like ".af/config.yml present" -> ".af/config.yml"
  return name.toLowerCase().replace(/\s+present$/, "");
}

function dedupeResults(results: ToolCheck[]): ToolCheck[] {
  const map = new Map<string, ToolCheck>();
  for (const r of results) {
    const key = normalizeName(r.name);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, r);
    } else {
      // Merge: a passing check wins; keep a version/message if helpful
      map.set(key, {
        name: prev.name.replace(/\s+present$/, ""),
        ok: prev.ok || r.ok,
        required: prev.required || r.required,
        version: prev.version ?? r.version,
        // prefer a message only if still failing
        message: (prev.ok || r.ok) ? undefined : (r.message ?? prev.message),
      });
    }
  }
  return Array.from(map.values());
}

export const doctorCommand = new Command("doctor")
  .description("Diagnose environment & provider CLIs")
  .option("--only <list>", "Comma-separated tools (e.g. git,vercel,supabase)")
  .action(async (opts: { only?: string }) => {
    const only = opts.only
      ? opts.only.split(",").map((s: string) => s.trim()).filter(Boolean)
      : undefined;

    const raw = await checkTools(only);
    const results = dedupeResults(raw);

    for (const r of results) {
      if (r.ok) {
        console.log(`✅ ${r.name} ${r.version ?? ""}`.trim());
      } else {
        console.log(`❌ ${r.name} ${r.message ? `- ${r.message}` : ""}`.trim());
        // Only show install hints for actual tools; not for env keys
        if (!/^together_api_key$/i.test(r.name)) {
          console.log(`   ↳ ${installHint(r.name)}`);
        }
      }
    }

    const hardMissing = results.filter(r => r.required && !r.ok);
    if (hardMissing.length) process.exitCode = 1;
  });
