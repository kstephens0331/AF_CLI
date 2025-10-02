// src/commands/talk.ts
import { Command } from "commander";
import { startChatRepl } from "../services/repl.js";

export const talkCommand = new Command("talk")
  .description("Open a lightweight chat session")
  .option("--session <name>", "Session name", "talk")
  .option("--system <prompt>", "Custom system prompt")
  .option("--autopilot", "Let the agent continue automatically", false)
  .action(async (opts) => {
    await startChatRepl({
      session: opts.session || "talk",
      system:
        opts.system ||
        "You are a concise assistant. Keep answers short unless asked.",
      autopilot: !!opts.autopilot,
    });
  });
