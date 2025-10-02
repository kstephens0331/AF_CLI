import { execa } from "execa";
import fs from "node:fs";
import path from "node:path";

async function sh(cmd: string, args: string[], opts: any = {}) {
  return execa(cmd, args, { stdio: "inherit", ...opts });
}
async function shOut(cmd: string, args: string[], opts: any = {}) {
  const res = await execa(cmd, args, { stdio: ["ignore", "pipe", "inherit"], ...opts });
  const out: string = typeof res.stdout === "string" ? res.stdout : "";
  return out.trim();
}

async function hasAnyCommit(): Promise<boolean> {
  try {
    await execa("git", ["rev-parse", "--verify", "HEAD"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function ensureInitialCommit(root: string) {
  if (await hasAnyCommit()) return;
  // Make sure there's at least one tracked file to commit
  const keepDir = path.join(root, ".af");
  const keepFile = path.join(keepDir, ".keep");
  try { fs.mkdirSync(keepDir, { recursive: true }); } catch {}
  if (!fs.existsSync(keepFile)) fs.writeFileSync(keepFile, "bootstrap\n", "utf-8");

  await sh("git", ["add", "-A"]);
  await sh("git", ["commit", "-m", "chore: bootstrap repository"]);
}

export async function ensureRemote(root: string) {
  try {
    await sh("git", ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    await sh("git", ["init"]);
  }
  // Ensure we have at least one commit before any push/PR logic
  await ensureInitialCommit(root);

  const remotes = await shOut("git", ["remote", "-v"]);
  if (!remotes) {
    // create a GitHub repo if none exists (now safe to push because we have a commit)
    try {
      const name = path.basename(root);
      await sh("gh", ["repo", "create", name, "--private", "--source", ".", "--push"]);
    } catch {
      // user may prefer to link manually; continue silently
    }
  }
}

export async function currentBranch() {
  // ensure HEAD exists so this can't fail on new repos
  await ensureInitialCommit(process.cwd());
  return shOut("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
}

export async function createStageBranch(prefix = "af/auto/") {
  const ts = Date.now().toString();
  const branch = `${prefix}${ts}`;
  await sh("git", ["checkout", "-b", branch]);
  return branch;
}

export async function ensureBranchForWork() {
  await ensureInitialCommit(process.cwd());
  const br = await currentBranch();
  if (["main", "master"].includes(br)) {
    return createStageBranch();
  }
  return br;
}

export async function hasChanges() {
  const out = await shOut("git", ["status", "--porcelain"]);
  return out.length > 0;
}

export async function commitAll(message: string) {
  await sh("git", ["add", "-A"]);
  const changed = await hasChanges();
  if (!changed) return false;
  await sh("git", ["commit", "-m", message]);
  return true;
}

export async function push(branch: string) {
  await sh("git", ["push", "-u", "origin", branch]);
}

export async function openPR(opts: { title: string; body?: string; draft?: boolean; base?: string }) {
  const args = ["pr", "create", "--title", opts.title, "--body", opts.body ?? ""];
  if (opts.draft) args.push("--draft");
  if (opts.base) args.push("--base", opts.base);
  try {
    await sh("gh", args);
  } catch {
    /* ignore if gh not installed or repo not linked */
  }
}

export async function autoMergePR(method: "squash" | "rebase" | "merge" = "squash") {
  try {
    await sh("gh", ["pr", "merge", "--auto", `--${method}`]);
  } catch {
    /* ignore if no open PR / permissions */
  }
}
