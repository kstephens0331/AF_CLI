// src/services/brainstorm-interactive.ts
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import picocolors from "picocolors";
import { togetherChatCompletion } from "./llm.js";
import { loadBrainSession, saveBrainSession, buildBoardFromMessages, saveBoard } from "./brainstore.js";
import { chatToActionsSmart } from "./nl2actions.js";
import { executeActions } from "../core/actions.js";

type BrainstormMessage = {
  role: "user" | "assistant";
  content: string;
  ts: string;
};

function readCfg(root: string) {
  try {
    return yaml.load(fs.readFileSync(path.join(root, ".af/config.yml"), "utf-8")) as any;
  } catch {
    return {};
  }
}

/**
 * Check if user message is requesting to build/implement
 */
function isBuildTrigger(text: string): boolean {
  const triggers = [
    /^build\s+this$/i,
    /^build\s+it$/i,
    /^implement\s+this$/i,
    /^implement\s+it$/i,
    /^let'?s\s+build$/i,
    /^start\s+building$/i,
    /^make\s+it\s+happen$/i,
    /^execute\s+plan$/i,
    /^do\s+it$/i,
  ];
  return triggers.some(pattern => pattern.test(text.trim()));
}

/**
 * Extract implementation plan from brainstorm conversation
 */
async function extractImplementationPlan(
  cwd: string,
  model: string,
  messages: BrainstormMessage[]
): Promise<string> {
  const conversationContext = messages
    .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const prompt = `Based on this brainstorming conversation, create a concise implementation plan:

${conversationContext}

Provide a clear, actionable plan with:
1. Main objectives
2. Key components to build
3. Steps in order
4. Files/directories to create

Keep it brief and focused on what needs to be built.`;

  const plan = await togetherChatCompletion({
    cwd,
    model,
    temperature: 0.3,
    messages: [
      { role: "system", content: "You are an expert at turning brainstorm sessions into actionable implementation plans." },
      { role: "user", content: prompt }
    ]
  });

  return String(plan);
}

export type BrainstormInteractiveOptions = {
  session?: string;
};

/**
 * Interactive brainstorm mode with build triggers
 */
