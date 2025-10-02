// src/services/llm.ts
import fs from "node:fs";
import path from "node:path";
import { getTogetherKey } from "./keys.js";

type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ChatCompletionResponse = {
  content: string;
  tool_calls?: ToolCall[];
};

/**
 * Call Together.ai chat completion API
 */
export async function togetherChatCompletion(opts: {
  cwd: string;
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = await getTogetherKey(opts.cwd) || process.env.TOGETHER_API_KEY;
  if (!apiKey) {
    throw new Error("TOGETHER_API_KEY not found. Run `af auth` first.");
  }

  const response = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 8000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Together API error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Call Together.ai with tool support (function calling)
 */
export async function togetherChatWithTools(opts: {
  cwd: string;
  model: string;
  messages: Message[];
  tools?: any[];
  temperature?: number;
  maxTokens?: number;
}): Promise<ChatCompletionResponse> {
  const apiKey = await getTogetherKey(opts.cwd) || process.env.TOGETHER_API_KEY;
  if (!apiKey) {
    throw new Error("TOGETHER_API_KEY not found. Run `af auth` first.");
  }

  const body: any = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 8000,
  };

  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = "auto";
  }

  const response = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Together API error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as any;
  const message = data.choices?.[0]?.message;

  return {
    content: message?.content || "",
    tool_calls: message?.tool_calls || undefined
  };
}

/**
 * Very lightweight snapshot for LLM context: file tree + small snippets.
 * Avoids heavy IO; adjust as needed.
 */
export function snapshotProjectForLLM(root: string, maxFiles = 200): string {
  const ignore = new Set(["node_modules", ".git", ".af", "dist", "build"]);
  const files: string[] = [];

  function walk(dir: string) {
    if (files.length >= maxFiles) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignore.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        files.push(path.relative(root, full));
        if (files.length >= maxFiles) return;
      }
    }
  }
  walk(root);

  const preview: string[] = [];
  for (const rel of files.slice(0, maxFiles)) {
    const full = path.join(root, rel);
    try {
      const raw = fs.readFileSync(full, "utf8");
      const head = raw.slice(0, 800); // small preview
      preview.push(`--- ${rel} ---\n${head}`);
    } catch {
      // ignore read errors
    }
  }

  return [
    "## Project Snapshot",
    `Root: ${root}`,
    `Files (${files.length}):`,
    files.join("\n"),
    "",
    "## Previews",
    preview.join("\n\n"),
  ].join("\n");
}

/**
 * Simple router: just call togetherChatCompletion with optional context.
 */
export async function codeWithSmartRouting(opts: {
  prompt: string;
  system?: string;
  model?: string;
  temperature?: number;
  context?: string;
  cwd?: string;
}): Promise<string> {
  const {
    prompt,
    system = "",
    model = process.env.TOGETHER_MODEL || "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    temperature = 0.2,
    context,
    cwd = process.cwd(),
  } = opts;

  const content = context ? `${context}\n\n${prompt}` : prompt;

  const text = await togetherChatCompletion({
    cwd,
    model,
    temperature,
    messages: [
      ...(system ? [{ role: "system" as const, content: system }] : []),
      { role: "user" as const, content },
    ],
  });

  return String(text);
}
