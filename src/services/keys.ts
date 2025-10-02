import path from "node:path";
import fs from "node:fs";

let keytar: typeof import("keytar") | null = null;
try {
  // optional dep — may fail on some systems; we handle that
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  keytar = await import("keytar");
} catch {
  keytar = null;
}

const SERVICE = "af-cli";
const ACCOUNT = "TOGETHER_API_KEY";

export async function saveTogetherKeyLocalEnv(projectRoot: string, key: string) {
  const envPath = path.join(projectRoot, ".af/.env");
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, `TOGETHER_API_KEY=${key}\n`, "utf-8");
}

export async function getTogetherKey(projectRoot: string): Promise<string | undefined> {
  // 1) Env var overrides all
  if (process.env.TOGETHER_API_KEY) return process.env.TOGETHER_API_KEY;

  // 2) Keytar, if available
  if (keytar?.getPassword) {
    const v = await keytar.getPassword(SERVICE, ACCOUNT);
    if (v) return v;
  }

  // 3) Local .env fallback
  const envPath = path.join(projectRoot, ".af/.env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const l of lines) {
      const [k, ...rest] = l.split("=");
      if (k?.trim() === "TOGETHER_API_KEY") return rest.join("=").trim();
    }
  }
  return undefined;
}

export async function saveTogetherKey(projectRoot: string, key: string) {
  if (keytar?.setPassword) {
    await keytar.setPassword(SERVICE, ACCOUNT, key);
  } else {
    await saveTogetherKeyLocalEnv(projectRoot, key);
  }
}
