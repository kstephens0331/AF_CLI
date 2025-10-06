import { Command } from "commander";
import { runChecks } from "../services/testRunner.js";

export const checkCommand = new Command("check")
  .description("Run typecheck, lint, and tests as configured")
  .action(async () => {
    // Let the runner load config and handle legacy keys.
    await runChecks();
  });