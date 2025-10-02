import { execa } from "execa";
import { log } from "../../core/logger.js";

export async function ensureGithubRemote() {
  try {
    await execa("git", ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    throw new Error("Not a git repository. Run `git init` first.");
  }
  log.ok("Git repository detected");
}

export async function commitAll(message: string) {
  await execa("git", ["add", "-A"], { stdio: "inherit" });
  await execa("git", ["commit", "-m", message], { stdio: "inherit", reject: false });
}

export async function push(branch?: string) {
  const args = ["push"];
  if (branch) args.push("origin", branch);
  await execa("git", args, { stdio: "inherit" });
}

// New: set repo secret via GitHub CLI
export async function githubSetSecret(name: string, value: string) {
  await execa("gh", ["secret", "set", name, "--body", value], { stdio: "inherit" });
  log.ok(`GitHub secret '${name}' set`);
}
