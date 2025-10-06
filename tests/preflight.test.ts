import { describe, it, expect, vi } from "vitest";
vi.mock("execa", () => ({
  execaCommand: vi.fn(async (cmd: string) => {
    if (cmd.startsWith("git")) return { stdout: "git version 2.x" };
    throw Object.assign(new Error("not found"), { shortMessage: "not found" });
  }),
}));
import { checkTools, requireTools } from "../src/services/preflight.js";
describe("preflight", () => {
  it("detects git", async () => {
    const res = await checkTools(["git"]);
    expect(res[0].ok).toBe(true);
  });
  it("throws on missing tool", async () => {
    await expect(requireTools(["vercel"])).rejects.toThrow(/Missing required tools/i);
  });
});
