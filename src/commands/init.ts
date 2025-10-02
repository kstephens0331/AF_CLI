import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import inquirer from "inquirer";
import { Command } from "commander";
import { execa } from "execa";
import { log } from "../core/logger.js";
import { ConfigSchema } from "../core/root.js";
import { saveTogetherKey } from "../services/keys.js";
import { startChatRepl } from "../services/repl.js";

async function ensureGitRepo(root: string) {
  if (!fs.existsSync(path.join(root, ".git"))) {
    log.warn("No .git found, running git init...");
    await execa("git", ["init"], { stdio: "inherit" });
  }
}

async function writeDefaultConfig(root: string) {
  const cfgDir = path.join(root, ".af");
  fs.mkdirSync(cfgDir, { recursive: true });
  const cfgPath = path.join(cfgDir, "config.yml");
  if (!fs.existsSync(cfgPath)) {
    const defaultCfg = ConfigSchema.parse({ root });
    fs.writeFileSync(cfgPath, yaml.dump(defaultCfg));
    log.ok(`Created ${cfgPath}`);
  } else {
    log.info("Config already exists; leaving as-is.");
  }
  fs.mkdirSync(path.join(cfgDir, "state"), { recursive: true });
  fs.mkdirSync(path.join(cfgDir, "backups"), { recursive: true });
  fs.mkdirSync(path.join(cfgDir, "cache"), { recursive: true });
}

async function autoTogetherAuth(root: string, noninteractive = false) {
  let key = process.env.TOGETHER_API_KEY;
  if (!key && !noninteractive) {
    const ans = await inquirer.prompt([
      { type: "password", name: "together", message: "Together API Key:", mask: "*" }
    ]);
    key = ans.together?.trim();
  }
  if (!key) {
    throw new Error(
      "TOGETHER_API_KEY not provided. Re-run with the env set, or run `af auth`, or omit --noninteractive to be prompted."
    );
  }
  await saveTogetherKey(root, key);
  log.ok("Together API key stored (keychain if available, else .af/.env).");
}

async function checkOrLoginGh() {
  try {
    await execa("gh", ["auth", "status"], { stdio: "ignore" });
    log.ok("GitHub CLI is authenticated.");
  } catch {
    log.info("GitHub CLI not authenticated. Launching `gh auth login`…");
    await execa("gh", ["auth", "login"], { stdio: "inherit" });
  }
}

async function checkOrLoginVercel() {
  try {
    await execa("npx", ["vercel", "whoami"], { stdio: "ignore", shell: true });
    log.ok("Vercel CLI is authenticated.");
  } catch {
    log.info("Vercel CLI not authenticated. Launching `vercel login`…");
    await execa("npx", ["vercel", "login"], { stdio: "inherit", shell: true });
  }
}

async function checkOrLoginRailway() {
  try {
    await execa("npx", ["railway", "whoami"], { stdio: "ignore", shell: true });
    log.ok("Railway CLI is authenticated.");
  } catch {
    log.info("Railway CLI not authenticated. Launching `railway login`…");
    await execa("npx", ["railway", "login"], { stdio: "inherit", shell: true });
  }
}

async function checkOrLoginSupabase() {
  try {
    await execa("npx", ["supabase", "projects", "list"], { stdio: "ignore", shell: true });
    log.ok("Supabase CLI is authenticated.");
  } catch {
    log.info("Supabase CLI not authenticated. Launching `supabase login`…");
    await execa("npx", ["supabase", "login"], { stdio: "inherit", shell: true });
  }
}

export const initCommand = new Command("init")
  .description("Initialize AeonForge CLI in current repo, capture auth, then open chat")
  .option("--noninteractive", "Read TOGETHER_API_KEY from env (no prompt)", false)
  .option("--skip-provider-login", "Do not check/login GitHub/Vercel/Supabase/Railway", false)
  .option("--no-chat", "Do not start the chat REPL after init") // <— NEW
  .action(async (opts) => {
    const root = process.cwd();

    await ensureGitRepo(root);
    await writeDefaultConfig(root);
    await autoTogetherAuth(root, !!opts.noninteractive);

    if (!opts.skipProviderLogin) {
      try { await checkOrLoginGh(); } catch { log.warn("Skipping GitHub login."); }
      try { await checkOrLoginVercel(); } catch { log.warn("Skipping Vercel login."); }
      try { await checkOrLoginRailway(); } catch { log.warn("Skipping Railway login."); }
      try { await checkOrLoginSupabase(); } catch { log.warn("Skipping Supabase login."); }
    } else {
      log.info("Skipping provider login checks (per --skip-provider-login).");
    }

    log.ok("Initialization complete.");

    // Auto-launch chat unless --no-chat was passed
    if (opts.chat !== false) {
      console.log("");
      console.log("Opening interactive chat… (type /help for commands)\n");
      await startChatRepl({
        session: "init",
        system: "You are a helpful coding copilot for this repo. Prefer robust, production-ready scaffolds.",
        autopilot: true, // <-- default ON so first message will build
      });
    }
    });
