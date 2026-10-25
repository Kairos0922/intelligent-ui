import { defineConfig, devices } from "@playwright/test";

/**
 * Browser acceptance test for the core SDK.
 *
 * Uses the system Chrome locally (channel: "chrome"); CI installs Chromium and
 * falls back to the bundled browser.
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    ...(process.env.CI ? {} : { channel: "chrome" }),
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173/sdk-selftest.html",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
