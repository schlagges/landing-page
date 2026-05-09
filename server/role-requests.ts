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

export type PublicRoleRequestRecord = Pick<
  RoleRequestRecord,
  "serviceId" | "serviceName" | "requiredRole" | "role" | "status" | "state" | "createdAt" | "updatedAt"
>;

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

function mapPublicRoleRequest(row: RoleRequestRow): PublicRoleRequestRecord {
  return {
    serviceId: row.service_id,
    serviceName: row.service_name,
    requiredRole: row.required_role,
    role: row.required_role,
    status: row.status,
    state: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listRoleRequests(db: Database): RoleRequestRecord[] {
  return (db.prepare("SELECT * FROM role_requests ORDER BY created_at DESC LIMIT 250").all() as RoleRequestRow[]).map(
    mapRoleRequest
  );
}

export function listPublicRoleRequests(db: Database): PublicRoleRequestRecord[] {
  return (
    db.prepare("SELECT * FROM role_requests WHERE status = 'requested' ORDER BY created_at DESC LIMIT 250").all() as RoleRequestRow[]
  ).map(mapPublicRoleRequest);
}

export function listRoleRequestsForRequester(db: Database, requester: string): RoleRequestRecord[] {
  return (
    db.prepare("SELECT * FROM role_requests WHERE requester = ? ORDER BY created_at DESC LIMIT 100").all(requester) as RoleRequestRow[]
  ).map(mapRoleRequest);
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
  if (existing) {
    return { request: mapRoleRequest(existing), created: false };
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO role_requests (
      id, service_id, service_name, required_role, requester, reason, status, reviewer, source, created_at, updated_at, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'requested', NULL, ?, ?, ?, NULL)`
  ).run(id, service.id, service.name, service.requiredRole, requester, reason, source, now, now);

  const row = db.prepare("SELECT * FROM role_requests WHERE id = ?").get(id) as RoleRequestRow;
  return { request: mapRoleRequest(row), created: true };
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
