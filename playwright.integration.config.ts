import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/integration",
  timeout: 90_000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5173", actionTimeout: 10000 },
  webServer: [
    {
      command:
        "NODE_ENV=test DASHBOARD_URL=http://127.0.0.1:5173 node --import tsx tests/fixtures/builder-integration-server.ts",
      cwd: "../Loopz-Backend",
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      url: "http://127.0.0.1:4310/__test__/ready",
      reuseExistingServer: false,
    },
    {
      command:
        "VITE_API_URL=http://127.0.0.1:4310 npm run dev --workspace=@movcues/dashboard -- --host 127.0.0.1 --port 5173",
      cwd: "../Loopz-Frontend",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
    },
    {
      command:
        "node tests/browser/buildGuideFixture.mjs && npx vite --config tests/browser/vite.config.ts --host 127.0.0.1 --port 4179",
      url: "http://127.0.0.1:4179/tests/integration/host.html",
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
