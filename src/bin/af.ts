#!/usr/bin/env node
import { Command } from "commander";
import { ensureProjectRoot, requireInitialized } from "../core/root.js";
import { initCommand } from "../commands/init.js";
import { authCommand } from "../commands/auth.js";
import { registerRunCommand } from "../commands/run.js";
import { queueCommand } from "../commands/queue.js";
import { resumeCommand } from "../commands/resume.js";
import { deployCommand } from "../commands/deploy.js";
import { checkCommand } from "../commands/check.js";
import { stageCommand } from "../commands/stage.js";
import { configCommand } from "../commands/config.js";
import { registerChatCommand } from "../commands/chat.js";
import { daemonCommand } from "../commands/daemon.js";
import { registerSpecCommand } from "../commands/spec.js";
import { indexCommand } from "../commands/index.js";
import { envCommand } from "../commands/env.js";
import { brainstormCommand } from "../commands/brainstorm.js";
import registerImplementCommand from "../commands/implement.js";
import { talkCommand } from "../commands/talk.js";
import { codeCommand } from "../commands/code.js";
import { doctorCommand } from "../commands/doctor.js";

const program = new Command();
program
  .name("af")
  .description("AeonForge single-root coding CLI powered by Together.ai")
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(authCommand);

program.hook("preAction", async (_thisCmd, actionCmd) => {
  if (!["init", "auth"].includes(actionCmd.name())) {
    await ensureProjectRoot(process.cwd());
    await requireInitialized(process.cwd());
  }
});

program.addCommand(configCommand);
program.addCommand(queueCommand);
registerRunCommand(program);
program.addCommand(resumeCommand);
program.addCommand(stageCommand);
program.addCommand(checkCommand);
program.addCommand(deployCommand);
registerChatCommand(program);
program.addCommand(daemonCommand);
registerSpecCommand(program);
program.addCommand(indexCommand);
program.addCommand(envCommand);
program.addCommand(brainstormCommand);
registerImplementCommand(program);
program.addCommand(talkCommand);
program.addCommand(codeCommand);
program.addCommand(doctorCommand);

program.parseAsync(process.argv);
