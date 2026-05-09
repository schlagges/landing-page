import { expect, test } from "@playwright/test";

test("service info OpenAPI and aggregation endpoints are available", async ({ page }) => {
  const openApiResponse = await page.request.get("/api/openapi.json");
  expect(openApiResponse.ok()).toBe(true);
  const openApi = await openApiResponse.json();
  expect(openApi.openapi).toBe("3.1.0");
  expect(openApi.paths["/.well-known/schnick-schnack/service-info.json"]).toBeTruthy();
  expect(openApi.paths["/api/updates"]).toBeTruthy();
  expect(openApi.components.schemas.UpdateSnapshot).toBeTruthy();
  expect(openApi.components.schemas.PublicUpdate).toBeTruthy();
  expect(openApi.components.schemas.ServiceFeed).toBeTruthy();
  expect(openApi.components.schemas.ServiceInfo.properties.feeds).toBeTruthy();

  const buildInfoResponse = await page.request.get("/api/build-info");
  expect(buildInfoResponse.ok()).toBe(true);
  const buildInfo = await buildInfoResponse.json();
  expect(typeof buildInfo.builtAt === "string" || buildInfo.builtAt === null).toBe(true);

  const serviceInfoResponse = await page.request.get("/api/service-info");
  expect(serviceInfoResponse.ok()).toBe(true);
  const serviceInfo = await serviceInfoResponse.json();
  expect(Array.isArray(serviceInfo.services)).toBe(true);
  expect(serviceInfo.services.some((service: { serviceId: string }) => service.serviceId === "voice")).toBe(true);
  expect(serviceInfo.services.some((service: { serviceId: string }) => service.serviceId === "slack")).toBe(true);
  expect(serviceInfo.services.some((service: { serviceId: string }) => service.serviceId === "schnack-to-text")).toBe(true);
  expect(serviceInfo.services.some((service: { serviceId: string }) => service.serviceId === "llm-hub")).toBe(true);
  expect(serviceInfo.services.some((service: { serviceId: string }) => service.serviceId === "gitlab")).toBe(true);

  const updatesResponse = await page.request.get("/api/updates");
  expect(updatesResponse.ok()).toBe(true);
  const updates = await updatesResponse.json();
  expect(typeof updates.generatedAt).toBe("string");
  expect(Array.isArray(updates.updates)).toBe(true);

  const healthResponse = await page.request.get("/api/health");
  expect(healthResponse.ok()).toBe(true);
  const health = await healthResponse.json();
  const schnackToText = health.services.find(
    (service: { id: string; href: string | null; requiredRole?: string }) => service.id === "schnack-to-text"
  );
  expect(schnackToText?.href).toBe("https://stt.schnick-schnack.info");
  expect(schnackToText?.requiredRole).toBe("schnack-to-text");
  const llmHub = health.services.find(
    (service: { id: string; href: string | null; message: string; requiredRole?: string }) => service.id === "llm-hub"
  );
  expect(llmHub?.href).toBeNull();
  expect(llmHub?.message).toBe("Noch nicht in Prod");
  expect(llmHub?.requiredRole).toBe("llm-hub");
  const gitlab = health.services.find((service: { id: string; href: string | null }) => service.id === "gitlab");
  expect(gitlab?.href).toBe("https://labs.schnick-schnack.info/schnick-schnack/landing-page");
});

