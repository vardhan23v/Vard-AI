import { defineConfig } from "@playwright/test";

const CHROMIUM_PATH =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  "/chromium-1194/chrome-linux/chrome";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8080",
    headless: true,
    viewport: { width: 1280, height: 900 },
    launchOptions: { executablePath: CHROMIUM_PATH },
  },
  projects: [{ name: "chromium" }],
});