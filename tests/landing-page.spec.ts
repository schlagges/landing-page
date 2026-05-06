import { expect, test } from "@playwright/test";

test("service card opens details on hover and closes on mouse leave", async ({ page }) => {
  await page.goto("/");

  const card = page.getByLabel("Voice Details anzeigen");
  const shell = card.locator(".service-card__shell");
  await expect(card).toBeVisible();
  await expect(card.getByText("Service Detail")).toBeHidden();
  const initialBox = await shell.boundingBox();
  expect(initialBox).not.toBeNull();

  await card.hover();
  await expect(card).toHaveClass(/service-card--detail/);
  await expect(card.getByText("Service Detail")).toBeVisible();
  await expect(card.getByRole("link", { name: /Öffnen/i })).toBeVisible();
  const detailBox = await shell.boundingBox();
  expect(detailBox).not.toBeNull();
  expect(detailBox!.width).toBeGreaterThan(initialBox!.width * 1.5);
  expect(detailBox!.height).toBeGreaterThan(initialBox!.height * 1.5);

  await page.mouse.move(20, 20);
  await expect(card).not.toHaveClass(/service-card--detail/);

  await card.hover();
  await expect(card).toHaveClass(/service-card--detail/);
  await card.click({ position: { x: 24, y: 24 } });
  await expect(card).not.toHaveClass(/service-card--detail/);
});

test("service cards show a reverse refresh countdown", async ({ page }) => {
  await page.goto("/");

  const card = page.getByLabel("Voice Details anzeigen");
  const countdown = card.locator(".service-card__face--front .refresh-countdown");
  const progress = card.locator(".service-card__face--front .refresh-countdown__track span");
  await expect(countdown).toBeVisible();

  const initialWidth = await progress.evaluate((element) => element.getBoundingClientRect().width);
  await page.waitForTimeout(650);
  const laterWidth = await progress.evaluate((element) => element.getBoundingClientRect().width);

  expect(laterWidth).toBeLessThan(initialWidth);
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

test("logbook is prominent above modules", async ({ page }) => {
  await page.goto("/");

  const logbook = page.locator(".logbook");
  await expect(logbook).toBeVisible();
  await expect(logbook.getByRole("heading", { name: "Was passiert ist" })).toBeVisible();
  await expect(logbook.getByText("Portal online")).toBeVisible();
  await expect(logbook.getByText("HUD Interface aktiviert")).toBeVisible();
  await expect(logbook.getByText("Service Panels erweitert")).toBeVisible();

  const logbookBox = await logbook.boundingBox();
  const modulesBox = await page.getByRole("heading", { name: "Module" }).boundingBox();
  expect(logbookBox).not.toBeNull();
  expect(modulesBox).not.toBeNull();
  expect(logbookBox!.y).toBeLessThan(modulesBox!.y);
});
