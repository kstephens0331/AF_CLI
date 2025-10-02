import { execa } from "execa";
import { log } from "../core/logger.js";

export async function runChecks(commands: { typecheck: string; lint: string; test: string }) {
  log.step("Typechecking...");
  await execaCommand(commands.typecheck);
  log.ok("Typecheck passed");

  log.step("Linting...");
  await execaCommand(commands.lint);
  log.ok("Lint passed");

  log.step("Tests...");
  await execaCommand(commands.test);
  log.ok("Tests passed");
}

async function execaCommand(cmd: string) {
  const child = execa(cmd, { stdio: "inherit", shell: true });
  await child;
}
