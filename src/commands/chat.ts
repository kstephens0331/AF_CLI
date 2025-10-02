// src/commands/chat.ts
import { Command } from "commander";
import { startChatRepl } from "../services/repl.js";

export function registerChatCommand(program: Command) {
  program
    .command("chat")
    .description("Open the interactive coding chat for this repo")
    .option("--session <name>", "Session name", "chat")
    .option("--system <prompt>", "Custom system prompt")
    .option("--autopilot", "Let the agent continue automatically", false)
    .action(async (opts) => {
      await startChatRepl({
        session: opts.session || "chat",
        system:
          opts.system ||
          "You are a helpful coding copilot for this repo. Prefer robust, production-ready scaffolds.",
        autopilot: !!opts.autopilot,
      });
    });
}
