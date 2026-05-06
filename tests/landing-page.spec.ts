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
  await expect(detail.getByText(/API offen|API aktiv|API-Prüfung|API Fehler/)).toBeVisible();
  const detailBox = await detail.boundingBox();
  expect(detailBox).not.toBeNull();
  expect(detailBox!.width).toBeGreaterThan(initialBox!.width * 1.5);

  await page.getByLabel("Auth / SSO Details anzeigen").hover();
  await page.waitForTimeout(420);
  await expect(detail.getByRole("heading", { name: "Auth / SSO" })).toBeVisible();
  await expect(page.getByLabel("Auth / SSO Details anzeigen")).toHaveAttribute("aria-selected", "true");
  await expect(card).toHaveAttribute("aria-selected", "false");
});

test("service info OpenAPI and aggregation endpoints are available", async ({ page }) => {
  const openApiResponse = await page.request.get("/api/openapi.json");
  expect(openApiResponse.ok()).toBe(true);
  const openApi = await openApiResponse.json();
  expect(openApi.openapi).toBe("3.1.0");
  expect(openApi.paths["/.well-known/schnick-schnack/service-info.json"]).toBeTruthy();

  const serviceInfoResponse = await page.request.get("/api/service-info");
  expect(serviceInfoResponse.ok()).toBe(true);
  const serviceInfo = await serviceInfoResponse.json();
  expect(Array.isArray(serviceInfo.services)).toBe(true);
  expect(serviceInfo.services.some((service: { serviceId: string }) => service.serviceId === "voice")).toBe(true);
});

test("service cards show a reverse refresh countdown", async ({ page }) => {
  await page.goto("/");

  const card = page.getByLabel("Voice Details anzeigen");
  const countdown = card.locator(".service-card__face--front .refresh-countdown");
  const dial = card.locator(".service-card__face--front .refresh-countdown__dial");
  await expect(countdown).toBeVisible();

  const initialLabel = await countdown.textContent();
  const initialBackground = await dial.evaluate((element) => getComputedStyle(element).backgroundImage);
  await page.waitForTimeout(650);
  const laterLabel = await countdown.textContent();
  const laterBackground = await dial.evaluate((element) => getComputedStyle(element).backgroundImage);

  await expect(dial).toBeVisible();
  expect(laterBackground).not.toBe(initialBackground);
  expect(Number.parseInt(laterLabel ?? "0", 10)).toBeLessThanOrEqual(Number.parseInt(initialLabel ?? "0", 10));
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
  await expect(entries.getByText("GitLab freigeschaltet")).toBeVisible();
  await expect(entries.getByText("06.05.2026").first()).toBeVisible();
  await expect(newsDetail.getByText("Das Portal ist der sichtbare Einstiegspunkt")).toBeVisible();

  const logbookBox = await logbook.boundingBox();
  const modulesBox = await page.getByRole("heading", { name: "Module" }).boundingBox();
  expect(logbookBox).not.toBeNull();
  expect(modulesBox).not.toBeNull();
  expect(logbookBox!.y).toBeLessThan(modulesBox!.y);

  await logbook.getByLabel("Portal online Details anzeigen").hover();
  await expect(newsDetail.getByText("Das Portal ist der sichtbare Einstiegspunkt")).toBeVisible();

  await logbook.getByLabel("HUD Interface aktiviert Details anzeigen").hover();
  await page.waitForTimeout(420);
  await expect(logbook.getByLabel("HUD Interface aktiviert Details anzeigen")).toHaveAttribute("aria-selected", "true");
  await expect(newsDetail.getByText("Das Interface wurde von einer klassischen Landing Page")).toBeVisible();

  await logbook.getByLabel("GitLab freigeschaltet Details anzeigen").click();
  await expect(newsDetail.getByText("GitLab ist jetzt als aktiver Dienst")).toBeVisible();
  await expect(newsDetail.getByText(/Log 004 \/ Development Hub \/ 06.05.2026/)).toBeVisible();
});

test("gitlab is an active module with public link", async ({ page }) => {
  await page.goto("/");

  const gitlab = page.getByLabel("GitLab Details anzeigen");
  await expect(gitlab).toBeVisible();
  await gitlab.click();

  const detail = page.getByLabel("Modul Detail");
  await expect(detail.getByRole("heading", { name: "GitLab" })).toBeVisible();
  await expect(detail.getByRole("link", { name: /Öffnen/i })).toHaveAttribute("href", "https://gitlab.schnick-schnack.info");
});

test("brief hover pass does not steal the selected module", async ({ page }) => {
  await page.goto("/");

  const voice = page.getByLabel("Voice Details anzeigen");
  const auth = page.getByLabel("Auth / SSO Details anzeigen");
  const detail = page.getByLabel("Modul Detail");

  await voice.click();
  await expect(detail.getByRole("heading", { name: "Voice" })).toBeVisible();

  await auth.hover();
  await page.waitForTimeout(120);
  await page.mouse.move(1000, 760);

  await expect(detail.getByRole("heading", { name: "Voice" })).toBeVisible();
  await expect(voice).toHaveAttribute("aria-selected", "true");
  await expect(auth).toHaveAttribute("aria-selected", "false");
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

test("theme dock is vertical on desktop and includes extended themes", async ({ page }) => {
  await page.goto("/");

  const dock = page.getByLabel("Theme Auswahl");
  await expect(dock.getByRole("button", { name: "Theme Solar Flare aktivieren" })).toBeVisible();
  await expect(dock.getByRole("button", { name: "Theme Deep Ocean aktivieren" })).toBeVisible();
  await expect(dock.getByRole("button", { name: "Theme Ghost Glass aktivieren" })).toBeVisible();

  const dockBox = await dock.boundingBox();
  expect(dockBox).not.toBeNull();
  expect(dockBox!.height).toBeGreaterThan(dockBox!.width * 1.5);
});
