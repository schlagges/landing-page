import { expect, test } from "@playwright/test";

test("service card updates the fixed module detail panel on hover", async ({ page }) => {
  await page.goto("/");

  const card = page.getByLabel("Voice Details anzeigen");
  const shell = card.locator(".service-card__shell");
  await expect(card).toBeVisible();
  const detail = page.getByLabel("Modul Detail");
  await expect(detail).toBeVisible();
  const initialBox = await shell.boundingBox();
  expect(initialBox).not.toBeNull();

  await card.hover();
  await expect(card).toHaveAttribute("aria-selected", "true");
  await expect(card).toHaveClass(/is-selected/);
  await expect(card.getByText("FOCUS")).toBeVisible();
  await expect(detail.getByText("Service Detail")).toBeVisible();
  await expect(detail.getByRole("link", { name: /Öffnen/i })).toBeVisible();
  const detailBox = await detail.boundingBox();
  expect(detailBox).not.toBeNull();
  expect(detailBox!.width).toBeGreaterThan(initialBox!.width * 1.5);

  await page.getByLabel("Auth / SSO Details anzeigen").hover();
  await expect(detail.getByRole("heading", { name: "Auth / SSO" })).toBeVisible();
  await expect(page.getByLabel("Auth / SSO Details anzeigen")).toHaveAttribute("aria-selected", "true");
  await expect(card).toHaveAttribute("aria-selected", "false");
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
  const entries = logbook.locator(".logbook__entries");
  const newsDetail = page.getByLabel("News Detail");
  await expect(logbook).toBeVisible();
  await expect(logbook.getByRole("heading", { name: "Was passiert ist" })).toBeVisible();
  await expect(entries.getByText("Portal online")).toBeVisible();
  await expect(entries.getByText("HUD Interface aktiviert")).toBeVisible();
  await expect(entries.getByText("Service Panels erweitert")).toBeVisible();
  await expect(newsDetail.getByText("Das Portal ist der sichtbare Einstiegspunkt")).toBeVisible();

  const logbookBox = await logbook.boundingBox();
  const modulesBox = await page.getByRole("heading", { name: "Module" }).boundingBox();
  expect(logbookBox).not.toBeNull();
  expect(modulesBox).not.toBeNull();
  expect(logbookBox!.y).toBeLessThan(modulesBox!.y);

  await logbook.getByLabel("Portal online Details anzeigen").hover();
  await expect(newsDetail.getByText("Das Portal ist der sichtbare Einstiegspunkt")).toBeVisible();

  await logbook.getByLabel("HUD Interface aktiviert Details anzeigen").hover();
  await expect(logbook.getByLabel("HUD Interface aktiviert Details anzeigen")).toHaveAttribute("aria-selected", "true");
  await expect(newsDetail.getByText("Das Interface wurde von einer klassischen Landing Page")).toBeVisible();
});

test("desktop start screen does not require page scrolling", async ({ page }) => {
  await page.goto("/");

  const overflow = await page.evaluate(() => ({
    body: document.body.scrollHeight,
    document: document.documentElement.scrollHeight,
    viewport: window.innerHeight
  }));

  expect(Math.max(overflow.body, overflow.document)).toBeLessThanOrEqual(overflow.viewport + 1);
});

test("idle autopilot rotates news and module details", async ({ page }) => {
  await page.goto("/");

  const newsDetail = page.getByLabel("News Detail");
  const moduleDetail = page.getByLabel("Modul Detail");
  const initialNews = await newsDetail.getByRole("heading").textContent();
  const initialModule = await moduleDetail.getByRole("heading").textContent();

  await page.waitForTimeout(7200);

  await expect(newsDetail.getByRole("heading")).not.toHaveText(initialNews ?? "");
  await expect(moduleDetail.getByRole("heading")).not.toHaveText(initialModule ?? "");
});

test("theme dock switches themes and persists selection", async ({ page }) => {
  await page.goto("/");

  const neon = page.getByRole("button", { name: "Theme Neon Ice aktivieren" });
  await expect(neon).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "crimson-command");

  await neon.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "neon-ice");
  await expect(neon).toHaveAttribute("aria-pressed", "true");

  const storedTheme = await page.evaluate(() => window.localStorage.getItem("schnick-schnack.theme"));
  expect(storedTheme).toBe("neon-ice");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "neon-ice");
});
