import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./sim",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 60_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "sim-playwright-report" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  globalSetup: "./sim/global-setup.ts",
  projects: [{ name: "sim", testMatch: /.*\.sim\.spec\.ts/ }],
});
