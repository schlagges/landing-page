import { expect, test } from "@playwright/test";

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
const pixelBaselineEnabled = process.env.UI_REVIEW_PIXEL_BASELINE === "true";

for (const reviewPage of readReviewPages()) {
  for (const state of readReviewStates()) {
    for (const viewport of requiredViewports) {
      test(`visual layout guards: ${reviewPage.name} / ${state.name} / ${viewport.name}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(reviewPage.path);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.waitForLoadState("networkidle").catch(() => undefined);

        const violations = (await runLayoutGuards(page)).filter(
          (violation) => !["accessible name", "document title"].includes(violation.check),
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
            layoutGuardViolations: violations,
            page: reviewPage,
            screenshot,
            state,
            viewport,
          }),
        );

        if (pixelBaselineEnabled) {
          await expect(page).toHaveScreenshot({
            animations: "disabled",
            fullPage: true,
            maxDiffPixelRatio: Number(process.env.UI_REVIEW_MAX_DIFF_PIXEL_RATIO ?? "0.01"),
          });
        }
        await expectNoGuardViolations(violations);
      });
    }
  }
}

test.afterAll(async () => {
  await appendReviewSummary(results);
});
