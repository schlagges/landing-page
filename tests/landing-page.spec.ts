import { expect, test } from "@playwright/test";

const gitLabWebhookHeaders = { "X-Gitlab-Token": "test-gitlab-secret" };

function expectPublicSafeRoleRequest(request: Record<string, unknown>) {
  expect(request.serviceId).toBeTruthy();
  expect(request.serviceName).toBeTruthy();
  expect(request.requiredRole).toBeTruthy();
  expect(request.role).toBeTruthy();
  expect(request.status).toBeTruthy();
  expect(request.state).toBeTruthy();
  expect(request).not.toHaveProperty("id");
  expect(request).not.toHaveProperty("requester");
  expect(request).not.toHaveProperty("source");
  expect(request).not.toHaveProperty("reason");
  expect(request).not.toHaveProperty("reviewer");
  expect(request).not.toHaveProperty("reviewedAt");
}

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

  const roleRequestsResponse = await page.request.get("/api/role-requests");
  expect(roleRequestsResponse.ok()).toBe(true);
  const roleRequests = await roleRequestsResponse.json();
  expect(Array.isArray(roleRequests.requests)).toBe(true);

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

test("persistent portal endpoints expose empty initial snapshots", async ({ page }) => {
  const historyResponse = await page.request.get("/api/monitoring/history");
  expect(historyResponse.ok()).toBe(true);
  const history = await historyResponse.json();
  expect(typeof history.generatedAt).toBe("string");
  expect(Array.isArray(history.services)).toBe(true);

  const moduleNewsResponse = await page.request.get("/api/module-news");
  expect(moduleNewsResponse.ok()).toBe(true);
  const moduleNews = await moduleNewsResponse.json();
  expect(typeof moduleNews.generatedAt).toBe("string");
  expect(Array.isArray(moduleNews.news)).toBe(true);

  const myRequestsResponse = await page.request.get("/api/role-requests/me?requester=landing-page-user");
  expect(myRequestsResponse.ok()).toBe(true);
  const myRequests = await myRequestsResponse.json();
  expect(typeof myRequests.generatedAt).toBe("string");
  expect(Array.isArray(myRequests.requests)).toBe(true);
});

test("monitoring history contains service trend samples", async ({ page }) => {
  let body: {
    services?: Array<{
      serviceId: string;
      samples?: unknown[];
      incidents?: unknown[];
    }>;
  } = {};

  await expect
    .poll(async () => {
      await page.request.get("/api/health");
      const response = await page.request.get("/api/monitoring/history");
      if (!response.ok()) {
        return 0;
      }
      body = await response.json();
      const voice = body.services?.find((service) => service.serviceId === "voice");
      return Array.isArray(voice?.samples) ? voice.samples.length : 0;
    })
    .toBeGreaterThan(0);

  const services = body.services ?? [];
  expect(Array.isArray(services)).toBe(true);
  const voice = services.find((service) => service.serviceId === "voice");
  expect(voice).toBeTruthy();
  expect(Array.isArray(voice.samples)).toBe(true);
  expect(Array.isArray(voice.incidents)).toBe(true);
  expect(voice.samples.length).toBeGreaterThan(0);
  expect(voice.samples[0]).toEqual(
    expect.objectContaining({
      serviceId: "voice",
      state: expect.any(String),
      message: expect.any(String),
      checkedAt: expect.any(String)
    })
  );
});

test("admin role request endpoint requires an admin role", async ({ page }) => {
  const denied = await page.request.get("/api/admin/role-requests");
  expect(denied.status()).toBe(403);
  expect(await denied.json()).toEqual({ message: "Admin role required." });

  const queryRoleDenied = await page.request.get("/api/admin/role-requests?roles=portal-admin");
  expect(queryRoleDenied.status()).toBe(403);
  expect(await queryRoleDenied.json()).toEqual({ message: "Admin role required." });

  const allowed = await page.request.get("/api/admin/role-requests", {
    headers: { "x-schnick-schnack-roles": "portal-admin" }
  });
  expect(allowed.ok()).toBe(true);
  const body = await allowed.json();
  expect(Array.isArray(body.requests)).toBe(true);
});

