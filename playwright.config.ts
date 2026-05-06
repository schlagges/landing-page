import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:18080",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROME_EXECUTABLE ?? "/usr/bin/google-chrome"
    },
    trace: "retain-on-failure"
  },
  webServer: {
    command: "PORT=18080 npm start",
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
    url: "http://127.0.0.1:18080"
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 }
      }
    }
  ]
});
