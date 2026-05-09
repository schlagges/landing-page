# Integrated Landingpage Expansion Design

## Summary

The landing page will become an integrated service portal for `schnick-schnack.info`. It will support two equal perspectives:

- Normal users find services, understand status, and request missing roles.
- Admins monitor service health, review role requests, and see automatically published GitLab module news.

The first expansion keeps the existing React/Vite frontend and Express server. SQLite becomes the persistent local database for role requests, monitoring history, and module news.

## Goals

- Redesign the UI into a quieter, more productive service portal.
- Separate normal user and admin workflows clearly.
- Show admin areas only to users with admin roles.
- Add a backend-backed role request workflow.
- Store monitoring history and show status trends per service.
- Publish GitLab release, tag, and merge-event news automatically.
- Keep deployment simple with SQLite in a persistent container volume.

## Non-Goals

- No external database in the first expansion.
- No full audit log.
- No UI for configuring monitoring checks.
- No manual editorial approval for GitLab news.
- No advanced role expiry or renewal workflow.
- No separate admin application.

## Architecture

The Express server remains the central API layer. It will expose the current health and service information APIs and add new APIs for role requests, monitoring history, and module news.

SQLite will store durable application state in a mounted volume. Server startup will initialize the schema if it does not exist and apply lightweight migrations in a deterministic order.

The React app will render different navigation and page sections based on role information. Admin navigation and admin-only routes are not visible unless the current user has an admin role. The server still enforces admin permissions on all admin APIs.

GitLab events are handled server-side. Releases, tags, and merge events are accepted through a webhook endpoint or equivalent server-side ingestion path and are immediately stored as published module news.

## UI Structure

The page becomes a hybrid dashboard:

- Top summary: overall status, latest update time, own open requests, and recent module news.
- User area: service cards with status, required role, description, last update, and either open or request access action.
- My requests: current user's role requests with `requested`, `approved`, or `rejected` status.
- Admin area: visible only for admins, with monitoring history, role request review, and module news.

The redesign should feel like a compact operational portal rather than a marketing landing page. It should prioritize scanability, clear status text, compact cards, stable responsive layouts, and meaningful grouping. It should avoid nested cards, oversized hero sections, decorative effects, and unclear color-only status signals.

## Role Request Workflow

Users can request access from a service card when they lack the required role.

The request form captures:

- Service ID and service name.
- Required role.
- Requester identity.
- Optional reason.

Requests use this status model:

- `requested`
- `approved`
- `rejected`

Admins can approve or reject requests from the admin area. The first expansion records the reviewer and timestamps but does not automatically modify Keycloak or another identity provider unless an existing backend integration already supports it. If direct role assignment is unavailable, the UI must make that state explicit after approval.

## Monitoring Workflow

The current health checks remain the source of live service status. Each check result is also stored as a monitoring sample with service ID, state, message, response time, and checked timestamp.

The UI will show:

- Current status per service.
- Last check time.
- Response time where available.
- Short trend or chart per service.
- Recent incidents or state changes derived from stored samples.

If checks fail or the latest fetch is unavailable, the UI shows the last known data with its timestamp rather than an empty or misleading state.

## GitLab Module News

GitLab releases, tags, and merge events are stored as public module news immediately.

Each news item stores:

- GitLab project identifier and name.
- Event type: release, tag, or merge.
- Title.
- Link.
- Event timestamp.
- External event ID used for deduplication.

Webhook retries or repeated polling must not create duplicate news items. The UI shows recent module news in the summary area and a fuller news list in the normal news section.

## Data Model

Initial SQLite tables:

```text
role_requests(
  id,
  service_id,
  service_name,
  required_role,
  requester,
  reason,
  status,
  reviewer,
  created_at,
  updated_at,
  reviewed_at
)

monitoring_samples(
  id,
  service_id,
  state,
  message,
  response_ms,
  checked_at
)

module_news(
  id,
  external_event_id,
  project_id,
  project_name,
  event_type,
  title,
  url,
  event_at,
  created_at
)
```

`module_news.external_event_id` must be unique.

## API Surface

New or expanded endpoints:

```text
GET  /api/monitoring/history
GET  /api/role-requests/me
POST /api/role-requests
GET  /api/admin/role-requests
POST /api/admin/role-requests/:id/approve
POST /api/admin/role-requests/:id/reject
GET  /api/module-news
POST /api/gitlab/events
```

Admin endpoints must validate admin roles server-side. User request endpoints must derive requester identity from trusted login or role context instead of accepting arbitrary requester values from the browser.

## Error Handling

Role request submission errors should preserve entered form data and show a clear retryable error.

Admin approve or reject failures should leave the request in its previous state and refresh the row after failure.

GitLab event ingestion should deduplicate repeated events and return a successful idempotent response when the event already exists.

Monitoring history should tolerate missing samples and unavailable checks. The UI should label stale data clearly with timestamps.

## Testing

Test coverage should include:

- SQLite schema initialization and idempotent migration behavior.
- Role request creation and status transitions.
- Server-side rejection of admin APIs without admin role.
- GitLab event ingestion and deduplication.
- Monitoring sample persistence from health checks.
- React rendering for normal user versus admin role.
- Playwright coverage for requesting access, viewing own requests, and admin approval or rejection.

## Rollout

1. Add SQLite persistence and schema initialization.
2. Persist monitoring samples without changing the visible UI.
3. Add role request APIs and user request UI.
4. Add admin-only role request review UI.
5. Add GitLab event ingestion and module news UI.
6. Apply the broader UI redesign around the new information architecture.

This order keeps each step testable and avoids coupling the visual redesign to every backend change at once.