test("desktop renders the Schnick Schnack app layout from the reference", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByLabel("Schnick Schnack Navigation")).toBeVisible();
  await expect(page.getByLabel("schnick-schnack.info Startseite")).toBeVisible();
  await expect(page.getByText("schnick-schnack.info")).toBeVisible();
  await expect(page.getByLabel("Lu To Bo")).toBeVisible();
  await expect(page.getByRole("button", { name: "Übersicht" })).toHaveClass(/is-active/);
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Voice. Connect. Collaborate." })).toHaveCount(0);
  await expect(page.getByText("Letzter Build")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Verfügbare Dienste" })).toBeVisible();
  const schnackToText = page.getByLabel("Schnack To Text System");
  await expect(schnackToText).toBeVisible();
  await expect(schnackToText.getByText("Audio-Mitschnitt mit Transkription und automatischer Zusammenfassung.")).toBeVisible();
  await expect(schnackToText.getByText("Rolle schnack-to-text", { exact: true })).toBeVisible();
  await expect(schnackToText.getByRole("link", { name: "Anmelden" })).toBeVisible();
  await expect(schnackToText).toBeInViewport();
  const llmHub = page.getByLabel("LLM Hub System");
  await expect(llmHub).toBeVisible();
  await expect(llmHub.getByText("Zentraler Zugang zu LLM-Tools, Modellen und Experimenten.")).toBeVisible();
  await expect(llmHub.getByText("Noch nicht in Prod", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Öffentliche Updates" })).toBeVisible();
  await expect(page.getByText("Globaler Chat")).toBeVisible();
  await expect(page.locator(".status-dashboard").getByText("Systemstatus")).toBeVisible();
});

test("left navigation changes the active section", async ({ page }) => {
  await page.goto("/");

  const systems = page.getByRole("button", { name: "Systeme", exact: true });
  await systems.click();
  await expect(systems).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Öffentliche Systemdetails" })).toBeVisible();
  await expect(page).toHaveURL(/section=systems/);

  const news = page.getByRole("button", { name: "News", exact: true });
  await news.click();
  await expect(news).toHaveAttribute("aria-pressed", "true");
  await expect(systems).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("heading", { name: "Was gerade passiert" })).toBeVisible();
  await expect(page).toHaveURL(/section=news/);
});

test("login link preserves current section and existing login state", async ({ page }) => {
  await page.goto("/?section=news&login_state=present");

  await expect(page.getByRole("button", { name: "News", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Was gerade passiert" })).toBeVisible();

  const href = await page.getByRole("link", { name: "Anmelden" }).first().getAttribute("href");
  expect(href).toBeTruthy();

  const loginUrl = new URL(href!);
  expect(loginUrl.origin).toBe("https://auth.schnick-schnack.info");
  expect(loginUrl.pathname).toBe("/realms/master/protocol/openid-connect/auth");
  expect(loginUrl.searchParams.get("client_id")).toBe("landing-page");
  expect(loginUrl.searchParams.get("response_type")).toBe("code");
  expect(loginUrl.searchParams.get("scope")).toBe("openid");
  expect(loginUrl.searchParams.get("code_challenge")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  expect(loginUrl.searchParams.get("code_challenge_method")).toBe("S256");
  expect(loginUrl.searchParams.get("state")).toBe("present");

  const redirectUri = new URL(loginUrl.searchParams.get("redirect_uri")!);
  expect(redirectUri.searchParams.get("section")).toBe("news");
  expect(redirectUri.searchParams.get("theme")).toBe("dark");
});

test("news page lists recent module merge requests with dates", async ({ page }) => {
  await page.route("**/api/updates", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        generatedAt: "2026-05-09T00:00:00.000Z",
        updates: [
          {
            id: "gitlab-2-34",
            serviceId: "openvoice",
            date: "2026-05-08T19:58:34.557+02:00",
            title: "OpenVoice UI-Redesign ohne Dummy-Buttons",
            text: "schnick-schnack/openvoice!34 wurde gemerged. 1 Datei wurde geändert.",
            href: "https://labs.schnick-schnack.info/schnick-schnack/openvoice/-/merge_requests/34"
          }
        ]
      })
    });
  });

  await page.goto("/?section=news");

  await expect(page.getByRole("heading", { name: "Was gerade passiert" })).toBeVisible();
  const update = page.locator(".news-archive article").filter({ hasText: "OpenVoice UI-Redesign ohne Dummy-Buttons" });
  await expect(update).toBeVisible();
  await expect(update.getByText("08.05.2026")).toBeVisible();
  await expect(update.getByRole("link", { name: "Öffnen" })).toHaveAttribute(
    "href",
    /labs\.schnick-schnack\.info\/schnick-schnack\/openvoice\/-\/merge_requests\/34/
  );
});

