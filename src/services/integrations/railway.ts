import { execa } from "execa";
import { log } from "../../core/logger.js";

export async function railwayUp(env: "staging" | "production") {
  await execa("npx", ["railway", "up", "--service", env], { stdio: "inherit", shell: true });
  log.ok(`Railway ${env} updated`);
}

// New: set a project/service variable.
// If your project uses multiple services, you can extend this with a --service flag.
export async function railwaySetVariable(name: string, value: string, service?: string) {
  const args = ["railway", "variables", "set", `${name}=${value}`];
  if (service) args.push("--service", service);
  await execa("npx", args, { stdio: "inherit", shell: true });
  log.ok(`Railway variable '${name}' set${service ? ` (service: ${service})` : ""}`);
}
