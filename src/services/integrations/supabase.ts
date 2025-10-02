import { execa } from "execa";
import { log } from "../../core/logger.js";

export async function supabaseLink() {
  await execa("npx", ["supabase", "link"], { stdio: "inherit", shell: true });
  log.ok("Supabase linked");
}

export async function supabaseDbPush() {
  await execa("npx", ["supabase", "db", "push"], { stdio: "inherit", shell: true });
  log.ok("Supabase DB pushed");
}
