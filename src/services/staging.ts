import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { findRoot } from "../core/root.js";
import { log } from "../core/logger.js";

export async function createStaging(cwd: string, branchPrefix: string) {
  const root = await findRoot(cwd);
  if (!root) throw new Error("No root");
  const branch = `${branchPrefix}${Date.now()}`;
  await execa("git", ["checkout", "-B", branch], { stdio: "inherit" });
  const stageDir = path.join(root, ".af/staging");
  if (!fs.existsSync(stageDir)) fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(path.join(stageDir, "README.txt"), "staging artifacts\n");
  log.ok(`Staging branch ${branch} ready`);
  return branch;
}

export async function finalizeStagingToMain(branch: string) {
  await execa("git", ["checkout", "main"], { stdio: "inherit", reject: false });
  await execa("git", ["merge", "--no-ff", branch], { stdio: "inherit" });
}
