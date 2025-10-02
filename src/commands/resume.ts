import { Command } from "commander";
import { setTaskStatus } from "../core/queue.js";
import { log } from "../core/logger.js";

export const resumeCommand = new Command("resume")
  .description("Resume a paused task after completing human actions")
  .argument("<taskId>", "Task to resume")
  .action(async (taskId: string) => {
    await setTaskStatus(process.cwd(), taskId, "queued");
    log.ok(`Task ${taskId} resumed`);
  });
