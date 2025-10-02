import { execa } from "execa";
import { log } from "../../core/logger.js";

export async function vercelDeploy(prod = false) {
  const args = ["vercel", prod ? "--prod" : "", "--confirm"].filter(Boolean);
  await execa("npx", args, { stdio: "inherit", shell: true });
  log.ok(prod ? "Vercel production deploy done" : "Vercel preview deploy done");
}

// New: set env across scopes non-interactively by writing to stdin
type VercelScope = "development" | "preview" | "production";
export async function vercelSetEnv(name: string, value: string, scopes: VercelScope[]) {
  for (const scope of scopes) {
    const child = execa("npx", ["vercel", "env", "add", name, scope], { shell: true });
    // Pipe the value and newline into the interactive prompt
    child.stdin?.write(value + "\n");
    child.stdin?.end();
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
    await child;
    log.ok(`Vercel env '${name}' set for ${scope}`);
  }
}
