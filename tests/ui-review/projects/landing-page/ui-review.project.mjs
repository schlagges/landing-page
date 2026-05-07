export default function landingPageUiReviewProject() {
  const port = process.env.UI_REVIEW_LANDING_PAGE_PORT ?? "4174";
  const baseURL = process.env.UI_REVIEW_BASE_URL ?? `http://127.0.0.1:${port}`;

  return {
    baseURL,
    buildCommands: [
      {
        command: "npm",
        args: ["run", "build"],
      },
    ],
    output: "layout-review-summary-landing-page.md",
    pages: [{ name: "Landing Page", path: "/" }],
    startCommands: [
      {
        command: "npm",
        args: ["run", "start"],
        env: {
          HOST: "127.0.0.1",
          PORT: port,
        },
      },
    ],
    states: ["default"],
    waitTimeoutMs: 60_000,
  };
}
