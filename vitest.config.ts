import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    reporters: ["dot"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text", "html"],
      include: [
        "src/**/*.ts",
        "vscode-extension/src/**/*.ts",
      ],
      exclude: [
        "**/*.d.ts",
        "dist/**",
        "node_modules/**",
        ".af/**",
        "tests/**",
        // ignore non-CLI apps/packages
        "admin-dashboard/**",
        "backend/**",
        "dashboard/**",
        "landing-page/**",
        "user-dashboard/**",
        "vscode-extension/out/**",
      ],
    },
  },
});