test("admin area is hidden without admin role and visible with admin role", async ({ page }) => {
  let adminRoleRequestCalls = 0;
  let approveCalls = 0;
  let moduleNewsCalls = 0;
  let monitoringHistoryCalls = 0;
  let adminRoleHeaders: Record<string, string> | null = null;
  let approveHeaders: Record<string, string> | null = null;

  await page.route("**/api/admin/role-requests", async (route) => {
    adminRoleRequestCalls += 1;
    adminRoleHeaders = route.request().headers();
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      json: {
        generatedAt: "2026-05-09T00:00:00.000Z",
        requests: [
          {
            id: "ui-request",
            serviceId: "gitlab",
            serviceName: "GitLab",
            role: "gitlab",
            requiredRole: "gitlab",
            status: "requested",
            state: "requested",
            requester: "boris",
            reason: "",
            source: "landing-page",
            createdAt: "2026-05-09T00:00:00.000Z",
            updatedAt: "2026-05-09T00:00:00.000Z",
            reviewer: null,
            reviewedAt: null
          }
        ]
      }
    });
  });
  await page.route("**/api/admin/role-requests/ui-request/approve", async (route) => {
    approveCalls += 1;
    approveHeaders = route.request().headers();
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      json: {
        request: {
          id: "ui-request",
          serviceId: "gitlab",
          serviceName: "GitLab",
          role: "gitlab",
          requiredRole: "gitlab",
          status: "approved",
          state: "approved",
          requester: "boris",
          reason: "",
          source: "landing-page",
          createdAt: "2026-05-09T00:00:00.000Z",
          updatedAt: "2026-05-09T00:00:01.000Z",
          reviewer: "admin",
          reviewedAt: "2026-05-09T00:00:01.000Z"
        }
      }
    });
  });
  await page.route("**/api/module-news", async (route) => {
    moduleNewsCalls += 1;
    await route.fallback();
  });
  await page.route("**/api/monitoring/history", async (route) => {
    monitoringHistoryCalls += 1;
    await route.fallback();
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Admin", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Adminbereich" })).toHaveCount(0);
  expect(adminRoleRequestCalls).toBe(0);
  expect(moduleNewsCalls).toBe(0);
  expect(monitoringHistoryCalls).toBe(0);

  await page.goto("/?roles=portal-admin");
  await expect(page.getByRole("button", { name: "Admin", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Adminbereich" })).toBeVisible();
  await expect(page.getByText("Berechtigungsanfragen")).toBeVisible();
  await expect(page.getByText("boris")).toBeVisible();
  await page.getByRole("button", { name: "GitLab genehmigen" }).click();
  await expect(page.getByText("Genehmigt")).toBeVisible();
  await expect(page.getByText("Monitoring-Verlauf")).toBeVisible();
  await expect(page.getByText("Modulnews")).toBeVisible();
  await expect.poll(() => adminRoleRequestCalls).toBe(1);
  await expect.poll(() => approveCalls).toBe(1);
  expect(adminRoleHeaders?.["x-schnick-schnack-roles"]).toBeUndefined();
  expect(adminRoleHeaders?.["x-forwarded-roles"]).toBeUndefined();
  expect(adminRoleHeaders?.["x-schnick-schnack-user"]).toBeUndefined();
  expect(adminRoleHeaders?.["x-forwarded-user"]).toBeUndefined();
  expect(approveHeaders?.["x-schnick-schnack-roles"]).toBeUndefined();
  expect(approveHeaders?.["x-schnick-schnack-user"]).toBeUndefined();
  expect(moduleNewsCalls).toBeGreaterThan(0);
  expect(monitoringHistoryCalls).toBeGreaterThan(0);
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

test("overview presents hybrid portal summary", async ({ page }) => {
  await page.goto("/?roles=voice");
  await expect(page.getByText("Gesamtstatus")).toBeVisible();
  await expect(page.getByText("Eigene Anfragen")).toBeVisible();
  await expect(page.getByText("Neue Modulnews")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Verfügbare Dienste" })).toBeVisible();
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

test("gitlab events are deduplicated into module news", async ({ page }) => {
  const payload = {
    object_kind: "merge_request",
    event_type: "merge_request",
    project: {
      id: 42,
      name: "OpenVoice",
      web_url: "https://labs.schnick-schnack.info/schnick-schnack/openvoice"
    },
    object_attributes: {
      iid: 34,
      state: "merged",
      title: "OpenVoice UI-Redesign ohne Dummy-Buttons",
      url: "https://labs.schnick-schnack.info/schnick-schnack/openvoice/-/merge_requests/34",
      updated_at: "2026-05-08T19:58:34.557+02:00"
    }
  };

  const first = await page.request.post("/api/gitlab/events", { data: payload, headers: gitLabWebhookHeaders });
  expect(first.ok()).toBe(true);
  expect((await first.json()).news.eventType).toBe("merge");

  const second = await page.request.post("/api/gitlab/events", { data: payload, headers: gitLabWebhookHeaders });
  expect(second.ok()).toBe(true);
  expect((await second.json()).created).toBe(false);

  const list = await page.request.get("/api/module-news");
  const body = await list.json();
  const matches = body.news.filter((item: { externalEventId: string }) => item.externalEventId === "gitlab:merge:42:34");
  expect(matches).toHaveLength(1);

  const updates = await page.request.get("/api/updates");
  const updatesBody = await updates.json();
  const update = updatesBody.updates.find((item: { title: string }) => item.title === "OpenVoice UI-Redesign ohne Dummy-Buttons");
  expect(update.id).toBe("gitlab:merge:42:34");
});

test("gitlab webhook rejects missing and invalid tokens", async ({ page }) => {
  const payload = {
    object_kind: "merge_request",
    event_type: "merge_request",
    project: { id: 43, name: "OpenVoice" },
    object_attributes: {
      iid: 35,
      state: "merged",
      title: "Token check",
      updated_at: "2026-05-08T19:58:34.557+02:00"
    }
  };

  const missing = await page.request.post("/api/gitlab/events", { data: payload });
  expect(missing.status()).toBe(401);
  expect(await missing.json()).toEqual({ message: "Invalid GitLab webhook token." });

  const invalid = await page.request.post("/api/gitlab/events", { data: payload, headers: { "X-Gitlab-Token": "wrong" } });
  expect(invalid.status()).toBe(401);
  expect(await invalid.json()).toEqual({ message: "Invalid GitLab webhook token." });
});

test("gitlab events do not store unsafe javascript urls", async ({ page }) => {
  const payload = {
    object_kind: "merge_request",
    event_type: "merge_request",
    project: { id: 44, name: "OpenVoice" },
    object_attributes: {
      iid: 36,
      state: "merged",
      title: "Unsafe URL",
      url: "javascript:alert(1)",
      updated_at: "2026-05-08T19:58:34.557+02:00"
    }
  };

  const response = await page.request.post("/api/gitlab/events", { data: payload, headers: gitLabWebhookHeaders });
  expect(response.ok()).toBe(true);
  expect((await response.json()).news.url).toBeNull();

  const updates = await page.request.get("/api/updates");
  const body = await updates.json();
  const item = body.updates.find((update: { title: string }) => update.title === "Unsafe URL");
  expect(item.href).toBeUndefined();
});

test("gitlab tag deletion events are ignored", async ({ page }) => {
  const payload = {
    object_kind: "tag_push",
    project: {
      id: 45,
      name: "OpenVoice",
      web_url: "https://labs.schnick-schnack.info/schnick-schnack/openvoice"
    },
    ref: "refs/tags/v1.2.3",
    checkout_sha: "0000000000000000000000000000000000000000",
    commits: []
  };

  const response = await page.request.post("/api/gitlab/events", { data: payload, headers: gitLabWebhookHeaders });
  expect(response.status()).toBe(202);
  expect(await response.json()).toEqual({ message: "Ignored GitLab event." });

  const list = await page.request.get("/api/module-news");
  const body = await list.json();
  const matches = body.news.filter((item: { externalEventId: string }) => item.externalEventId === "gitlab:tag:45:v1.2.3");
  expect(matches).toHaveLength(0);
});

test("gitlab top-level release events are stored as module news", async ({ page }) => {
  const payload = {
    object_kind: "release",
    project: {
      id: 46,
      name: "OpenVoice",
      web_url: "https://labs.schnick-schnack.info/schnick-schnack/openvoice"
    },
    tag: "v2.0.0",
    name: "OpenVoice 2.0.0",
    released_at: "2026-05-08T20:15:00.000+02:00",
    url: "https://labs.schnick-schnack.info/schnick-schnack/openvoice/-/releases/v2.0.0"
  };

  const response = await page.request.post("/api/gitlab/events", { data: payload, headers: gitLabWebhookHeaders });
  expect(response.ok()).toBe(true);
  const responseBody = await response.json();
  expect(responseBody.news.eventType).toBe("release");
  expect(responseBody.news.eventAt).toBe("2026-05-08T18:15:00.000Z");

  const list = await page.request.get("/api/module-news");
  const body = await list.json();
  const matches = body.news.filter((item: { externalEventId: string }) => item.externalEventId === "gitlab:release:46:v2.0.0");
  expect(matches).toHaveLength(1);
});

test("gitlab release delete events are ignored", async ({ page }) => {
  const payload = {
    object_kind: "release",
    action: "delete",
    project: {
      id: 48,
      name: "OpenVoice",
      web_url: "https://labs.schnick-schnack.info/schnick-schnack/openvoice"
    },
    tag: "v2.0.1",
    name: "OpenVoice 2.0.1",
    released_at: "2026-05-08T20:30:00.000+02:00",
    url: "https://labs.schnick-schnack.info/schnick-schnack/openvoice/-/releases/v2.0.1"
  };

  const response = await page.request.post("/api/gitlab/events", { data: payload, headers: gitLabWebhookHeaders });
  expect(response.status()).toBe(202);
  expect(await response.json()).toEqual({ message: "Ignored GitLab event." });

  const list = await page.request.get("/api/module-news");
  const body = await list.json();
  const matches = body.news.filter((item: { externalEventId: string }) => item.externalEventId === "gitlab:release:48:v2.0.1");
  expect(matches).toHaveLength(0);
});

test("gitlab tag events with colliding slugs are stored separately", async ({ page }) => {
  const payloads = ["release/v1", "release-v1"].map((tag, index) => ({
    object_kind: "tag_push",
    project: {
      id: 47,
      name: "OpenVoice",
      web_url: "https://labs.schnick-schnack.info/schnick-schnack/openvoice"
    },
    ref: `refs/tags/${tag}`,
    checkout_sha: `${index + 1}`.repeat(40),
    commits: [{ timestamp: "2026-05-08T20:15:00.000+02:00" }]
  }));

  for (const payload of payloads) {
    const response = await page.request.post("/api/gitlab/events", { data: payload, headers: gitLabWebhookHeaders });
    expect(response.ok()).toBe(true);
  }

  const list = await page.request.get("/api/module-news");
  const body = await list.json();
  const matches = body.news.filter((item: { externalEventId: string }) =>
    ["gitlab:tag:47:release/v1", "gitlab:tag:47:release-v1"].includes(item.externalEventId)
  );
  expect(matches).toHaveLength(2);
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
  await page.route("**/api/role-requests", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { serviceId: string; reason?: string };
      expect(body.serviceId).toBe("schnack-to-text");
      expect(body.reason ?? "").toBe("");
      expect(body).not.toHaveProperty("source");
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          request: {
            id: "schnack-to-text:schnack-to-text:landing-page-user",
            serviceId: "schnack-to-text",
            serviceName: "Schnack To Text",
            requiredRole: "schnack-to-text",
            role: "schnack-to-text",
            status: "requested",
            state: "requested",
            requester: "landing-page-user",
            reason: "",
            source: "test",
            createdAt: "2026-05-09T00:00:00.000Z",
            updatedAt: "2026-05-09T00:00:00.000Z",
            reviewedAt: null,
            reviewer: null
          }
        })
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        generatedAt: "2026-05-09T00:00:00.000Z",
        requests: []
      })
    });
  });

  await page.goto("/?roles=voice");

  const voice = page.getByLabel("Voice System");
  await expect(voice.getByText("Zugriff aktiv", { exact: true })).toBeVisible();
  await expect(voice.getByRole("link", { name: /Öffnen/i })).toBeVisible();

  const schnackToText = page.getByLabel("Schnack To Text System");
  await expect(schnackToText.getByText("Rolle fehlt", { exact: true })).toBeVisible();
  await schnackToText.getByRole("button", { name: "Rolle anfragen" }).click();
  await expect(schnackToText.getByText("Rolle angefragt", { exact: true })).toBeVisible();
});

