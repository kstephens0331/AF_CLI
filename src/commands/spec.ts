// src/commands/spec.ts
import { Command } from "commander";
import { loadConfig } from "../services/config.js";
import { codeWithSmartRouting } from "../services/llm.js";

export function registerSpecCommand(program: Command) {
  program
    .command("spec")
    .description("Generate or refine a product.spec.yml by analyzing the repo")
    .argument("[prompt...]", "Optional instruction; otherwise ask for a spec")
    .action(async (promptParts: string[]) => {
      const root = process.cwd();
      const cfg = loadConfig(root);

      const userPrompt =
        promptParts.length > 0
          ? promptParts.join(" ")
          : "Generate or refine product.spec.yml for this repository.";

      const reply = await codeWithSmartRouting({
        prompt: userPrompt,
        system:
          "You are an expert product spec writer. Produce concise, practical requirements.",
        model: cfg.model,
        temperature: 0.2,
        cwd: root,
      });

      process.stdout.write(String(reply) + "\n");
    });
}
