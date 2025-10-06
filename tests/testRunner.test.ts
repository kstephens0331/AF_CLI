import { describe, it, expect, vi } from "vitest";
vi.mock("execa", () => ({ execaCommand: vi.fn(async () => ({ stdout: "" })) }));
import { execaCommand } from "execa";
import { runChecks } from "../src/services/testRunner.js";
describe("runChecks", () => {
  it("runs all three steps", async () => {
    await runChecks({
      typecheck:`node -e "console.log('tc')"`,
      lint:`node -e "console.log('lint')"`,
      test:`node -e "console.log('test')"`
    });
    expect(execaCommand).toHaveBeenCalledTimes(3);
  });
});
