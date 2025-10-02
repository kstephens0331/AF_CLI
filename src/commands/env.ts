import { Command } from "commander";
import { updateEnvFile } from "../services/env.js";
import { githubSetSecret } from "../services/integrations/github.js";
import { vercelSetEnv } from "../services/integrations/vercel.js";
import { railwaySetVariable } from "../services/integrations/railway.js";
import { log } from "../core/logger.js";

export const envCommand = new Command("env");

envCommand
  .command("set <NAME> <VALUE>")
  .description("Set an env var locally and/or on providers")
  .option("--providers <list>", "Comma-separated: local,github,vercel,railway", "local")
  .option("--scopes <list>", "For Vercel: development,preview,production", "development,preview,production")
  .option("--service <name>", "Railway service name (optional)")
  .action(async (name: string, value: string, opts) => {
    const root = process.cwd();
    const providers = String(opts.providers).split(",").map((s: string) => s.trim()) as Array<
      "local" | "github" | "vercel" | "railway"
    >;
    const scopes = String(opts.scopes).split(",").map((s: string) => s.trim()) as any;

    if (providers.includes("local")) {
      await updateEnvFile(root, { [name]: value });
      log.ok(`.env updated: ${name}`);
    }
    if (providers.includes("github")) await githubSetSecret(name, value);
    if (providers.includes("vercel")) await vercelSetEnv(name, value, scopes);
    if (providers.includes("railway")) await railwaySetVariable(name, value, opts.service);
  });
