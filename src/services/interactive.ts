// src/services/interactive.ts - Rich interactive mode with tool calling
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import picocolors from "picocolors";
import { togetherChatWithTools, type ChatCompletionResponse } from "./llm.js";
import { TOOL_DEFINITIONS, executeTool } from "./tools.js";
import { findRoot } from "../core/root.js";

type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
};

export type InteractiveOptions = {
  session?: string;
  system?: string;
  useTools?: boolean;
};

function readConfig(cwd: string): any {
  try {
    const cfgPath = path.join(cwd, ".af", "config.yml");
    if (fs.existsSync(cfgPath)) {
      return yaml.load(fs.readFileSync(cfgPath, "utf-8")) ?? {};
    }
  } catch {}
  return {};
}

async function loadSession(cwd: string, sessionName: string): Promise<Message[]> {
  const sessionPath = path.join(cwd, ".af", "sessions", `${sessionName}.json`);
  if (fs.existsSync(sessionPath)) {
    try {
      return JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
    } catch {}
  }
  return [];
}

async function saveSession(cwd: string, sessionName: string, messages: Message[]): Promise<void> {
  const sessionDir = path.join(cwd, ".af", "sessions");
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `${sessionName}.json`);
  fs.writeFileSync(sessionPath, JSON.stringify(messages, null, 2), "utf-8");
}

/**
 * Enhanced interactive mode with proper tool calling support
 */
export async function startInteractiveMode(opts: InteractiveOptions = {}): Promise<void> {
  const cwd = await findRoot(process.cwd()) || process.cwd();
  const cfg = readConfig(cwd);
  const sessionName = opts.session || "interactive";
  const useTools = opts.useTools !== false; // default true

  let messages: Message[] = await loadSession(cwd, sessionName);

  // Add system message if not present
  if (messages.length === 0 && opts.system) {
    messages.push({
      role: "system",
      content: opts.system + (useTools ? `

You have access to tools to interact with the project files and execute commands. Use them naturally when needed:
- read_file: Read file contents
- write_file: Create or overwrite files
- edit_file: Edit existing files by replacing content
- list_files: List project files
- exec_command: Run shell commands

Always explain what you're doing and provide context for your actions.` : "")
    });
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const model = cfg.routing?.codeModel || cfg.model || "deepseek-ai/DeepSeek-V3";
  const allowlist = cfg.shellAllowlist || [];

  console.log(picocolors.cyan("╭─────────────────────────────────────────╮"));
  console.log(picocolors.cyan("│") + picocolors.bold("  Interactive Coding Assistant          ") + picocolors.cyan("│"));
  console.log(picocolors.cyan("╰─────────────────────────────────────────╯"));
  console.log("");
  console.log(picocolors.gray(`Session: ${sessionName}`));
  console.log(picocolors.gray(`Model: ${model}`));
  console.log(picocolors.gray(`Tools: ${useTools ? "enabled" : "disabled"}`));
  console.log(picocolors.gray(`Type /exit to quit, /help for commands`));
  console.log("");

  const processUserInput = async (input: string): Promise<boolean> => {
    if (input === "/exit") {
      await saveSession(cwd, sessionName, messages);
      console.log(picocolors.green("✓ Session saved. Goodbye!"));
      rl.close();
      return true;
    }

    if (input === "/help") {
      console.log(picocolors.bold("\nCommands:"));
      console.log("  /exit       - Exit and save session");
      console.log("  /help       - Show this help");
      console.log("  /clear      - Clear conversation history");
      console.log("  /save       - Save session manually");
      console.log("  /tools on   - Enable tool calling");
      console.log("  /tools off  - Disable tool calling");
      console.log("");
      return false;
    }

    if (input === "/clear") {
      messages = messages.filter(m => m.role === "system");
      console.log(picocolors.green("✓ Conversation cleared\n"));
      return false;
    }

    if (input === "/save") {
      await saveSession(cwd, sessionName, messages);
      console.log(picocolors.green("✓ Session saved\n"));
      return false;
    }

    if (input.startsWith("/tools ")) {
      const setting = input.split(" ")[1];
      console.log(picocolors.yellow(`Tool calling ${setting === "on" ? "enabled" : "disabled"}\n`));
      return false;
    }

    // User message
    messages.push({ role: "user", content: input });

    try {
      let continueLoop = true;
      let maxIterations = 10; // prevent infinite loops
      let iteration = 0;

      while (continueLoop && iteration < maxIterations) {
        iteration++;

        // Call LLM with tools
        const response: ChatCompletionResponse = await togetherChatWithTools({
          cwd,
          model,
          messages: messages as any,
          tools: useTools ? TOOL_DEFINITIONS : undefined,
          temperature: 0.2,
        });

        // If there's text content, display it
        if (response.content) {
          console.log(picocolors.blue("\n✨ Assistant:"));
          console.log(response.content);
          console.log("");
        }

        // Add assistant message to history
        messages.push({
          role: "assistant",
          content: response.content || "",
          tool_calls: response.tool_calls
        });

        // If there are tool calls, execute them
        if (response.tool_calls && response.tool_calls.length > 0) {
          console.log(picocolors.yellow(`🔧 Executing ${response.tool_calls.length} tool call(s)...\n`));

          for (const toolCall of response.tool_calls) {
            const toolName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);

            console.log(picocolors.gray(`  → ${toolName}(${JSON.stringify(args).slice(0, 60)}...)`));

            const result = await executeTool(cwd, toolName, args, allowlist);

            if (result.success) {
              console.log(picocolors.green(`    ✓ ${result.result?.slice(0, 100) || "Success"}`));

              // Add tool result to messages
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: toolName,
                content: result.result || "Success"
              });
            } else {
              console.log(picocolors.red(`    ✗ ${result.error}`));

              // Add error to messages
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: toolName,
                content: `Error: ${result.error}`
              });
            }
          }

          console.log("");
          // Continue the loop to let the LLM respond to tool results
        } else {
          // No more tool calls, we're done
          continueLoop = false;
        }
      }

      // Save session after each interaction
      await saveSession(cwd, sessionName, messages);

    } catch (err: any) {
      console.error(picocolors.red(`\n❌ Error: ${err.message}\n`));
    }

    return false;
  };

  // Main REPL loop
  await new Promise<void>((resolve) => {
    const prompt = () => process.stdout.write(picocolors.cyan("> "));

    rl.on("line", async (line) => {
      const input = line.trim();
      if (input) {
        const shouldExit = await processUserInput(input);
        if (shouldExit) {
          resolve();
          return;
        }
      }
      prompt();
    });

    rl.on("close", () => {
      resolve();
    });

    prompt();
  });
}