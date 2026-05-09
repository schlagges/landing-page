import type { Request, Response } from "express";

export type RequestContext = {
  requester: string;
  roles: Set<string>;
  trustedRoles: Set<string>;
  isTrustedRequester: boolean;
  isAdmin: boolean;
};

const ADMIN_ROLES = new Set(["portal-admin", "admin", "keycloak-admin"]);
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

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

function normalizeRemoteAddress(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const address = value.trim();
  if (LOOPBACK_ADDRESSES.has(address)) {
    return address;
  }

  if (address.startsWith("::ffff:127.")) {
    return "::ffff:127.0.0.1";
  }

  if (address.startsWith("127.")) {
    return "127.0.0.1";
  }

  return address;
}

function isTrustedLocalRequest(request: Request): boolean {
  const candidates = [request.ip, request.socket.remoteAddress];
  return candidates.some((candidate) => {
    const address = normalizeRemoteAddress(candidate);
    return address !== null && LOOPBACK_ADDRESSES.has(address);
  });
}

export function requestContext(request: Request): RequestContext {
  const trustedRoles = new Set<string>();
  const isTrustedLocal = isTrustedLocalRequest(request);
  if (isTrustedLocal) {
    addDelimitedRoles(trustedRoles, request.headers["x-schnick-schnack-roles"] as string | undefined);
    addDelimitedRoles(trustedRoles, request.headers["x-forwarded-roles"] as string | undefined);
  }

  const roles = new Set<string>();
  trustedRoles.forEach((role) => roles.add(role));
  addDelimitedRoles(roles, typeof request.query.roles === "string" ? request.query.roles : undefined);

  const trustedRequester = isTrustedLocal
    ? request.headers["x-schnick-schnack-user"] ?? request.headers["x-forwarded-user"]
    : undefined;
  const isTrustedRequester = typeof trustedRequester === "string" && trustedRequester.trim().length > 0;
  const requester = sanitizeIdentity(trustedRequester, "anonymous");

  return {
    requester,
    roles,
    trustedRoles,
    isTrustedRequester,
    isAdmin: Array.from(trustedRoles).some((role) => ADMIN_ROLES.has(role))
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
