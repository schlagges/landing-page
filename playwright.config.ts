import { defineConfig, devices } from "@playwright/test";

const port = process.env.PORT ?? "18080";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  use: {
    baseURL,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROME_EXECUTABLE ?? "/usr/bin/google-chrome"
    },
    trace: "retain-on-failure"
  },
  webServer: {
    command: `PORT=${port} SQLITE_DB_PATH=test-results/landing-page.sqlite npm start`,
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
    url: baseURL
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
