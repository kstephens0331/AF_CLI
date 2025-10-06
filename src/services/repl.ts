// src/services/repl.ts
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { togetherChatCompletion } from "./llm.js";
import { executeActions, type Action } from "../core/actions.js";
import { findRoot } from "../core/root.js";
import { listProjectFiles } from "../core/sandbox.js";
import { Spinner as _Spinner } from "../utils/spinner.js";

/**
 * We support the flags your command files pass, even if this simple
 * REPL doesn't fully use them yet. This avoids TS errors while keeping
 * the door open for richer behavior later.
 */
export type ReplOptions = {
  session?: string;
  system?: string;
  autopilot?: boolean;
  extreme?: boolean;
};

type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
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

async function buildProjectContext(cwd: string): Promise<string> {
  const files = await listProjectFiles(cwd, false);
  const fileList = files.slice(0, 100).map(f => f.path).join("\n");
  return `Project files (showing first 100):\n${fileList}`;
}

function parseActions(text: string): Action[] {
  const actions: Action[] = [];

  // Match ```json ... ``` blocks
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g;
  let match;

  while ((match = jsonBlockRegex.exec(text)) !== null) {
    try {
      const jsonText = match[1].trim();
      const parsed = JSON.parse(jsonText);

      // Handle single action or array of actions
      const actionList = Array.isArray(parsed) ? parsed : [parsed];

      for (const action of actionList) {
        if (action.type && ["read_file", "write_file", "edit_file", "exec", "patch"].includes(action.type)) {
          actions.push(action as Action);
        }
      }
    } catch (_err) {
      // Silently skip invalid JSON blocks
    }
  }

  return actions;
}

export async function startChatRepl(opts: ReplOptions = {}): Promise<void> {
  // Visual theme configuration
  const _visualTheme = {
    autopilot: {
      spinner: {
        style: opts.extreme ? 'progress' : 'dots',
        speed: opts.extreme ? 60 : 100,
        color: opts.extreme ? '35' : '36'
      },
      status: opts.extreme ? '🚀' : '🤖',
      color: opts.extreme ? '\x1B[35m' : '\x1B[36m'
    }
  };
  const cwd = await findRoot(process.cwd()) || process.cwd();
  const cfg = readConfig(cwd);
  const sessionName = opts.session || "chat";

  let messages: Message[] = await loadSession(cwd, sessionName);

  // Add system message if not present
  if (messages.length === 0 && opts.system) {
    messages.push({
      role: "system",
      content: opts.system + `

You can perform file operations by responding with JSON actions in code blocks:

**Read a file:**
\`\`\`json
{"type": "read_file", "path": "src/example.ts", "description": "Reading example file"}
\`\`\`

**Write a new file:**
\`\`\`json
{"type": "write_file", "path": "src/new.ts", "content": "export const foo = 'bar';", "description": "Creating new file"}
\`\`\`

**Edit an existing file:**
\`\`\`json
{"type": "edit_file", "path": "src/example.ts", "oldContent": "old code here", "newContent": "new code here", "description": "Updating example"}
\`\`\`

**Execute a command:**
\`\`\`json
{"type": "exec", "cmd": "npm test", "description": "Running tests"}
\`\`\`

Always explain what you're doing before and after performing actions.`
    });
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const banner = [
    "💬 Interactive coding session. Type /exit to quit, /help for commands.",
    `Session: ${sessionName}`,
    `Model: ${cfg.routing?.codeModel || cfg.model || "deepseek-ai/DeepSeek-V3"}`,
    `Autopilot: ${opts.autopilot ? "ON" : "OFF"}`,
  ].join("\n");

  console.log(banner);

  const processUserInput = async (input: string) => {
    if (input === "/exit") {
      await saveSession(cwd, sessionName, messages);
      rl.close();
      return true;
    }

    if (input === "/help") {
      console.log(`
Commands:
  /exit     - Exit the REPL
  /help     - Show this help
  /context  - Show project context
  /clear    - Clear conversation history
  /save     - Save session manually
`);
      return false;
    }

    if (input === "/context") {
      const ctx = await buildProjectContext(cwd);
      console.log("\n" + ctx + "\n");
      return false;
    }

    if (input === "/clear") {
      messages = messages.filter(m => m.role === "system");
      console.log("✓ Conversation cleared\n");
      return false;
    }

    if (input === "/save") {
      await saveSession(cwd, sessionName, messages);
      console.log("✓ Session saved\n");
      return false;
    }

    // User message
    messages.push({ role: "user", content: input });

    try {
      // Call LLM
      const model = cfg.routing?.codeModel || cfg.model || "deepseek-ai/DeepSeek-V3";
      const response = await togetherChatCompletion({
        cwd,
        model,
        temperature: 0.2,
        messages: messages as any,
      });

      const responseText = String(response);

      // Add assistant response
      messages.push({ role: "assistant", content: responseText });

      // Display response
      console.log(`\n${responseText}\n`);

      // Parse and execute actions
      const actions = parseActions(responseText);
      if (actions.length > 0) {
        console.log(`\n🔧 Executing ${actions.length} action(s)...\n`);
        const result = await executeActions(cwd, cfg, actions);

        if (result.ok) {
          console.log("✓ Actions completed successfully\n");

          // If there are read results, add them to context
          if (result.data) {
            const toolResults = result.data.map((r: any) =>
              `File: ${r.path}\n\`\`\`\n${r.content}\n\`\`\``
            ).join("\n\n");
            messages.push({
              role: "tool",
              content: `Action results:\n${toolResults}`,
              name: "file_operations"
            });

            // Auto-continue if there were reads and autopilot is on
            if (opts.autopilot) {
              console.log("🤖 Auto-continuing...\n");
              const followUp = await togetherChatCompletion({
                cwd,
                model,
                temperature: 0.2,
                messages: messages as any,
              });
              const followUpText = String(followUp);
              messages.push({ role: "assistant", content: followUpText });
              console.log(`\n${followUpText}\n`);
            }
          }
        } else {
          console.error(`❌ Action failed: ${result.errorLog}\n`);
          messages.push({
            role: "tool",
            content: `Error: ${result.errorLog}`,
            name: "file_operations"
          });
        }
      }

      // Save session after each interaction
      await saveSession(cwd, sessionName, messages);

    } catch (err: any) {
      console.error(`\n❌ Error: ${err.message}\n`);
    }

    return false;
  };

  // Main REPL loop
  await new Promise<void>((resolve) => {
    const prompt = () => process.stdout.write("> ");

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
      console.log("\n👋 Goodbye!");
      resolve();
    });

    prompt();
  });
}