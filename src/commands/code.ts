// src/commands/code.ts
import { Command } from "commander";
import { startInteractiveMode } from "../services/interactive.js";

export const codeCommand = new Command("code")
  .description("Start an interactive coding session with tool calling (like Claude Code)")
  .option("--session <name>", "Session name", "code")
  .option("--system <prompt>", "Custom system prompt")
  .option("--no-tools", "Disable tool calling")
  .action(async (opts) => {
    await startInteractiveMode({
      session: opts.session || "code",
      system:
        opts.system ||
        "You are an expert coding assistant. Help the user understand and modify their codebase. Use tools to read files, make edits, and run commands as needed.",
      useTools: opts.tools !== false,
    });
  });