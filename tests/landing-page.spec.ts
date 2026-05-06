import { expect, test } from "@playwright/test";

test("service card opens details on hover and closes on mouse leave", async ({ page }) => {
  await page.goto("/");

  const card = page.getByLabel("Voice Details anzeigen");
  await expect(card).toBeVisible();
  await expect(card.getByText("Service Detail")).toBeHidden();

  await card.hover();
  await expect(card).toHaveClass(/service-card--detail/);
  await expect(card.getByText("Service Detail")).toBeVisible();
  await expect(card.getByRole("link", { name: /Öffnen/i })).toBeVisible();

  await page.mouse.move(20, 20);
  await expect(card).not.toHaveClass(/service-card--detail/);
});

test("wordmark reorders after the hold interval", async ({ page }) => {
  await page.goto("/");

  const wordmark = page.locator(".wordmark");
  const initial = await wordmark.getAttribute("aria-label");

  await page.waitForTimeout(13200);
  const updated = await wordmark.getAttribute("aria-label");

  expect(initial).toMatch(/^(Lu|To|Bo){3}$/);
  expect(updated).toMatch(/^(Lu|To|Bo){3}$/);
  expect(updated).not.toBe(initial);
});

test("live status is presented as a HUD card", async ({ page }) => {
  await page.goto("/");

  const liveStatus = page.getByLabel("Live Aktualisierung");
  await expect(liveStatus).toBeVisible();
  await expect(liveStatus).toContainText(/Live per WebSocket|Fallback per Abfrage/);

  const borderRadius = await liveStatus.evaluate((element) => getComputedStyle(element).borderRadius);
  const background = await liveStatus.evaluate((element) => getComputedStyle(element).backgroundImage);

  expect(borderRadius).not.toBe("0px");
  expect(background).toContain("linear-gradient");
});
