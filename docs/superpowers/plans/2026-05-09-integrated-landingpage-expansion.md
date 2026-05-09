# Integrated Landingpage Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the integrated `schnick-schnack.info` service portal with SQLite-backed role requests, monitoring history, automatic GitLab module news, and role-gated admin UI.

**Architecture:** Keep the existing React/Vite client and Express server. Add small focused server modules for SQLite persistence, request context, monitoring history, role requests, and GitLab news, then adapt `server/server.ts` to call them. Extend the existing single-page React app without a broad component rewrite, while moving shared request/news/history types into explicit client-side types.

**Tech Stack:** React 19, Vite 7, Express 5, TypeScript 5.9, Node 22 `node:sqlite`, Playwright, Docker Compose.

---

## File Structure

- Create `server/db.ts`: open SQLite, initialize schema, expose prepared persistence helpers.
- Create `server/request-context.ts`: derive requester and roles from trusted headers, query fallback, cookies, and tokens.
- Create `server/role-requests.ts`: role request repository and HTTP handler helpers.
- Create `server/monitoring-history.ts`: sample persistence, trend queries, and incident derivation.
- Create `server/module-news.ts`: GitLab event normalization, deduplication, and update-feed mapping.
- Create `server/node-sqlite.d.ts`: local type shim if the installed Node type package does not expose `node:sqlite`.
- Modify `server/server.ts`: replace JSON role request storage, persist monitoring samples, expose new APIs, and merge stored module news into updates.
- Modify `src/main.tsx`: add admin role detection, role request status handling, monitoring history loading, module news loading, and admin-only sections.
- Modify `src/styles.css`: support compact hybrid dashboard, admin area, request tables, trend charts, and module news lists.
- Modify `tests/landing-page.spec.ts`: cover new API behavior and core UI workflows.
- Modify `docker-compose.yml`: replace `ROLE_REQUESTS_FILE` with `SQLITE_DB_PATH`.
- Modify `README.md`: document SQLite persistence and GitLab webhook endpoint.

---

### Task 1: SQLite Persistence Foundation

**Files:**
- Create: `server/db.ts`
- Create: `server/node-sqlite.d.ts`
- Modify: `server/server.ts`
- Test: `tests/landing-page.spec.ts`

- [ ] **Step 1: Write failing API smoke coverage for new persistent endpoints**

Append this test near the existing API smoke test in `tests/landing-page.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm run test:ui -- tests/landing-page.spec.ts -g "persistent portal endpoints"
```

Expected: FAIL with `404` for `/api/monitoring/history` or `/api/module-news`.

- [ ] **Step 3: Add local `node:sqlite` type shim**

Create `server/node-sqlite.d.ts`:

```ts
declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }

  export class StatementSync {
    all(...anonymousParameters: unknown[]): unknown[];
    get(...anonymousParameters: unknown[]): unknown;
    run(...anonymousParameters: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  }
}
```

- [ ] **Step 4: Create SQLite database module**

Create `server/db.ts`:

```ts
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_DB_PATH = path.resolve("data", "landing-page.sqlite");

export type Database = DatabaseSync;

export function openDatabase(dbPath = process.env.SQLITE_DB_PATH ?? DEFAULT_DB_PATH): Database {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  initializeSchema(db);
  return db;
}

function initializeSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_requests (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      required_role TEXT NOT NULL,
      requester TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('requested', 'approved', 'rejected')),
      reviewer TEXT,
      source TEXT NOT NULL DEFAULT 'landing-page',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      reviewed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS role_requests_requester_idx
      ON role_requests(requester, created_at DESC);

    CREATE INDEX IF NOT EXISTS role_requests_status_idx
      ON role_requests(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS monitoring_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id TEXT NOT NULL,
      state TEXT NOT NULL,
      message TEXT NOT NULL,
      response_ms INTEGER,
      checked_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS monitoring_samples_service_checked_idx
      ON monitoring_samples(service_id, checked_at DESC);

    CREATE TABLE IF NOT EXISTS module_news (
      id TEXT PRIMARY KEY,
      external_event_id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      project_name TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('release', 'tag', 'merge')),
      title TEXT NOT NULL,
      url TEXT,
      event_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS module_news_event_at_idx
      ON module_news(event_at DESC);
  `);
}
```

- [ ] **Step 5: Wire database and stub endpoints in `server/server.ts`**

Add the import:

```ts
import { openDatabase } from "./db.js";
```

After the WebSocket server is created, add:

```ts
const db = openDatabase();
```

Add these temporary endpoints before static asset handling:

```ts
app.get("/api/monitoring/history", (_request, response) => {
  response.json({ generatedAt: new Date().toISOString(), services: [] });
});

app.get("/api/module-news", (_request, response) => {
  response.json({ generatedAt: new Date().toISOString(), news: [] });
});

