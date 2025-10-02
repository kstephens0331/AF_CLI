import { Command } from "commander";
import { buildRepoIndex } from "../services/indexer.js";
import { log } from "../core/logger.js";

export const indexCommand = new Command("index")
  .description("Analyze the repository and save an index to .af/cache/repo-index.json")
  .action(async () => {
    const root = process.cwd();
    const p = await buildRepoIndex(root);
    log.ok(`Repo index written: ${p}`);
  });
