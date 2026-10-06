import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 2,
  reporter: "list",
  outputDir: "artifacts/test-results",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    reducedMotion: "reduce",
  },
  projects: [
    {
      // Database-free planner contract tests. They exercise the visit planner
      // through an in-memory data source, so they run anywhere.
      name: "planner",
      testDir: "./tests/planner",
    },
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "tablet",
      use: { browserName: "chromium", viewport: { width: 768, height: 1024 } },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
