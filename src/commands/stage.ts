import { Command } from "commander";
import { createStaging, finalizeStagingToMain } from "../services/staging.js";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export const stageCommand = new Command("stage");

stageCommand
  .command("start")
  .description("Create a new staging branch")
  .action(async () => {
    const root = process.cwd();
    const cfg = yaml.load(fs.readFileSync(path.join(root, ".af/config.yml"), "utf-8")) as any;
    const branch = await createStaging(root, cfg.staging.branchPrefix);
    console.log(branch);
  });

stageCommand
  .command("finalize <branch>")
  .description("Merge staging branch into main")
  .action(async (branch: string) => {
    await finalizeStagingToMain(branch);
  });