app.get("/api/role-requests/me", (_request, response) => {
  response.json({ generatedAt: new Date().toISOString(), requests: [] });
});
```

The `db` constant is intentionally unused in this task and becomes active in Task 3. If TypeScript rejects unused locals, add this line after `const db = openDatabase();`:

```ts
void db;
```

- [ ] **Step 6: Run lint and the focused test**

Run:

```bash
npm run lint
npm run test:ui -- tests/landing-page.spec.ts -g "persistent portal endpoints"
```

Expected: lint passes and the focused test passes.

- [ ] **Step 7: Commit**

```bash
git add server/db.ts server/node-sqlite.d.ts server/server.ts tests/landing-page.spec.ts
git commit -m "feat: add sqlite portal persistence foundation"
```

---

### Task 2: Request Context And Admin Role Guard

**Files:**
- Create: `server/request-context.ts`
- Modify: `server/server.ts`
- Test: `tests/landing-page.spec.ts`

- [ ] **Step 1: Write failing admin guard tests**

Append:

```ts
test("admin role request endpoint requires an admin role", async ({ page }) => {
  const denied = await page.request.get("/api/admin/role-requests");
  expect(denied.status()).toBe(403);
  expect(await denied.json()).toEqual({ message: "Admin role required." });

  const allowed = await page.request.get("/api/admin/role-requests", {
    headers: { "x-schnick-schnack-roles": "portal-admin" }
  });
  expect(allowed.ok()).toBe(true);
  const body = await allowed.json();
  expect(Array.isArray(body.requests)).toBe(true);
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm run test:ui -- tests/landing-page.spec.ts -g "admin role request endpoint"
```

Expected: FAIL with `404` for `/api/admin/role-requests`.

- [ ] **Step 3: Create request context helper**

Create `server/request-context.ts`:

```ts
import type { Request, Response } from "express";

export type RequestContext = {
  requester: string;
  roles: Set<string>;
  isAdmin: boolean;
};

const ADMIN_ROLES = new Set(["portal-admin", "admin", "keycloak-admin"]);

function addDelimitedRoles(target: Set<string>, value: string | string[] | undefined): void {
  const raw = Array.isArray(value) ? value.join(",") : value;
  if (!raw) {
    return;
  }

  raw
    .split(/[\\s,;]+/)
    .map((role) => role.trim())
    .filter(Boolean)
    .forEach((role) => target.add(role));
}

function sanitizeIdentity(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.replace(/\\s+/g, " ").trim().slice(0, 120) || fallback;
}

export function requestContext(request: Request): RequestContext {
  const roles = new Set<string>();
  addDelimitedRoles(roles, request.headers["x-schnick-schnack-roles"] as string | undefined);
  addDelimitedRoles(roles, request.headers["x-forwarded-roles"] as string | undefined);
  addDelimitedRoles(roles, typeof request.query.roles === "string" ? request.query.roles : undefined);

  const requester = sanitizeIdentity(
    request.headers["x-schnick-schnack-user"] ?? request.headers["x-forwarded-user"] ?? request.query.requester,
    "landing-page-user"
  );

  return {
    requester,
    roles,
    isAdmin: Array.from(roles).some((role) => ADMIN_ROLES.has(role))
  };
}

export function requireAdmin(request: Request, response: Response): RequestContext | null {
  const context = requestContext(request);
  if (!context.isAdmin) {
    response.status(403).json({ message: "Admin role required." });
    return null;
  }

  return context;
}
```

- [ ] **Step 4: Add guarded admin stub endpoint**

In `server/server.ts`, import:

```ts
import { requireAdmin } from "./request-context.js";
```

Add before static asset handling:

```ts
app.get("/api/admin/role-requests", (request, response) => {
  if (!requireAdmin(request, response)) {
    return;
  }

  response.json({ generatedAt: new Date().toISOString(), requests: [] });
});
```

- [ ] **Step 5: Run lint and focused test**

Run:

```bash
npm run lint
npm run test:ui -- tests/landing-page.spec.ts -g "admin role request endpoint"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/request-context.ts server/server.ts tests/landing-page.spec.ts
git commit -m "feat: add admin request context guard"
```

---

### Task 3: SQLite-Backed Role Requests

**Files:**
- Create: `server/role-requests.ts`
- Modify: `server/server.ts`
- Test: `tests/landing-page.spec.ts`

- [ ] **Step 1: Replace role request UI test route expectations**

Update the existing `module access shows missing-role request action` test so the mocked POST body includes `reason` and the mocked request uses `status` and `requiredRole`:

```ts
await page.route("**/api/role-requests", async (route) => {
  if (route.request().method() === "POST") {
    const body = route.request().postDataJSON() as { serviceId: string; reason?: string };
    expect(body.serviceId).toBe("schnack-to-text");
    expect(body.reason ?? "").toBe("");
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
```

- [ ] **Step 2: Add API tests for create, list, approve, reject**

Append:

```ts
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

  const mine = await page.request.get("/api/role-requests/me", {
    headers: { "x-schnick-schnack-user": "boris" }
  });
  expect(mine.ok()).toBe(true);
  const mineBody = await mine.json();
  expect(mineBody.requests.some((request: { id: string }) => request.id === created.request.id)).toBe(true);

  const approve = await page.request.post(`/api/admin/role-requests/${created.request.id}/approve`, {
    headers: { "x-schnick-schnack-user": "admin", "x-schnick-schnack-roles": "portal-admin" }
  });
  expect(approve.ok()).toBe(true);
  expect((await approve.json()).request.status).toBe("approved");

  const rejectCreate = await page.request.post("/api/role-requests", {
    data: { serviceId: "gitlab", reason: "Code lesen.", source: "playwright" },
    headers: { "x-schnick-schnack-user": "boris" }
  });
  const rejectCreated = await rejectCreate.json();
  const reject = await page.request.post(`/api/admin/role-requests/${rejectCreated.request.id}/reject`, {
    headers: { "x-schnick-schnack-user": "admin", "x-schnick-schnack-roles": "portal-admin" }
  });
  expect(reject.ok()).toBe(true);
  expect((await reject.json()).request.status).toBe("rejected");
});
```

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```bash
npm run test:ui -- tests/landing-page.spec.ts -g "role requests can be created"
```

Expected: FAIL because the current implementation uses JSON storage and has no approve/reject endpoints.

- [ ] **Step 4: Create role request repository**

Create `server/role-requests.ts`:

```ts
import type { Database } from "./db.js";

export type RoleRequestStatus = "requested" | "approved" | "rejected";

export type RoleRequestRecord = {
  id: string;
  serviceId: string;
  serviceName: string;
  requiredRole: string;
  role: string;
  status: RoleRequestStatus;
  state: RoleRequestStatus;
  requester: string;
  reason: string;
  source: string;
  reviewer: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};

type RoleRequestRow = {
  id: string;
  service_id: string;
  service_name: string;
  required_role: string;
  requester: string;
  reason: string;
  status: RoleRequestStatus;
  reviewer: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
};

export type ProtectedService = {
  id: string;
  name: string;
  requiredRole?: string;
};

export function roleRequestId(serviceId: string, role: string, requester: string): string {
  return `${serviceId}:${role}:${requester}`.toLowerCase().replace(/[^a-z0-9:._-]+/g, "-").slice(0, 180);
}

function mapRoleRequest(row: RoleRequestRow): RoleRequestRecord {
  return {
    id: row.id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    requiredRole: row.required_role,
    role: row.required_role,
    status: row.status,
    state: row.status,
    requester: row.requester,
    reason: row.reason,
    source: row.source,
    reviewer: row.reviewer,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at
  };
}

export function listRoleRequests(db: Database): RoleRequestRecord[] {
  return (db
    .prepare("SELECT * FROM role_requests ORDER BY created_at DESC LIMIT 250")
    .all() as RoleRequestRow[]).map(mapRoleRequest);
}

export function listRoleRequestsForRequester(db: Database, requester: string): RoleRequestRecord[] {
  return (db
    .prepare("SELECT * FROM role_requests WHERE requester = ? ORDER BY created_at DESC LIMIT 100")
    .all(requester) as RoleRequestRow[]).map(mapRoleRequest);
}

export function createRoleRequest(
  db: Database,
  service: ProtectedService,
  requester: string,
  reason: string,
  source: string
): { request: RoleRequestRecord; created: boolean } {
  if (!service.requiredRole) {
    throw new Error("Protected service requires requiredRole.");
  }

  const id = roleRequestId(service.id, service.requiredRole, requester);
  const existing = db.prepare("SELECT * FROM role_requests WHERE id = ?").get(id) as RoleRequestRow | undefined;
  if (existing?.status === "requested") {
    return { request: mapRoleRequest(existing), created: false };
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO role_requests (
      id, service_id, service_name, required_role, requester, reason, status, reviewer, source, created_at, updated_at, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'requested', NULL, ?, ?, ?, NULL)`
  ).run(id, service.id, service.name, service.requiredRole, requester, reason, source, existing?.created_at ?? now, now);

  const row = db.prepare("SELECT * FROM role_requests WHERE id = ?").get(id) as RoleRequestRow;
  return { request: mapRoleRequest(row), created: !existing };
}

export function reviewRoleRequest(
  db: Database,
  id: string,
  status: Extract<RoleRequestStatus, "approved" | "rejected">,
  reviewer: string
): RoleRequestRecord | null {
  const now = new Date().toISOString();
  const result = db
    .prepare("UPDATE role_requests SET status = ?, reviewer = ?, reviewed_at = ?, updated_at = ? WHERE id = ?")
    .run(status, reviewer, now, now, id);

  if (Number(result.changes) === 0) {
    return null;
  }

  const row = db.prepare("SELECT * FROM role_requests WHERE id = ?").get(id) as RoleRequestRow;
  return mapRoleRequest(row);
}
```

- [ ] **Step 5: Replace JSON role request handlers**

In `server/server.ts`, remove imports of `existsSync`, `mkdirSync`, `writeFileSync`, and the `ROLE_REQUESTS_FILE` constant. Keep `readFileSync`.

Import repository helpers:

```ts
import {
  createRoleRequest,
  listRoleRequests,
  listRoleRequestsForRequester,
  reviewRoleRequest
} from "./role-requests.js";
import { requestContext, requireAdmin } from "./request-context.js";
```

Remove the old functions `readRoleRequests`, `writeRoleRequests`, `roleRequestId`, and `normalizeRequester`.

Replace `app.get("/api/role-requests"...` with:

```ts
app.get("/api/role-requests", (_request, response) => {
  response.json({
    generatedAt: new Date().toISOString(),
    channel: ROLE_REQUEST_CHANNEL_URL,
    requests: listRoleRequests(db)
  });
});

app.get("/api/role-requests/me", (request, response) => {
  const context = requestContext(request);
  response.json({
    generatedAt: new Date().toISOString(),
    requests: listRoleRequestsForRequester(db, context.requester)
  });
});
```

Replace `app.post("/api/role-requests"...` with:

```ts
app.post("/api/role-requests", async (request, response) => {
  const body = request.body as { serviceId?: unknown; reason?: unknown; source?: unknown };
  const context = requestContext(request);
  const serviceId = typeof body.serviceId === "string" ? body.serviceId.trim() : "";
  const service = findService(serviceId);

  if (!service?.requiredRole) {
    response.status(400).json({ message: "Unknown protected service." });
    return;
  }

  const reason = typeof body.reason === "string" ? sanitizeUpdateText(body.reason).slice(0, 500) : "";
  const source = typeof body.source === "string" ? sanitizeUpdateText(body.source, "landing-page").slice(0, 180) : "landing-page";
  const result = createRoleRequest(db, service, context.requester, reason, source);

  void postRoleRequestToRocketChat({
    id: result.request.id,
    serviceId: result.request.serviceId,
    serviceName: result.request.serviceName,
    role: result.request.requiredRole,
    state: result.request.status,
    requester: result.request.requester,
    source: result.request.source,
    createdAt: result.request.createdAt,
    updatedAt: result.request.updatedAt
  });

  response.status(result.created ? 201 : 200).json({ request: result.request, channel: ROLE_REQUEST_CHANNEL_URL });
});
```

Replace the admin stub with:

```ts
app.get("/api/admin/role-requests", (request, response) => {
  if (!requireAdmin(request, response)) {
    return;
  }

  response.json({ generatedAt: new Date().toISOString(), requests: listRoleRequests(db) });
});

app.post("/api/admin/role-requests/:id/approve", (request, response) => {
  const context = requireAdmin(request, response);
  if (!context) {
    return;
  }

  const reviewed = reviewRoleRequest(db, request.params.id, "approved", context.requester);
  if (!reviewed) {
    response.status(404).json({ message: "Role request not found." });
    return;
  }

  response.json({ request: reviewed });
});

app.post("/api/admin/role-requests/:id/reject", (request, response) => {
  const context = requireAdmin(request, response);
  if (!context) {
    return;
  }

  const reviewed = reviewRoleRequest(db, request.params.id, "rejected", context.requester);
  if (!reviewed) {
    response.status(404).json({ message: "Role request not found." });
    return;
  }

  response.json({ request: reviewed });
});
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm run lint
npm run test:ui -- tests/landing-page.spec.ts -g "role requests can be created|module access shows missing-role request action|admin role request endpoint"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/role-requests.ts server/server.ts tests/landing-page.spec.ts
git commit -m "feat: persist role request workflow in sqlite"
```

---

### Task 4: Monitoring History Persistence

**Files:**
- Create: `server/monitoring-history.ts`
- Modify: `server/server.ts`
- Test: `tests/landing-page.spec.ts`

- [ ] **Step 1: Add monitoring history test**

Append:

```ts
test("monitoring history contains service trend samples", async ({ page }) => {
  await page.request.get("/api/health");
  const response = await page.request.get("/api/monitoring/history");
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(Array.isArray(body.services)).toBe(true);
  const voice = body.services.find((service: { serviceId: string }) => service.serviceId === "voice");
  expect(voice).toBeTruthy();
  expect(Array.isArray(voice.samples)).toBe(true);
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
```

- [ ] **Step 2: Run focused test and verify failure**

Run:

```bash
npm run test:ui -- tests/landing-page.spec.ts -g "monitoring history contains"
```

Expected: FAIL because `/api/monitoring/history` still returns empty services.

- [ ] **Step 3: Create monitoring history repository**

Create `server/monitoring-history.ts`:

```ts
import type { Database } from "./db.js";

type ServiceState = "online" | "degraded" | "offline" | "checking" | "planned";

export type MonitoringSampleInput = {
  serviceId: string;
  state: ServiceState;
  message: string;
  responseMs: number | null;
  checkedAt: string;
};

export type MonitoringSample = MonitoringSampleInput & {
  id: number;
};

type MonitoringSampleRow = {
  id: number;
  service_id: string;
  state: ServiceState;
  message: string;
  response_ms: number | null;
  checked_at: string;
};

export type MonitoringHistoryService = {
  serviceId: string;
  samples: MonitoringSample[];
  incidents: MonitoringSample[];
};

function mapSample(row: MonitoringSampleRow): MonitoringSample {
  return {
    id: row.id,
    serviceId: row.service_id,
    state: row.state,
    message: row.message,
    responseMs: row.response_ms,
    checkedAt: row.checked_at
  };
}

export function insertMonitoringSamples(db: Database, samples: MonitoringSampleInput[]): void {
  const statement = db.prepare(
    "INSERT INTO monitoring_samples (service_id, state, message, response_ms, checked_at) VALUES (?, ?, ?, ?, ?)"
  );

  for (const sample of samples) {
    statement.run(sample.serviceId, sample.state, sample.message, sample.responseMs, sample.checkedAt);
  }
}

export function monitoringHistory(db: Database, serviceIds: string[], limitPerService = 24): MonitoringHistoryService[] {
  const statement = db.prepare(
    `SELECT * FROM monitoring_samples
     WHERE service_id = ?
     ORDER BY checked_at DESC
     LIMIT ?`
  );

  return serviceIds.map((serviceId) => {
    const samples = (statement.all(serviceId, limitPerService) as MonitoringSampleRow[]).map(mapSample);
    return {
      serviceId,
      samples,
      incidents: samples.filter((sample) => sample.state === "offline" || sample.state === "degraded").slice(0, 6)
    };
  });
}
```

- [ ] **Step 4: Persist samples after each health refresh**

In `server/server.ts`, import:

```ts
import { insertMonitoringSamples, monitoringHistory } from "./monitoring-history.js";
```

Inside `refreshHealth`, after `latestSnapshot` is assigned and before `return latestSnapshot;`, add:

```ts
insertMonitoringSamples(
  db,
  services.map((service) => ({
    serviceId: service.id,
    state: service.state,
    message: service.message,
    responseMs: service.responseMs,
    checkedAt: service.updatedAt ?? latestSnapshot.generatedAt
  }))
);
```

Replace the temporary `/api/monitoring/history` endpoint:

```ts
app.get("/api/monitoring/history", (_request, response) => {
  response.json({
    generatedAt: new Date().toISOString(),
    services: monitoringHistory(
      db,
      targets.map((target) => target.id)
    )
  });
});
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run lint
npm run test:ui -- tests/landing-page.spec.ts -g "monitoring history contains|persistent portal endpoints"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/monitoring-history.ts server/server.ts tests/landing-page.spec.ts
git commit -m "feat: store monitoring history samples"
```

---

### Task 5: GitLab Module News Storage And Webhook

**Files:**
- Create: `server/module-news.ts`
- Modify: `server/server.ts`
- Test: `tests/landing-page.spec.ts`

- [ ] **Step 1: Add GitLab event ingestion test**

Append:

```ts
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

  const first = await page.request.post("/api/gitlab/events", { data: payload });
  expect(first.ok()).toBe(true);
  expect((await first.json()).news.eventType).toBe("merge");

  const second = await page.request.post("/api/gitlab/events", { data: payload });
  expect(second.ok()).toBe(true);
  expect((await second.json()).created).toBe(false);

  const list = await page.request.get("/api/module-news");
  const body = await list.json();
  const matches = body.news.filter((item: { externalEventId: string }) => item.externalEventId === "gitlab:merge:42:34");
  expect(matches).toHaveLength(1);
});
```

- [ ] **Step 2: Run focused test and verify failure**

Run:

```bash
npm run test:ui -- tests/landing-page.spec.ts -g "gitlab events are deduplicated"
```

Expected: FAIL with `404` for `/api/gitlab/events`.

- [ ] **Step 3: Create module news repository and normalizer**

Create `server/module-news.ts`:

```ts
import type { Database } from "./db.js";

export type ModuleNewsEventType = "release" | "tag" | "merge";

export type ModuleNewsRecord = {
  id: string;
  externalEventId: string;
  projectId: string;
  projectName: string;
  eventType: ModuleNewsEventType;
  title: string;
  url: string | null;
  eventAt: string;
  createdAt: string;
};

type ModuleNewsRow = {
  id: string;
  external_event_id: string;
  project_id: string;
  project_name: string;
  event_type: ModuleNewsEventType;
  title: string;
  url: string | null;
  event_at: string;
  created_at: string;
};

function clean(value: unknown, fallback: string, maxLength = 180): string {
  return typeof value === "string" ? value.replace(/\\s+/g, " ").trim().slice(0, maxLength) || fallback : fallback;
}

function mapNews(row: ModuleNewsRow): ModuleNewsRecord {
  return {
    id: row.id,
    externalEventId: row.external_event_id,
    projectId: row.project_id,
    projectName: row.project_name,
    eventType: row.event_type,
    title: row.title,
    url: row.url,
    eventAt: row.event_at,
    createdAt: row.created_at
  };
}

export function listModuleNews(db: Database, limit = 50): ModuleNewsRecord[] {
  return (db.prepare("SELECT * FROM module_news ORDER BY event_at DESC LIMIT ?").all(limit) as ModuleNewsRow[]).map(mapNews);
}

export function saveModuleNews(db: Database, news: Omit<ModuleNewsRecord, "createdAt">): { news: ModuleNewsRecord; created: boolean } {
  const existing = db
    .prepare("SELECT * FROM module_news WHERE external_event_id = ?")
    .get(news.externalEventId) as ModuleNewsRow | undefined;

  if (existing) {
    return { news: mapNews(existing), created: false };
  }

  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO module_news (
      id, external_event_id, project_id, project_name, event_type, title, url, event_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(news.id, news.externalEventId, news.projectId, news.projectName, news.eventType, news.title, news.url, news.eventAt, createdAt);

  const row = db.prepare("SELECT * FROM module_news WHERE external_event_id = ?").get(news.externalEventId) as ModuleNewsRow;
  return { news: mapNews(row), created: true };
}

export function normalizeGitLabEvent(payload: unknown): Omit<ModuleNewsRecord, "createdAt"> | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as {
    object_kind?: unknown;
    event_type?: unknown;
    project?: { id?: unknown; name?: unknown; web_url?: unknown };
    object_attributes?: Record<string, unknown>;
    release?: Record<string, unknown>;
    ref?: unknown;
  };

  const projectId = String(data.project?.id ?? "unknown");
  const projectName = clean(data.project?.name, "GitLab Projekt");
  const attrs = data.object_attributes ?? {};
  const eventAt = clean(attrs.updated_at ?? attrs.created_at ?? attrs.merged_at ?? data.release?.released_at, new Date().toISOString());

  if (data.object_kind === "merge_request" || data.event_type === "merge_request") {
    const iid = String(attrs.iid ?? attrs.id ?? "unknown");
    if (attrs.state !== "merged") {
      return null;
    }
    return {
      id: `gitlab-merge-${projectId}-${iid}`,
      externalEventId: `gitlab:merge:${projectId}:${iid}`,
      projectId,
      projectName,
      eventType: "merge",
      title: clean(attrs.title, "Merge Request gemerged"),
      url: typeof attrs.url === "string" ? attrs.url : null,
      eventAt
    };
  }

  if (data.object_kind === "tag_push" || data.event_type === "tag_push") {
    const ref = clean(data.ref, "tag");
    return {
      id: `gitlab-tag-${projectId}-${ref.replace(/[^a-zA-Z0-9._-]+/g, "-")}`,
      externalEventId: `gitlab:tag:${projectId}:${ref}`,
      projectId,
      projectName,
      eventType: "tag",
      title: `${projectName} ${ref}`,
      url: typeof data.project?.web_url === "string" ? data.project.web_url : null,
      eventAt
    };
  }

  if (data.object_kind === "release" || data.event_type === "release") {
    const tag = clean(data.release?.tag ?? attrs.tag, "release");
    return {
      id: `gitlab-release-${projectId}-${tag.replace(/[^a-zA-Z0-9._-]+/g, "-")}`,
      externalEventId: `gitlab:release:${projectId}:${tag}`,
      projectId,
      projectName,
      eventType: "release",
      title: clean(data.release?.name ?? attrs.name, `${projectName} Release ${tag}`),
      url: typeof data.release?.url === "string" ? data.release.url : typeof data.project?.web_url === "string" ? data.project.web_url : null,
      eventAt
    };
  }

  return null;
}
```

- [ ] **Step 4: Add module news endpoints and merge update feed**

In `server/server.ts`, import:

```ts
import { listModuleNews, normalizeGitLabEvent, saveModuleNews } from "./module-news.js";
```

Replace the temporary `/api/module-news` endpoint:

```ts
app.get("/api/module-news", (_request, response) => {
  response.json({ generatedAt: new Date().toISOString(), news: listModuleNews(db) });
});
```

Add:

```ts
app.post("/api/gitlab/events", (request, response) => {
  const normalized = normalizeGitLabEvent(request.body);
  if (!normalized) {
    response.status(202).json({ message: "Ignored GitLab event." });
    return;
  }

  response.json(saveModuleNews(db, normalized));
});
```

Add this helper near `updateSnapshot`:

```ts
function storedModuleNewsUpdates(): PublicUpdate[] {
  return listModuleNews(db, 30).map((item) => ({
    id: item.id,
    serviceId: item.projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    date: item.eventAt,
    title: item.title,
    text: `${item.projectName}: ${item.eventType === "merge" ? "Merge Event" : item.eventType === "tag" ? "Tag" : "Release"} veröffentlicht.`,
    href: item.url ?? undefined
  }));
}
```

Update `updateSnapshot`:

```ts
const updates = [...storedModuleNewsUpdates(), ...publicServiceInfoUpdates(), ...(await fetchGitLabUpdates())].sort(
  (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()
);
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run lint
npm run test:ui -- tests/landing-page.spec.ts -g "gitlab events are deduplicated|news page lists recent module"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/module-news.ts server/server.ts tests/landing-page.spec.ts
git commit -m "feat: persist gitlab module news"
```

---

### Task 6: Frontend Data Hooks And Admin Visibility

**Files:**
- Modify: `src/main.tsx`
- Test: `tests/landing-page.spec.ts`

- [ ] **Step 1: Add admin visibility UI tests**

Append:

```ts
test("admin area is hidden without admin role and visible with admin role", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Admin", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Adminbereich" })).toHaveCount(0);

  await page.goto("/?roles=portal-admin");
  await expect(page.getByRole("button", { name: "Admin", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Adminbereich" })).toBeVisible();
  await expect(page.getByText("Berechtigungsanfragen")).toBeVisible();
  await expect(page.getByText("Monitoring-Verlauf")).toBeVisible();
  await expect(page.getByText("Modulnews")).toBeVisible();
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm run test:ui -- tests/landing-page.spec.ts -g "admin area is hidden"
```

Expected: FAIL because there is no Admin nav item.

- [ ] **Step 3: Extend client types**

In `src/main.tsx`, extend:

```ts
type NavSection = "overview" | "systems" | "channels" | "status" | "news" | "admin";
```

Add:

```ts
type MonitoringSample = {
  id: number;
  serviceId: string;
  state: ServiceState;
  message: string;
  responseMs: number | null;
  checkedAt: string;
};

type MonitoringHistorySnapshot = {
  generatedAt: string;
  services: Array<{
    serviceId: string;
    samples: MonitoringSample[];
    incidents: MonitoringSample[];
  }>;
};

type ModuleNews = {
  id: string;
  externalEventId: string;
  projectId: string;
  projectName: string;
  eventType: "release" | "tag" | "merge";
  title: string;
  url: string | null;
  eventAt: string;
  createdAt: string;
};

type ModuleNewsSnapshot = {
  generatedAt: string;
  news: ModuleNews[];
};
```

Update `RoleRequest` to include both old and new shape during migration:

```ts
type RoleRequest = {
  id: string;
  serviceId: string;
  serviceName: string;
  role: string;
  requiredRole?: string;
  state: "requested" | "approved" | "rejected";
  status?: "requested" | "approved" | "rejected";
  requester: string;
  reason?: string;
  source: string;
  reviewer?: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string | null;
};
```

- [ ] **Step 4: Add admin role helper and conditional nav**

Add:

```ts
function hasAdminRole(access: UserAccess): boolean {
  return ["portal-admin", "admin", "keycloak-admin"].some((role) => access.roles.has(role));
}
```

Change `Sidebar` props to accept `userAccess`, and filter nav items:

```ts
const visibleNavItems = navItems.filter((item) => item.id !== "admin" || hasAdminRole(userAccess));
```

Add the admin nav item to `navItems`:

```ts
{ id: "admin", label: "Admin", icon: ShieldCheck }
```

Update every `Sidebar` call site to pass `userAccess`.

- [ ] **Step 5: Add data hooks**

Add hooks near existing hooks:

```ts
function useMonitoringHistory(): MonitoringHistorySnapshot | null {
  const [snapshot, setSnapshot] = useState<MonitoringHistorySnapshot | null>(null);

  useEffect(() => {
    let closed = false;
    async function loadHistory() {
      try {
        const response = await fetch("/api/monitoring/history", { cache: "no-store" });
        if (!response.ok) throw new Error("Monitoring history unavailable");
        const data = (await response.json()) as MonitoringHistorySnapshot;
        if (!closed) setSnapshot(data);
      } catch {
        if (!closed) setSnapshot(null);
      }
    }

    void loadHistory();
    const timer = window.setInterval(loadHistory, HEALTH_REFRESH_MS);
    return () => {
      closed = true;
      window.clearInterval(timer);
    };
  }, []);

  return snapshot;
}

function useModuleNews(): ModuleNews[] {
  const [news, setNews] = useState<ModuleNews[]>([]);

  useEffect(() => {
    let closed = false;
    async function loadNews() {
      try {
        const response = await fetch("/api/module-news", { cache: "no-store" });
        if (!response.ok) throw new Error("Module news unavailable");
        const data = (await response.json()) as ModuleNewsSnapshot;
        if (!closed) setNews(Array.isArray(data.news) ? data.news : []);
      } catch {
        if (!closed) setNews([]);
      }
    }

    void loadNews();
    const timer = window.setInterval(loadNews, HEALTH_REFRESH_MS);
    return () => {
      closed = true;
      window.clearInterval(timer);
    };
  }, []);

  return news;
}
```

- [ ] **Step 6: Render admin area**

Add `AdminSection` component:

```tsx
function AdminSection({
  history,
  moduleNews,
  roleRequests
}: {
  history: MonitoringHistorySnapshot | null;
  moduleNews: ModuleNews[];
  roleRequests: RoleRequest[];
}) {
  return (
    <section className="content-section admin-section" aria-labelledby="admin-heading">
      <div className="section-heading">
        <span className="eyebrow">Admin</span>
        <h2 id="admin-heading">Adminbereich</h2>
        <p>Monitoring, Berechtigungsanfragen und automatisch veröffentlichte Modulnews.</p>
      </div>
      <div className="admin-grid">
        <article className="admin-panel">
          <h3>Monitoring-Verlauf</h3>
          {(history?.services ?? []).slice(0, 6).map((service) => (
            <div className="history-row" key={service.serviceId}>
              <strong>{service.serviceId}</strong>
              <span>{service.samples.length} Messpunkte</span>
              <span>{service.incidents.length} Auffälligkeiten</span>
            </div>
          ))}
        </article>
        <article className="admin-panel">
          <h3>Berechtigungsanfragen</h3>
          {roleRequests.slice(0, 8).map((request) => (
            <div className="request-row" key={request.id}>
              <strong>{request.serviceName}</strong>
              <span>{request.requester}</span>
              <StatusPill state={request.status ?? request.state} />
            </div>
          ))}
        </article>
        <article className="admin-panel">
          <h3>Modulnews</h3>
          {moduleNews.slice(0, 8).map((item) => (
            <div className="news-row" key={item.id}>
              <strong>{item.projectName}</strong>
              <span>{item.title}</span>
            </div>
          ))}
        </article>
      </div>
    </section>
  );
}
```

In `App`, call `useMonitoringHistory()` and `useModuleNews()`, then render `AdminSection` when `activeSection === "admin"` and `hasAdminRole(userAccess)`.

- [ ] **Step 7: Run tests**

Run:

```bash
npm run lint
npm run test:ui -- tests/landing-page.spec.ts -g "admin area is hidden"
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/main.tsx tests/landing-page.spec.ts
git commit -m "feat: add role-gated admin portal UI"
```

---

### Task 7: UI Redesign Polish For Hybrid Portal

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/styles.css`
- Test: `tests/landing-page.spec.ts`

- [ ] **Step 1: Add hybrid summary UI test**

Append:

```ts
test("overview presents hybrid portal summary", async ({ page }) => {
  await page.goto("/?roles=voice");
  await expect(page.getByText("Gesamtstatus")).toBeVisible();
  await expect(page.getByText("Eigene Anfragen")).toBeVisible();
  await expect(page.getByText("Neue Modulnews")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Verfügbare Dienste" })).toBeVisible();
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm run test:ui -- tests/landing-page.spec.ts -g "overview presents hybrid"
```

Expected: FAIL if the exact summary labels are not present.

- [ ] **Step 3: Add compact summary labels in overview**

In the current overview component, add three summary stat blocks using existing data:

```tsx
<div className="portal-summary" aria-label="Portalübersicht">
  <div>
    <span>Gesamtstatus</span>
    <strong>{snapshot ? overallLabels[snapshot.overall] : "Status wird geprüft"}</strong>
  </div>
  <div>
    <span>Eigene Anfragen</span>
    <strong>{roleRequests.filter((request) => (request.status ?? request.state) === "requested").length}</strong>
  </div>
  <div>
    <span>Neue Modulnews</span>
    <strong>{moduleNews.length}</strong>
  </div>
</div>
```

- [ ] **Step 4: Add CSS for summary and admin panels**

Add to `src/styles.css`:

```css
.portal-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-block: 16px 24px;
}

.portal-summary > div,
.admin-panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  padding: 16px;
}

.portal-summary span,
.history-row span,
.request-row span,
.news-row span {
  color: var(--muted);
  font-size: 0.85rem;
}

.portal-summary strong {
  display: block;
  margin-top: 6px;
  font-size: 1.1rem;
}

.admin-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.history-row,
.request-row,
.news-row {
  display: grid;
  gap: 4px;
  padding-block: 10px;
  border-top: 1px solid var(--border);
}

@media (max-width: 900px) {
  .portal-summary,
  .admin-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Run layout and UI tests**

Run:

```bash
npm run lint
npm run test:ui -- tests/landing-page.spec.ts -g "overview presents hybrid|desktop renders|mobile uses"
```

Expected: PASS and no horizontal overflow on mobile.

- [ ] **Step 6: Commit**

```bash
git add src/main.tsx src/styles.css tests/landing-page.spec.ts
git commit -m "feat: refine hybrid portal dashboard layout"
```

---

### Task 8: Docker And Documentation

**Files:**
- Modify: `docker-compose.yml`
- Modify: `README.md`
- Test: `tests/landing-page.spec.ts`

- [ ] **Step 1: Update Docker Compose environment**

In `docker-compose.yml`, remove:

```yaml
      ROLE_REQUESTS_FILE: ${ROLE_REQUESTS_FILE:-/app/data/role-requests.json}
```

Add:

```yaml
      SQLITE_DB_PATH: ${SQLITE_DB_PATH:-/app/data/landing-page.sqlite}
```

Keep the existing volume:

```yaml
    volumes:
      - ./data:/app/data
```

- [ ] **Step 2: Update README**

Add a section after development:

```md
## Persistenz

Der Server nutzt SQLite für Berechtigungsanfragen, Monitoring-Verlauf und automatisch veröffentlichte GitLab-Modulnews.

Standardpfad lokal:

```bash
data/landing-page.sqlite
```

Im Container wird der Pfad über `SQLITE_DB_PATH` gesetzt und durch `./data:/app/data` persistent gehalten.
```

Add a section after operation:

```md
## GitLab Modulnews

GitLab Releases, Tags und gemergte Merge Requests können über den Webhook-Endpunkt veröffentlicht werden:

```text
POST /api/gitlab/events
```

Der Server dedupliziert Ereignisse über eine externe Event-ID. Wiederholte Webhook-Zustellungen erzeugen keine doppelten News.
```

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run lint
npm run build
npm run test:ui
```

Expected: all commands pass.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml README.md
git commit -m "docs: document sqlite portal persistence"
```

---

## Final Verification

- [ ] **Step 1: Check working tree**

Run:

```bash
git status --short
```

Expected: no unexpected uncommitted files. If `data/landing-page.sqlite` exists, add `data/*.sqlite*` to `.gitignore` and commit that ignore rule.

- [ ] **Step 2: Run complete verification again**

Run:

```bash
npm run lint
npm run build
npm run test:ui
```

Expected: all pass.

- [ ] **Step 3: Manual smoke run**

Run:

```bash
npm start
```

Open `http://localhost:8080` and verify:

- Normal user sees no Admin navigation.
- `?roles=portal-admin` shows Admin navigation.
- A missing service role can be requested.
- Admin area shows monitoring history, role requests, and module news.
- News page includes stored GitLab module news after posting a webhook event.

- [ ] **Step 4: Final commit if verification changed files**

```bash
git add .
git commit -m "chore: finalize integrated portal expansion"
```

Only run this commit if verification changed tracked files or added intentional ignore rules.
