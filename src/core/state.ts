import fs from "node:fs";
import path from "node:path";
import { findRoot } from "./root.js";

type Task = {
  id: string;
  type: "generate" | "edit" | "deploy" | "check";
  status: "queued" | "running" | "paused-awaiting-human" | "done" | "failed";
  createdAt: string;
  updatedAt: string;
  meta?: Record<string, unknown>;
};

type State = {
  tasks: Task[];
  auth: { initialized: boolean; storedAt: string };
};

export async function loadState(cwd: string): Promise<State> {
  const root = await findRoot(cwd);
  if (!root) throw new Error("No root");
  const p = path.join(root, ".af/state/state.json");
  if (!fs.existsSync(path.dirname(p))) fs.mkdirSync(path.dirname(p), { recursive: true });
  if (!fs.existsSync(p)) {
    const blank: State = { tasks: [], auth: { initialized: false, storedAt: "" } };
    fs.writeFileSync(p, JSON.stringify(blank, null, 2));
    return blank;
  }
  return JSON.parse(fs.readFileSync(p, "utf-8")) as State;
}

export async function saveState(cwd: string, s: State) {
  const root = await findRoot(cwd);
  if (!root) throw new Error("No root");
  const p = path.join(root, ".af/state/state.json");
  fs.writeFileSync(p, JSON.stringify(s, null, 2));
}
