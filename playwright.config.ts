import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  use: { baseURL: "http://127.0.0.1:4179" },
  webServer: { command: "node tests/browser/buildGuideFixture.mjs && npx vite --config tests/browser/vite.config.ts --host 127.0.0.1 --port 4179", url: "http://127.0.0.1:4179/tests/browser/fixture.html", reuseExistingServer: !process.env.CI },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] } : undefined } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
