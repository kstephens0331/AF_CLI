import { Command } from "commander";
import { log } from "../core/logger.js";
import inquirer from "inquirer";
import { saveTogetherKey } from "../services/keys.js";

export const authCommand = new Command("auth")
  .description("One-time auth capture (Together, GitHub/Vercel/Supabase/Railway)")
  .option("--noninteractive", "Skip prompts; read from env")
  .action(async (opts) => {
    const root = process.cwd();

    if (opts.noninteractive) {
      const key = process.env.TOGETHER_API_KEY;
      if (!key) throw new Error("TOGETHER_API_KEY missing");
      await saveTogetherKey(root, key);
      log.ok("Stored Together key (keychain if available, else .af/.env).");
    } else {
      const { together } = await inquirer.prompt([
        { type: "password", name: "together", message: "Together API Key:", mask: "*" }
      ]);
      await saveTogetherKey(root, together);
      log.ok("Stored Together key (keychain if available, else .af/.env).");
      log.info("Authenticate provider CLIs once:");
      console.log("- gh auth login");
      console.log("- vercel login");
      console.log("- supabase login");
      console.log("- railway login");
      log.ok("Auth step complete.");
    }
  });
