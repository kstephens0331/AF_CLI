import { setTaskStatus } from "./queue.js";

export async function requestHumanAction(
  cwd: string,
  taskId: string,
  instruction: string,
  checklist: string[]
) {
  await setTaskStatus(cwd, taskId, "paused-awaiting-human", { instruction, checklist });
  return { instruction, checklist };
}
