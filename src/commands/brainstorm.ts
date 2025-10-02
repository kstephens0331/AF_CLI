import { Command } from "commander";
import { togetherChatCompletion } from "../services/llm.js";
import { loadBrainSession, saveBrainSession, buildBoardFromMessages, saveBoard } from "../services/brainstore.js";
import { startInteractiveBrainstorm } from "../services/brainstorm-interactive.js";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { log } from "../core/logger.js";

function readCfg(root: string) {
  return yaml.load(fs.readFileSync(path.join(root, ".af/config.yml"), "utf-8")) as any;
}

export const brainstormCommand = new Command("brainstorm")
  .description("Brainstorm in natural language (no file changes). Produces a living board of goals/decisions/risks/next-steps.")
  .argument("[message...]", "Your brainstorm message")
  .option("--new <name>", "Create a new brainstorm", "")
  .option("--session <name>", "Use an existing brainstorm name", "default")
  .option("--show", "Show current board after the reply")
  .option("-i, --interactive", "Start interactive brainstorm mode with build triggers")
  .action(async (message: string[], opts) => {
    // Interactive mode - launch REPL
    if (opts.interactive) {
      const sessionName = opts.new || opts.session;
      await startInteractiveBrainstorm({ session: sessionName });
      return;
    }

    // Original single-message mode
    const root = process.cwd();
    const cfg = readCfg(root);
    const name = opts.new || opts.session;

    let sess = await loadBrainSession(root, name);
    const text = message.join(" ").trim();

    if (!text) {
      log.info(`Opened brainstorm session "${name}". Type: af brainstorm "your thought"`);
      return;
    }

    // 1) get an assistant reply (dialogue)
    const reply = await togetherChatCompletion({
      cwd: root,
      model: cfg.routing?.planModel ?? cfg.model,
      temperature: 0.5,
      messages: [
        { role: "system", content: "You are a thoughtful AI product/engineering partner. Ask clarifying questions, organize ideas, and evolve a concrete plan. Avoid code changes here." },
        ...sess.messages.map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: text }
      ] as any
    });

    // 2) persist conversation
    const now = new Date().toISOString();
    sess.messages.push({ role: "user", content: text, ts: now });
    sess.messages.push({ role: "assistant", content: String(reply), ts: now });
    await saveBrainSession(root, sess);

    // 3) update the board
    const board = await buildBoardFromMessages({ cwd: root, model: cfg.routing?.planModel ?? cfg.model, messages: sess.messages });
    const paths = await saveBoard(root, name, board);

    // 4) print reply + (optional) board path
    console.log("\n" + reply + "\n");
    if (opts.show) {
      console.log(`Board updated:\n  ${paths.mdPath}\n`);
    } else {
      log.info(`Board updated (use --show to print path).`);
    }
  });
