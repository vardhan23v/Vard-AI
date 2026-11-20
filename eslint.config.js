import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Best-effort cleanup (`catch {}`) is deliberate in places; other empty blocks still fail.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // `let x!: T; x = new T(() => x…)` needs `let` because the closure reads it first.
      "prefer-const": ["error", { ignoreReadBeforeAssign: true }],
    },
  },
  {
    // The harness (Bun, Node APIs, a terminal UI): escape codes in regexes are intended.
    files: ["harness/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.node, Bun: "readonly" } },
    rules: {
      "no-control-regex": "off",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["harness/test/**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  eslintPluginPrettier,
);