test("side navigation opens detailed status and channel views", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Status", exact: true }).click();
  await expect(page.getByText("Statusmatrix")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Checks pro Dienst" })).toBeVisible();

  await page.getByRole("button", { name: "Kanäle", exact: true }).click();
  await expect(page.getByText("Rocket.Chat Bridge")).toBeVisible();
  await expect(page.getByRole("main").getByRole("heading", { name: "Chat-Channel" }).first()).toBeVisible();
});

test("mobile uses a stacked dashboard without sidebar navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByLabel("Schnick Schnack Navigation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Übersicht" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Verfügbare Dienste" })).toBeVisible();
  await expect(page.getByText("Globaler Chat")).toBeVisible();
  await expect(page.locator(".status-dashboard").getByText("Systemstatus")).toBeVisible();

  const width = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  }));

  expect(Math.max(width.body, width.document)).toBeLessThanOrEqual(width.viewport);
});

test("theme toggle switches between dark and light and persists", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const light = page.getByRole("button", { name: "Theme Light aktivieren" });
  await expect(light).toBeVisible();

  await light.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(light).toHaveAttribute("aria-pressed", "true");

  const storedTheme = await page.evaluate(() => window.localStorage.getItem("schnick-schnack.theme"));
  expect(storedTheme).toBe("light");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("system rows keep public links and receive the active theme", async ({ page }) => {
  await page.goto("/?roles=voice");

  const voice = page.getByLabel("Voice System");
  await expect(voice).toBeVisible();
  await expect(voice.getByRole("link", { name: /Öffnen/i })).toHaveAttribute(
    "href",
    /https:\/\/voice\.schnick-schnack\.info\/?\?theme=dark/
  );

  await page.getByRole("button", { name: "Theme Light aktivieren" }).click();
  await expect(voice.getByRole("link", { name: /Öffnen/i })).toHaveAttribute(
    "href",
    /https:\/\/voice\.schnick-schnack\.info\/?\?theme=light/
  );
});

test("module access shows missing-role request action", async ({ page }) => {
  await page.goto("/?roles=voice");

  const voice = page.getByLabel("Voice System");
  await expect(voice.getByText("Zugriff aktiv", { exact: true })).toBeVisible();
  await expect(voice.getByRole("link", { name: /Öffnen/i })).toBeVisible();

  const schnackToText = page.getByLabel("Schnack To Text System");
  await expect(schnackToText.getByText("Rolle fehlt", { exact: true })).toBeVisible();
  await expect(schnackToText.getByRole("link", { name: "Rolle anfragen" })).toHaveAttribute(
    "href",
    /keycloak-admins.*schnack-to-text/
  );
});

test("global chat and system status remain persistent dashboard areas", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Globaler Chat")).toBeVisible();
  await expect(page.getByRole("link", { name: /Im Chat öffnen|Chat-Link nicht verfügbar/ })).toBeVisible();
  await expect(page.getByText("Willkommen im globalen Chat!")).toHaveCount(0);
  await expect(page.getByText("Ja! Rollout startet heute Abend.")).toHaveCount(0);
  await expect(page.getByLabel("Nachricht eingeben")).toHaveCount(0);
  await expect(page.getByText("99.98%")).toHaveCount(0);
  await expect(page.getByText("Letzte Aktualisierung:")).toBeVisible();
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

test("design preferences expose only light and dark themes", async ({ page }) => {
  const designResponse = await page.request.get("/api/design-preferences");
  expect(designResponse.ok()).toBe(true);
  const design = await designResponse.json();

  expect(design.defaults.theme).toBe("dark");
  expect(design.themes).toEqual(["dark", "light"]);
  expect(design.layouts).toBeUndefined();
  expect(design.queryParams).toEqual(["theme"]);
  expect(design.storage.theme).toBe("schnick-schnack.theme");
});
