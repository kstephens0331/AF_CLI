import { Command } from "commander";
import { enqueue, listTasks } from "../core/queue.js";

export const queueCommand = new Command("queue");

queueCommand
  .command("add <type> [meta...]")
  .description("Add a task (generate|edit|check|deploy)")
  .action(async (type: string, meta: string[]) => {
    const id = await enqueue(process.cwd(), { type: type as any, meta: { args: meta } });
    console.log(id);
  });

queueCommand
  .command("ls")
  .description("List tasks")
  .action(async () => {
    const tasks = await listTasks(process.cwd());
    console.table(tasks.map(({ id, type, status, createdAt, updatedAt }) => ({ id, type, status, createdAt, updatedAt })));
  });
