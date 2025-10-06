import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ensureGithubRemote, commitAll, push } from "../services/integrations/github.js";
import { vercelDeploy } from "../services/integrations/vercel.js";
import { supabaseDbPush, supabaseLink } from "../services/integrations/supabase.js";
import { railwayUp } from "../services/integrations/railway.js";
import { log } from "../core/logger.js";
import { requireTools } from "../services/preflight.js";

export const deployCommand = new Command("deploy")
  .description("Validate, then deploy via GitHub/Vercel/Supabase/Railway")
  .option("--prod", "Production deployment", false)
  .action(async (opts: { prod?: boolean }) => {
    const root = process.cwd();
    const cfg = yaml.load(
      fs.readFileSync(path.join(root, ".af/config.yml"), "utf-8")
    ) as any;

    // 🔎 Preflight: ensure required CLIs are available
    const needed = ["git"];
    if (cfg?.deploy?.vercel)   needed.push("vercel");
    if (cfg?.deploy?.supabase) needed.push("supabase");
    if (cfg?.deploy?.railway)  needed.push("railway");
    await requireTools(needed);

    // Git push first so providers deploy the latest commit
    await ensureGithubRemote();
    await commitAll("chore(af): automated deploy");
    await push();

    // Providers (only those enabled in config)
    if (cfg?.deploy?.vercel) {
      await vercelDeploy(!!opts?.prod);
    }
    if (cfg?.deploy?.supabase) {
      await supabaseLink();
      await supabaseDbPush();
    }
    if (cfg?.deploy?.railway) {
      await railwayUp(opts?.prod ? "production" : "staging");
    }

    log.ok("Deployment pipeline complete.");
  });
