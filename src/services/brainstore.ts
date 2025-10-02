import fs from "node:fs";
import path from "node:path";
import { findRoot } from "../core/root.js";
import { togetherChatCompletion } from "./llm.js";

export type BrainMsg = {
  role: "user" | "assistant";
  content: string;
  ts: string;
};

export type BrainBoard = {
  summary: string;
  goals: string[];
  decisions: string[];
  constraints: string[];
  nonGoals: string[];
  questions: string[];
  risks: string[];
  nextSteps: string[];
};

export async function brainstormDir(cwd: string) {
  const root = await findRoot(cwd);
  if (!root) throw new Error("Not a git repo (run `git init` first).");
  const dir = path.join(root, ".af", "brainstorm");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function loadBrainSession(cwd: string, name: string) {
  const dir = await brainstormDir(cwd);
  const p = path.join(dir, `${name}.json`);
  if (!fs.existsSync(p)) return { name, messages: [] as BrainMsg[] };
  return JSON.parse(fs.readFileSync(p, "utf-8")) as { name: string; messages: BrainMsg[] };
}

export async function saveBrainSession(cwd: string, sess: { name: string; messages: BrainMsg[] }) {
  const dir = await brainstormDir(cwd);
  const p = path.join(dir, `${sess.name}.json`);
  fs.writeFileSync(p, JSON.stringify(sess, null, 2), "utf-8");
  return p;
}

const BoardSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    goals: { type: "array", items: { type: "string" } },
    decisions: { type: "array", items: { type: "string" } },
    constraints: { type: "array", items: { type: "string" } },
    nonGoals: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    nextSteps: { type: "array", items: { type: "string" } }
  },
  required: ["summary","goals","decisions","constraints","nonGoals","questions","risks","nextSteps"],
  additionalProperties: false
} as const;

export async function buildBoardFromMessages(opts: {
  cwd: string;
  model: string; // plan model
  messages: BrainMsg[];
}) {
  const { cwd, model, messages } = opts;
  const chat = [
    {
      role: "system",
      content:
        [
          "You are a product/engineering facilitator.",
          "Given the conversation, produce a concise board of SUMMARY, GOALS, DECISIONS, CONSTRAINTS, NON-GOALS, QUESTIONS, RISKS, NEXT-STEPS.",
          "Return STRICT JSON only (the schema is provided). Keep bullets crisp and implementation-ready."
        ].join("\n")
    } as const,
    {
      role: "user",
      content:
        "Conversation transcript:\n" +
        messages.map(m => `[${m.role.toUpperCase()} @ ${m.ts}] ${m.content}`).join("\n")
    } as const
  ];

  const json = await togetherChatCompletion({
    cwd,
    model,
    messages: chat as any,
    temperature: 0.1,
    maxTokens: 2000
  });

  let board: BrainBoard;
  try {
    board = JSON.parse(String(json).trim().replace(/^```json\s*/i, "").replace(/```$/i, "")) as BrainBoard;
  } catch (e) {
    // ultra-safe fallback: generate a minimal board
    board = {
      summary: "Draft",
      goals: [], decisions: [], constraints: [], nonGoals: [], questions: [], risks: [], nextSteps: []
    };
  }
  return board;
}

export async function saveBoard(cwd: string, name: string, board: BrainBoard) {
  const dir = await brainstormDir(cwd);
  const jsonPath = path.join(dir, `${name}.board.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(board, null, 2), "utf-8");

  const md = [
    `# Brainstorm Board: ${name}`,
    "",
    `## Summary`,
    board.summary || "_(empty)_",
    "",
    `## Goals`,
    ...(board.goals.length ? board.goals.map(b => `- ${b}`) : ["- _(none)_"]),
    "",
    `## Decisions`,
    ...(board.decisions.length ? board.decisions.map(b => `- ${b}`) : ["- _(none)_"]),
    "",
    `## Constraints`,
    ...(board.constraints.length ? board.constraints.map(b => `- ${b}`) : ["- _(none)_"]),
    "",
    `## Non-Goals`,
    ...(board.nonGoals.length ? board.nonGoals.map(b => `- ${b}`) : ["- _(none)_"]),
    "",
    `## Open Questions`,
    ...(board.questions.length ? board.questions.map(b => `- ${b}`) : ["- _(none)_"]),
    "",
    `## Risks`,
    ...(board.risks.length ? board.risks.map(b => `- ${b}`) : ["- _(none)_"]),
    "",
    `## Next Steps`,
    ...(board.nextSteps.length ? board.nextSteps.map(b => `- ${b}`) : ["- _(none)_"]),
    ""
  ].join("\n");

  const mdPath = path.join(dir, `${name}.board.md`);
  fs.writeFileSync(mdPath, md, "utf-8");
  return { jsonPath, mdPath };
}
