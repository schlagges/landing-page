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
    .split(/[\s,;]+/)
    .map((role) => role.trim())
    .filter(Boolean)
    .forEach((role) => target.add(role));
}

function sanitizeIdentity(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.replace(/\s+/g, " ").trim().slice(0, 120) || fallback;
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
