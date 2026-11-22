import { defineConfig } from "vitest/config";

// App unit tests (jsdom). The harness has its own `bun test` suite and is not run here.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["harness/**", "node_modules/**", "dist/**"],
    setupFiles: ["src/test/setup.ts"],
    restoreMocks: true,
  },
});
