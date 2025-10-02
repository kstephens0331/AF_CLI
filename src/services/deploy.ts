import { execa } from "execa";

async function run(cmd: string, args: string[]) {
  return execa(cmd, args, { stdio: "inherit", shell: true });
}

export async function vercelPreview() {
  // requires `vercel link` done once
  await run("npx", ["vercel", "deploy", "--prebuilt", "--yes"]);
}
export async function vercelProd() {
  await run("npx", ["vercel", "deploy", "--prebuilt", "--prod", "--yes"]);
}