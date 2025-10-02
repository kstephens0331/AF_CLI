import { listProjectFiles } from "../core/sandbox.js";

type Cfg = {
  model?: string;
  planModel?: string;
  codeModel?: string;
  bigPlanModel?: string;
  routing?: { planFileCountThreshold: number; snapshotBytesThreshold: number };
};

export async function choosePlanModel(
  cwd: string,
  cfg: Cfg
): Promise<string> {
  const files = await listProjectFiles(cwd, false);
  const count = files.length;
  const totalBytes = files.reduce((a, b) => a + (b.size || 0), 0);

  const thresholdFiles = cfg.routing?.planFileCountThreshold ?? 1500;
  const thresholdBytes = cfg.routing?.snapshotBytesThreshold ?? 700_000;

  if (count >= thresholdFiles || totalBytes >= thresholdBytes) {
    return cfg.bigPlanModel || cfg.planModel || cfg.model || "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo";
  }
  return cfg.planModel || cfg.model || "meta-llama/Llama-3.3-70B-Instruct-Turbo";
}

export function chooseCodeModel(cfg: Cfg): string {
  return cfg.codeModel || cfg.model || "deepseek-ai/DeepSeek-V3";
}
