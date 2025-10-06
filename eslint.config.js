// eslint.config.js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default [
  // Ignore non-CLI areas and build output
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      ".af/**",
      "**/*.d.ts",
      "admin-dashboard/**",
      "backend/**",
      "dashboard/**",
      "landing-page/**",
      "user-dashboard/**",
      "vscode-extension/out/**",
    ],
  },

  // CLI & extension TypeScript
  {
    files: ["src/**/*.ts", "vscode-extension/src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: "module" },
      globals: { ...globals.node }, // Node globals (process, module, etc.)
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      // Base JS
      ...(js.configs.recommended?.rules ?? {}),
      "no-unused-vars": "off", // let TS rule handle this
      "no-undef": "off",       // TS types like NodeJS.Timeout would trip this

      // TypeScript
      ...(tseslint.configs.recommended?.rules ?? {}),

      // Make common nits warnings (so `check` doesn’t fail)
      "prefer-const": "warn",
      "no-empty": ["warn", { allowEmptyCatch: true }],

      // Allow underscore-prefixed vars/args/caught errors to be intentionally unused
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Narrow override: allow a local named `text` to be unused in this specific file
  {
    files: ["src/services/nl2actions.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^(?:_|text)$",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];
