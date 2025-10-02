import fs from "node:fs";
import path from "node:path";
import { findRoot } from "./root.js";
import type { Action } from "./taskschema.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string; time: string };
export type ChatSession = {
  name: string;
  createdAt: string;
  messages: ChatMessage[];
  pendingActions?: Action[];
};

function sessionsDir(root: string) {
  return path.join(root, ".af/state/chats");
}

export async function loadSession(cwd: string, name: string): Promise<ChatSession | null> {
  const root = await findRoot(cwd);
  if (!root) throw new Error("No root");
  const p = path.join(sessionsDir(root), `${name}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as ChatSession;
}

export async function saveSession(cwd: string, session: ChatSession) {
  const root = await findRoot(cwd);
  if (!root) throw new Error("No root");
  const dir = sessionsDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${session.name}.json`);
  fs.writeFileSync(p, JSON.stringify(session, null, 2));
}

export async function createSession(cwd: string, name?: string) {
  const root = await findRoot(cwd);
  if (!root) throw new Error("No root");
  const nm = name ?? `chat-${Date.now()}`;
  const sess: ChatSession = { name: nm, createdAt: new Date().toISOString(), messages: [] };
  await saveSession(cwd, sess);
  return sess;
}

export function appendMessage(sess: ChatSession, role: ChatMessage["role"], content: string) {
  sess.messages.push({ role, content, time: new Date().toISOString() });
}
