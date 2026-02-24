import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 1,
  workers: 2,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],

  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // GPU acceleration flags for Chromium
    launchOptions: {
      args: [
        "--enable-gpu",
        "--use-gl=angle",
        "--enable-accelerated-2d-canvas",
        "--disable-gpu-sandbox",
        "--no-sandbox",
      ],
    },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
