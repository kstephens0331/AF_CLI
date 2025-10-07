// tests/preflight.test.ts
import { describe, it, expect } from "vitest";
import { versionSafe, requireTools } from "../src/services/preflight";

describe("preflight", () => {
  it("versionSafe returns null on bogus bin", async () => {
    const v = await versionSafe("__definitely_not_a_real_bin__");
    expect(v).toBeNull();
  });

  it("requireTools handles presence/absence of vercel", async () => {
    const haveVercel = !!(await versionSafe("vercel"));
    if (haveVercel) {
      // On machines where vercel is installed (like yours), this should NOT throw
      await expect(requireTools(["vercel"])).resolves.toBeUndefined();
    } else {
      // In CI or machines without vercel, it should throw with either phrasing
      await expect(requireTools(["vercel"])).rejects.toThrow(
        /(Required tools missing|Missing required tools)/i
      );
    }
  });
});