export async function startInteractiveBrainstorm(opts: BrainstormInteractiveOptions = {}): Promise<void> {
  const root = process.cwd();
  const cfg = readCfg(root);
  const sessionName = opts.session || "default";
  const model = cfg.routing?.planModel ?? cfg.model ?? "meta-llama/Llama-3.3-70B-Instruct-Turbo";

  let sess = await loadBrainSession(root, sessionName);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(picocolors.cyan("╭─────────────────────────────────────────╮"));
  console.log(picocolors.cyan("│") + picocolors.bold("  Brainstorm Session                    ") + picocolors.cyan("│"));
  console.log(picocolors.cyan("╰─────────────────────────────────────────╯"));
  console.log("");
  console.log(picocolors.gray(`Session: ${sessionName}`));
  console.log(picocolors.gray(`Model: ${model}`));
  console.log(picocolors.gray(`Mode: Ideation (no code changes)`));
  console.log("");
  console.log(picocolors.yellow("💡 Brainstorm freely. When ready to build, say:"));
  console.log(picocolors.yellow("   'build this', 'implement it', or 'let's build'"));
  console.log("");
  console.log(picocolors.gray("Commands: /exit, /board, /help"));
  console.log("");

  const processUserInput = async (input: string): Promise<boolean> => {
    if (input === "/exit") {
      await saveBrainSession(root, sess);
      console.log(picocolors.green("\n✓ Brainstorm session saved. Goodbye!"));
      rl.close();
      return true;
    }

    if (input === "/help") {
      console.log(picocolors.bold("\nCommands:"));
      console.log("  /exit       - Exit and save");
      console.log("  /board      - Show current board");
      console.log("  /plan       - Show implementation plan");
      console.log("  /build      - Trigger implementation");
      console.log("");
      console.log(picocolors.yellow("Build triggers:"));
      console.log("  'build this', 'implement it', 'let's build', etc.");
      console.log("");
      return false;
    }

    if (input === "/board") {
      const board = await buildBoardFromMessages({ cwd: root, model, messages: sess.messages });
      const paths = await saveBoard(root, sessionName, board);
      console.log(picocolors.cyan(`\n📋 Board saved to: ${paths.mdPath}`));
      console.log(picocolors.gray("\nGoals:"));
      board.goals?.forEach((g: string) => console.log(`  • ${g}`));
      console.log(picocolors.gray("\nNext Steps:"));
      board.nextSteps?.forEach((s: string) => console.log(`  • ${s}`));
      console.log("");
      return false;
    }

    if (input === "/plan") {
      console.log(picocolors.yellow("\n🔄 Generating implementation plan...\n"));
      const plan = await extractImplementationPlan(root, model, sess.messages);
      console.log(picocolors.cyan("📝 Implementation Plan:\n"));
      console.log(plan);
      console.log("");
      return false;
    }

    if (input === "/build" || isBuildTrigger(input)) {
      console.log(picocolors.yellow("\n🚀 Initiating build phase...\n"));

      // Step 1: Generate implementation plan
      console.log(picocolors.cyan("Step 1: Extracting implementation plan from brainstorm..."));
      const plan = await extractImplementationPlan(root, model, sess.messages);
      console.log(picocolors.green("✓ Plan extracted\n"));

      console.log(picocolors.cyan("═".repeat(60)));
      console.log(picocolors.bold(picocolors.white("IMPLEMENTATION PLAN")));
      console.log(picocolors.cyan("═".repeat(60)));
      console.log(plan);
      console.log(picocolors.cyan("═".repeat(60)));
      console.log("");

      // Step 2: Ask for confirmation
      const confirmPromise = new Promise<boolean>((resolve) => {
        const confirmRl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        confirmRl.question(
          picocolors.yellow("Proceed with implementation? (yes/no): "),
          (answer) => {
            confirmRl.close();
            resolve(answer.trim().toLowerCase() === "yes" || answer.trim().toLowerCase() === "y");
          }
        );
      });

      const shouldProceed = await confirmPromise;

      if (!shouldProceed) {
        console.log(picocolors.gray("\n⏸  Implementation cancelled. Continue brainstorming.\n"));
        return false;
      }

      // Step 3: Convert plan to actions
      console.log(picocolors.cyan("\nStep 2: Converting plan to executable actions..."));
      const actionPlan = await chatToActionsSmart({
        cwd: root,
        message: `Implement this plan:\n\n${plan}\n\nUse the existing project structure and follow best practices.`,
      });

      if (actionPlan.reply) {
        console.log(picocolors.blue("\n💭 " + actionPlan.reply + "\n"));
      }

      console.log(picocolors.green(`✓ Generated ${actionPlan.actions.length} actions\n`));

      // Step 4: Execute actions
      console.log(picocolors.cyan("Step 3: Executing actions...\n"));
      const result = await executeActions(root, cfg, actionPlan.actions as any);

      if (result.ok) {
        console.log(picocolors.green("\n✅ Implementation complete!\n"));

        // Update brainstorm with implementation notes
        const now = new Date().toISOString();
        sess.messages.push({
          role: "assistant",
          content: `✅ Implementation completed successfully. Plan executed with ${actionPlan.actions.length} actions.`,
          ts: now
        });
        await saveBrainSession(root, sess);

        // Update board
        const board = await buildBoardFromMessages({ cwd: root, model, messages: sess.messages });
        await saveBoard(root, sessionName, board);

        console.log(picocolors.gray("You can continue brainstorming or /exit"));
        console.log("");
      } else {
        console.log(picocolors.red("\n❌ Implementation failed:\n"));
        console.log(picocolors.red(result.errorLog));
        console.log("");
        console.log(picocolors.yellow("Fix the issues and try again, or continue brainstorming."));
        console.log("");
      }

      return false;
    }

    // Regular brainstorm message
    const now = new Date().toISOString();
    sess.messages.push({ role: "user", content: input, ts: now });

    try {
      const reply = await togetherChatCompletion({
        cwd: root,
        model,
        temperature: 0.5,
        messages: [
          {
            role: "system",
            content: "You are a thoughtful AI product/engineering partner. Ask clarifying questions, organize ideas, and evolve a concrete plan. When the user seems ready to build, remind them they can say 'build this' or 'implement it' to start implementation. Avoid making code changes here - this is for ideation only."
          },
          ...sess.messages.map(m => ({ role: m.role, content: m.content }))
        ] as any
      });

      const replyText = String(reply);
      sess.messages.push({ role: "assistant", content: replyText, ts: now });
      await saveBrainSession(root, sess);

      // Update board silently
      const board = await buildBoardFromMessages({ cwd: root, model, messages: sess.messages });
      await saveBoard(root, sessionName, board);

      console.log(picocolors.blue("\n💭 " + replyText + "\n"));

    } catch (err: any) {
      console.error(picocolors.red(`\n❌ Error: ${err.message}\n`));
    }

    return false;
  };

  // Main REPL loop
  await new Promise<void>((resolve) => {
    const prompt = () => process.stdout.write(picocolors.magenta("💡 "));

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