test("role requests can be created and reviewed through sqlite APIs", async ({ page }) => {
  const create = await page.request.post("/api/role-requests", {
    data: {
      serviceId: "schnack-to-text",
      reason: "Ich brauche Transkription für Projektmeetings.",
      source: "playwright"
    },
    headers: { "x-schnick-schnack-user": "boris" }
  });
  expect(create.status()).toBe(201);
  const created = await create.json();
  expect(created.request.serviceId).toBe("schnack-to-text");
  expect(created.request.requiredRole).toBe("schnack-to-text");
  expect(created.request.status).toBe("requested");
  expect(created.request.reason).toBe("Ich brauche Transkription für Projektmeetings.");

  const duplicate = await page.request.post("/api/role-requests", {
    data: {
      serviceId: "schnack-to-text",
      reason: "Doppelte Anfrage.",
      source: "playwright"
    },
    headers: { "x-schnick-schnack-user": "boris" }
  });
  expect(duplicate.status()).toBe(200);
  const duplicated = await duplicate.json();
  expect(duplicated.request.id).toBe(created.request.id);
  expect(duplicated.request.status).toBe("requested");
  expect(duplicated.request.reason).toBe("Ich brauche Transkription für Projektmeetings.");

  const untrustedMine = await page.request.get("/api/role-requests/me?requester=boris");
  expect(untrustedMine.ok()).toBe(true);
  expect((await untrustedMine.json()).requests).toEqual([]);

  const pendingPublicList = await page.request.get("/api/role-requests");
  expect(pendingPublicList.ok()).toBe(true);
  const pendingPublicBody = await pendingPublicList.json();
  const publicPendingRequest = pendingPublicBody.requests.find(
    (request: { serviceId: string; role: string }) => request.serviceId === "schnack-to-text" && request.role === "schnack-to-text"
  );
  expect(publicPendingRequest).toBeTruthy();
  expectPublicSafeRoleRequest(publicPendingRequest);

  const mine = await page.request.get("/api/role-requests/me", {
    headers: { "x-schnick-schnack-user": "boris" }
  });
  expect(mine.ok()).toBe(true);
  const mineBody = await mine.json();
  expect(mineBody.requests.some((request: { id: string }) => request.id === created.request.id)).toBe(true);
  const trustedMineRequest = mineBody.requests.find((request: { id: string }) => request.id === created.request.id);
  expect(trustedMineRequest.reason).toBe("Ich brauche Transkription für Projektmeetings.");
  expect(trustedMineRequest.requester).toBe("boris");

  const unauthenticatedCreate = await page.request.post("/api/role-requests", {
    data: { serviceId: "voice", reason: "Bitte Voice freischalten.", source: "https://example.invalid/private-path" }
  });
  expect(unauthenticatedCreate.status()).toBe(401);
  expect(await unauthenticatedCreate.json()).toEqual({ message: "Trusted login required." });

  const trustedVoiceCreate = await page.request.post("/api/role-requests", {
    data: { serviceId: "voice", reason: "Bitte Voice freischalten.", source: "https://example.invalid/private-path?access_token=secret" },
    headers: { "x-schnick-schnack-user": "franka" }
  });
  expect(trustedVoiceCreate.status()).toBe(201);
  const trustedVoiceCreated = await trustedVoiceCreate.json();
  expect(trustedVoiceCreated.request.serviceId).toBe("voice");
  expect(trustedVoiceCreated.request.status).toBe("requested");
  expect(trustedVoiceCreated.request.requester).toBe("franka");
  expect(trustedVoiceCreated.request.source).toBe("landing-page");

  const trustedVoiceDuplicate = await page.request.post("/api/role-requests", {
    data: { serviceId: "voice", reason: "Noch einmal Voice.", source: "https://example.invalid/second-private-path" },
    headers: { "x-schnick-schnack-user": "franka" }
  });
  expect(trustedVoiceDuplicate.status()).toBe(200);
  const trustedVoiceDuplicated = await trustedVoiceDuplicate.json();
  expect(trustedVoiceDuplicated.request.id).toBe(trustedVoiceCreated.request.id);
  expect(trustedVoiceDuplicated.request.status).toBe("requested");
  expect(trustedVoiceDuplicated.request.source).toBe("landing-page");

  const adminBeforeReview = await page.request.get("/api/admin/role-requests", {
    headers: { "x-schnick-schnack-user": "admin", "x-schnick-schnack-roles": "portal-admin" }
  });
  const adminBeforeReviewBody = await adminBeforeReview.json();
  const publicInternalRequest = adminBeforeReviewBody.requests.find(
    (request: { serviceId: string; requester: string; id: string }) =>
      request.serviceId === "voice" && request.requester === "franka"
  );
  expect(publicInternalRequest?.id).toBeTruthy();
  expect(publicInternalRequest.source).toBe("landing-page");

  const approve = await page.request.post(`/api/admin/role-requests/${created.request.id}/approve`, {
    headers: { "x-schnick-schnack-user": "admin", "x-schnick-schnack-roles": "portal-admin" }
  });
  expect(approve.ok()).toBe(true);
  const approved = await approve.json();
  expect(approved.request.status).toBe("approved");

  const approvedCreate = await page.request.post("/api/role-requests", {
    data: {
      serviceId: "schnack-to-text",
      reason: "Ich brauche wieder Transkription, obwohl schon entschieden wurde.",
      source: "playwright"
    },
    headers: { "x-schnick-schnack-user": "boris" }
  });
  expect(approvedCreate.status()).toBe(200);
  const approvedCreateBody = await approvedCreate.json();
  expect(approvedCreateBody.request.id).toBe(created.request.id);
  expect(approvedCreateBody.request.status).toBe("approved");
  expect(approvedCreateBody.request.reviewer).toBe("admin");
  expect(approvedCreateBody.request.reviewedAt).toBe(approved.request.reviewedAt);

  const publicApprove = await page.request.post(`/api/admin/role-requests/${publicInternalRequest.id}/approve`, {
    headers: { "x-schnick-schnack-user": "admin", "x-schnick-schnack-roles": "portal-admin" }
  });
  expect(publicApprove.ok()).toBe(true);
  const publicApprovedCreate = await page.request.post("/api/role-requests", {
    data: { serviceId: "voice", reason: "Terminal duplicate.", source: "https://example.invalid/terminal-private-path" },
    headers: { "x-schnick-schnack-user": "franka" }
  });
  expect(publicApprovedCreate.status()).toBe(200);
  const publicApprovedCreateBody = await publicApprovedCreate.json();
  expect(publicApprovedCreateBody.request.serviceId).toBe("voice");
  expect(publicApprovedCreateBody.request.status).toBe("approved");

  const rejectCreate = await page.request.post("/api/role-requests", {
    data: { serviceId: "gitlab", reason: "Code lesen.", source: "playwright" },
    headers: { "x-schnick-schnack-user": "boris" }
  });
  const rejectCreated = await rejectCreate.json();
  const reject = await page.request.post(`/api/admin/role-requests/${rejectCreated.request.id}/reject`, {
    headers: { "x-schnick-schnack-user": "admin", "x-schnick-schnack-roles": "portal-admin" }
  });
  expect(reject.ok()).toBe(true);
  const rejected = await reject.json();
  expect(rejected.request.status).toBe("rejected");

  const rejectedCreate = await page.request.post("/api/role-requests", {
    data: { serviceId: "gitlab", reason: "Noch einmal Code lesen.", source: "playwright" },
    headers: { "x-schnick-schnack-user": "boris" }
  });
  expect(rejectedCreate.status()).toBe(200);
  const rejectedCreateBody = await rejectedCreate.json();
  expect(rejectedCreateBody.request.id).toBe(rejectCreated.request.id);
  expect(rejectedCreateBody.request.status).toBe("rejected");
  expect(rejectedCreateBody.request.reviewer).toBe("admin");
  expect(rejectedCreateBody.request.reviewedAt).toBe(rejected.request.reviewedAt);

  const publicList = await page.request.get("/api/role-requests");
  expect(publicList.ok()).toBe(true);
  const publicBody = await publicList.json();
  expect(publicBody.requests.some((request: { serviceId: string }) => request.serviceId === "schnack-to-text")).toBe(false);
  expect(publicBody.requests.some((request: { serviceId: string }) => request.serviceId === "gitlab")).toBe(false);
  expect(publicBody.requests.some((request: { serviceId: string }) => request.serviceId === "voice")).toBe(false);
  for (const request of publicBody.requests as Array<Record<string, unknown>>) {
    expect(request.state).toBe("requested");
    expectPublicSafeRoleRequest(request);
  }
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
