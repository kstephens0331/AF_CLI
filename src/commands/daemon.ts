import { Command } from "commander";
import { listTasks, setTaskStatus } from "../core/queue.js";
import { execa } from "execa";
import { log } from "../core/logger.js";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const daemonCommand = new Command("daemon")
  .description("Run a background loop that executes queued tasks sequentially")
  .option("--interval <ms>", "Poll interval in ms", "1500")
  .action(async (opts) => {
    const root = process.cwd();
    const interval = Number(opts.interval) || 1500;

    log.ok("Daemon started. Press CTRL+C to stop.");
     
    while (true) {
      const tasks = await listTasks(root);
      const next = tasks.find((t) => t.status === "queued");
      if (!next) {
        await sleep(interval);
        continue;
      }

      try {
        await setTaskStatus(root, next.id, "running");
        log.step(`Running task ${next.id} (${next.type})...`);

        if (next.type === "check") {
          await execa("node", ["./dist/bin/af.js", "check"], { stdio: "inherit" });
        } else if (next.type === "deploy") {
          await execa("node", ["./dist/bin/af.js", "deploy"], { stdio: "inherit" });
        } else if (next.type === "generate" || next.type === "edit") {
          const args = Array.isArray(next.meta?.args) ? (next.meta?.args as string[]) : [];
          await execa("node", ["./dist/bin/af.js", "run", ...args], { stdio: "inherit" });
        } else {
          log.warn(`Unknown task type: ${next.type}`);
        }

        await setTaskStatus(root, next.id, "done");
        log.ok(`Task ${next.id} done.`);
      } catch (e: any) {
        log.err(`Task ${next.id} failed: ${e?.message || e}`);
        await setTaskStatus(root, next.id, "failed", { error: String(e) });
      }
    }
  });
