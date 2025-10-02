// src/commands/run.ts
import { Command } from "commander";
import { loadConfig } from "../services/config.js";
import { codeWithSmartRouting } from "../services/llm.js";

export function registerRunCommand(program: Command) {
  program
    .command("run")
    .description("Ask the LLM to reason or write code for the current repo snapshot")
    .argument("<prompt...>", "The instruction/prompt")
    .action(async (promptParts: string[]) => {
      const root = process.cwd();
      const cfg = loadConfig(root);

      const prompt = promptParts.join(" ");
      const reply = await codeWithSmartRouting({
        prompt,
        system:
          "You are a careful, precise coding assistant. Prefer minimal diffs and working code.",
        model: cfg.model,
        temperature: 0.2,
        cwd: root,
      });

      // Print raw text (already a string)
      process.stdout.write(String(reply) + "\n");
    });
}
