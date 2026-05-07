import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.UI_REVIEW_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  outputDir: "../../test-results-ui-review",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "../../playwright-report-ui-review" }],
  ],
  testDir: ".",
  timeout: 90_000,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "ui-review",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
