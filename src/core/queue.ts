import { v4 as uuid } from "uuid";
import { loadState, saveState } from "./state.js";

export async function enqueue(cwd: string, task: Omit<Parameters<typeof createTask>[0], "id">) {
  const t = await createTask(task);
  const s = await loadState(cwd);
  s.tasks.push(t);
  await saveState(cwd, s);
  return t.id;
}

export async function createTask(task: {
  type: "generate" | "edit" | "deploy" | "check";
  meta?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  return { id: uuid(), type: task.type, status: "queued", createdAt: now, updatedAt: now, meta: task.meta ?? {} } as const;
}

export async function listTasks(cwd: string) {
  const s = await loadState(cwd);
  return s.tasks;
}

export async function setTaskStatus(
  cwd: string,
  id: string,
  status: "queued" | "running" | "paused-awaiting-human" | "done" | "failed",
  patch?: Record<string, unknown>
) {
  const s = await loadState(cwd);
  const t = s.tasks.find((x) => x.id === id);
  if (!t) throw new Error("Task not found");
  t.status = status;
  t.updatedAt = new Date().toISOString();
  if (patch) t.meta = { ...(t.meta ?? {}), ...patch };
  await saveState(cwd, s);
  return t;
}
