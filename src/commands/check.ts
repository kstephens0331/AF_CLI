import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { runChecks } from "../services/testRunner.js";

export const checkCommand = new Command("check")
  .description("Run typecheck, lint, and tests as configured")
  .action(async () => {
    const root = process.cwd();
    const cfg = yaml.load(fs.readFileSync(path.join(root, ".af/config.yml"), "utf-8")) as any;
    await runChecks(cfg.testing);
  });
