import { test } from "@playwright/test";

import {
  appendReviewSummary,
  captureReviewScreenshot,
  expectNoGuardViolations,
  readReviewPages,
  readReviewStates,
  requiredViewports,
  runLayoutGuards,
  toReviewResult,
  type ReviewResult,
} from "./layout-guards";

const results: ReviewResult[] = [];

for (const reviewPage of readReviewPages()) {
  for (const state of readReviewStates()) {
    for (const viewport of requiredViewports) {
      test(`accessibility guards: ${reviewPage.name} / ${state.name} / ${viewport.name}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(reviewPage.path);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.waitForLoadState("networkidle").catch(() => undefined);

        const violations = (await runLayoutGuards(page)).filter((violation) =>
          ["accessible name", "document title", "modal close affordance"].includes(violation.check),
        );
        const screenshot = await captureReviewScreenshot(
          page,
          testInfo,
          reviewPage.name,
          state.name,
          viewport,
        );
        results.push(
          toReviewResult({
            accessibilityViolations: violations,
            layoutGuardViolations: [],
            page: reviewPage,
            screenshot,
            state,
            viewport,
          }),
        );

        await expectNoGuardViolations(violations);
      });
    }
  }
}

test.afterAll(async () => {
  await appendReviewSummary(results);
});
