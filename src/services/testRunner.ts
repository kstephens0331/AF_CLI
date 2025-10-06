import { execaCommand } from "execa";
import { loadConfig } from "./config.js";

type CheckCmds = { typecheck?: string; lint?: string; test?: string };

const PLACEHOLDER_TEST = 'node -e "console.log(\\"tests skipped\\")"';
const DEFAULTS: Required<CheckCmds> = {
  typecheck: "npx tsc -p tsconfig.json --noEmit",
  lint: 'npx eslint "src/**/*.ts" "vscode-extension/src/**/*.ts"',
  test: PLACEHOLDER_TEST,
};

function normalize(cmd?: string): string | undefined {
  if (!cmd) return cmd;
  return cmd
    .replace(/pnpm\s+-w\s+tsc(?:\s|$)/, "npx tsc ")
    .replace(/pnpm\s+tsc(?:\s|$)/, "npx tsc ")
    .replace(/pnpm\s+-w\s+eslint(?:\s|$)/, "npx eslint ")
    .replace(/pnpm\s+eslint(?:\s|$)/, "npx eslint ")
    .replace(/pnpm\s+-w\s+vitest(?:\s|$)/, "npx vitest ")
    .replace(/pnpm\s+vitest(?:\s|$)/, "npx vitest ");
}

async function preferVitest(cmd?: string): Promise<string> {
  // If config already set a real test command, keep it
  if (cmd && cmd.trim() !== PLACEHOLDER_TEST) return cmd;
  // If vitest is available, run it; otherwise keep the placeholder
  try {
    await execaCommand("npx vitest --version", { shell: true, stdio: "ignore" });
    return "npx vitest run --reporter=dot --coverage";
  } catch {
    return PLACEHOLDER_TEST;
  }
}

async function runOne(cmd?: string) {
  if (!cmd) return;
  await execaCommand(cmd, { stdio: "inherit", shell: true });
}

export async function runChecks(cmds?: CheckCmds) {
  // Load config and merge with defaults
  let merged: CheckCmds;
  if (!cmds) {
    const cfg = await loadConfig();
    const fromCfg = (cfg as any).check ?? (cfg as any).testing ?? {};
    merged = { ...DEFAULTS, ...fromCfg };
  } else {
    merged = { ...DEFAULTS, ...cmds };
  }

  // Normalize workspace-only flags and ensure a real test if Vitest is present
  const typecheck = normalize(merged.typecheck);
  const lint      = normalize(merged.lint);
  const test      = normalize(await preferVitest(merged.test));

  // Run
  await runOne(typecheck);
  await runOne(lint);
  await runOne(test);
}
