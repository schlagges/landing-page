import {
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  CircleGauge,
  Clock3,
  FileText,
  GitBranch,
  Hash,
  Mic2,
  Moon,
  RefreshCw,
  ShieldCheck,
  Slack,
  SlidersHorizontal,
  Sun,
  UserRound
} from "lucide-react";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type ServiceState = "online" | "degraded" | "offline" | "checking" | "planned";
type ServiceCategory = "communication" | "identity" | "development" | "ai" | "roadmap";
type ServiceInfoState = "checking" | "available" | "unsupported" | "error" | "planned";
type ThemeId = (typeof THEMES)[number]["id"];
type NavSection = "overview" | "systems" | "channels" | "status" | "news" | "admin";
type SocketState = "connecting" | "live" | "fallback";
type RowTone = "green" | "blue" | "violet" | "amber";
type LoginState = {
  name: string;
  value: string;
};
type RoleRequestState = "requested" | "approved" | "rejected";

type UserAccess = {
  roles: Set<string>;
  hasRoleInfo: boolean;
};

type RoleRequest = {
  id?: string;
  serviceId: string;
  serviceName: string;
  requiredRole?: string;
  role: string;
  state?: RoleRequestState;
  status?: RoleRequestState;
  requester?: string;
  reason?: string;
  source?: string;
  reviewer?: string | null;
  createdAt?: string;
  updatedAt?: string;
  reviewedAt?: string | null;
};

type RoleRequestSnapshot = {
  generatedAt: string;
  channel: string;
  requests: RoleRequest[];
};

type PublicService = {
  id: string;
  name: string;
  category: ServiceCategory;
  icon: "brain" | "file-text" | "mic" | "shield" | "gitlab" | "slack";
  href: string | null;
  unavailableActionLabel?: string;
  requiredRole?: string;
  description: string;
  state: ServiceState;
  message: string;
  updatedAt: string | null;
  responseMs: number | null;
  infoState: ServiceInfoState;
  infoUpdatedAt: string | null;
};

type HealthSnapshot = {
  generatedAt: string;
  overall: Exclude<ServiceState, "planned">;
  services: PublicService[];
};

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

type BuildInfo = {
  builtAt: string | null;
};

type ServiceMetric = {
  id: string;
  label: string;
  value: string | number | boolean;
  unit?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
};

type ServiceChart = {
  id: string;
  title: string;
  unit?: string;
  points: Array<{ label: string; value: number }>;
};

type ServiceAction = {
  id: string;
  label: string;
  href: string;
  kind?: "primary" | "secondary" | "danger";
};

type ServiceFeedItem = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  href?: string;
};

type ServiceFeed = {
  id: string;
  title: string;
  href?: string;
  items: ServiceFeedItem[];
};

type ServiceInfo = {
  schemaVersion: "1.0";
  serviceId: string;
  generatedAt: string;
  summary?: string;
  metrics?: ServiceMetric[];
  charts?: ServiceChart[];
  actions?: ServiceAction[];
  sections?: Array<{ id: string; title: string; body: string }>;
  feeds?: ServiceFeed[];
};

type ServiceInfoResult = {
  serviceId: string;
  status: ServiceInfoState;
  message: string;
  updatedAt: string | null;
  responseMs: number | null;
  data: ServiceInfo | null;
};

type ServiceInfoSnapshot = {
  generatedAt: string;
  services: ServiceInfoResult[];
};

type PublicUpdate = {
  id: string;
  serviceId: string;
  date: string;
  title: string;
  text: string;
  href?: string;
};

type PublicUpdateSnapshot = {
  generatedAt: string;
  updates: PublicUpdate[];
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => void;
};

const HEALTH_REFRESH_MS = 10000;
const STORAGE_KEY = "schnick-schnack.theme";
const DEFAULT_THEME = "dark";
const KEYCLOAK_AUTH_URL =
  import.meta.env.VITE_KEYCLOAK_AUTH_URL ??
  "https://auth.schnick-schnack.info/realms/master/protocol/openid-connect/auth";
const KEYCLOAK_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? "landing-page";
const KEYCLOAK_CODE_CHALLENGE =
  import.meta.env.VITE_KEYCLOAK_CODE_CHALLENGE ?? "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const THEMES = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" }
] as const;

const stateLabels: Record<ServiceState, string> = {
  checking: "Prüfung",
  degraded: "Eingeschränkt",
  offline: "Offline",
  online: "Online",
  planned: "Geplant"
};

const roleRequestStateLabels: Record<RoleRequestState, string> = {
  approved: "Genehmigt",
  rejected: "Abgelehnt",
  requested: "Angefragt"
};

const overallLabels: Record<HealthSnapshot["overall"], string> = {
  checking: "Status wird geprüft",
  degraded: "Teilweise verfügbar",
  offline: "Störung erkannt",
  online: "Alle öffentlichen Dienste erreichbar"
};

const infoStateLabels: Record<ServiceInfoState, string> = {
  available: "API aktiv",
  checking: "API-Prüfung",
  error: "API Fehler",
  planned: "Geplant",
  unsupported: "Keine API-Daten"
};

const iconMap = {
  brain: BrainCircuit,
  "file-text": FileText,
  gitlab: GitBranch,
  mic: Mic2,
  shield: ShieldCheck,
  slack: Slack
};

const SECTION_PARAM = "section";
const LOGIN_STATE_PARAMS = ["login_state", "log_state", "auth_state", "state", "logged_in"] as const;
const LOGIN_STATE_COOKIES = ["schnick_schnack_login_state", "schnick-schnack.login_state", "login_state"] as const;
const ROLE_PARAMS = ["roles", "role", "realm_roles", "resource_roles"] as const;
const ROLE_COOKIES = ["schnick_schnack_roles", "keycloak_roles", "roles"] as const;
const TOKEN_PARAMS = ["id_token", "access_token", "token"] as const;

const navItems = [
  { id: "overview", label: "Übersicht", icon: CircleGauge },
  { id: "systems", label: "Systeme", icon: SlidersHorizontal },
  { id: "channels", label: "Kanäle", icon: Hash },
  { id: "status", label: "Status", icon: CheckCircle2 },
  { id: "news", label: "News", icon: FileText },
  { id: "admin", label: "Admin", icon: ShieldCheck }
] as const;


function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function normalizeTheme(theme: string | null | undefined): ThemeId {
  return THEMES.some((item) => item.id === theme) ? (theme as ThemeId) : DEFAULT_THEME;
}

function normalizeSection(section: string | null | undefined): NavSection {
  return navItems.some((item) => item.id === section) ? (section as NavSection) : "overview";
}

function isStorageAvailable(): boolean {
  try {
    const testKey = "__theme_test__";
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function writeDesignCookie(key: string, value: string) {
  document.cookie = `${key}=${encodeURIComponent(value)}; Path=/; Domain=.schnick-schnack.info; Max-Age=31536000; SameSite=Lax`;
}

function applyTheme(theme: ThemeId, shouldSave = true) {
  document.documentElement.dataset.theme = theme;

  if (shouldSave && isStorageAvailable()) {
    window.localStorage.setItem(STORAGE_KEY, theme);
  }

  writeDesignCookie(STORAGE_KEY, theme);
}

function applyInitialTheme(): ThemeId {
  const queryTheme = new URLSearchParams(window.location.search).get("theme");
  const savedTheme = isStorageAvailable() ? window.localStorage.getItem(STORAGE_KEY) : null;
  const initialTheme = normalizeTheme(queryTheme ?? savedTheme);
  applyTheme(initialTheme, Boolean(queryTheme));
  return initialTheme;
}

function initialSection(): NavSection {
  const url = new URL(window.location.href);
  const querySection = url.searchParams.get(SECTION_PARAM);
  const hashSection = url.hash.startsWith("#") ? url.hash.slice(1) : null;
  return normalizeSection(querySection ?? hashSection);
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const match = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));

  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch {
    return match.slice(prefix.length);
  }
}

function readLoginState(): LoginState | null {
  const params = new URLSearchParams(window.location.search);
  for (const name of LOGIN_STATE_PARAMS) {
    const value = params.get(name);
    if (value) {
      return { name, value };
    }
  }

  for (const name of LOGIN_STATE_COOKIES) {
    const value = readCookie(name);
    if (value) {
      return { name: "login_state", value };
    }
  }

  return null;
}

function addDelimitedRoles(target: Set<string>, value: string | null | undefined) {
  if (!value) {
    return;
  }

  value
    .split(/[\s,;]+/)
    .map((role) => role.trim())
    .filter(Boolean)
    .forEach((role) => target.add(role));
}

function decodeJwtPayload(token: string): unknown {
  const [, payload] = token.split(".");
  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
}

function collectTokenRoles(target: Set<string>, token: string | null | undefined) {
  const payload = decodeJwtPayload(token ?? "");
  if (!payload || typeof payload !== "object") {
    return;
  }

  const data = payload as {
    realm_access?: { roles?: unknown };
    resource_access?: Record<string, { roles?: unknown }>;
  };

  if (Array.isArray(data.realm_access?.roles)) {
    data.realm_access.roles.filter((role): role is string => typeof role === "string").forEach((role) => target.add(role));
  }

  Object.values(data.resource_access ?? {}).forEach((resource) => {
    if (Array.isArray(resource.roles)) {
      resource.roles.filter((role): role is string => typeof role === "string").forEach((role) => target.add(role));
    }
  });
}

function readUserAccess(): UserAccess {
  const roles = new Set<string>();
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash);

  ROLE_PARAMS.forEach((name) => {
    addDelimitedRoles(roles, search.get(name));
    addDelimitedRoles(roles, hash.get(name));
  });

  ROLE_COOKIES.forEach((name) => addDelimitedRoles(roles, readCookie(name)));
  TOKEN_PARAMS.forEach((name) => {
    collectTokenRoles(roles, search.get(name));
    collectTokenRoles(roles, hash.get(name));
  });

  return {
    roles,
    hasRoleInfo: roles.size > 0
  };
}

function returnUrl(theme: ThemeId, section: NavSection): string {
  const url = new URL(window.location.href);
  url.searchParams.set("theme", theme);
  url.searchParams.delete("return_to");
  url.searchParams.delete("code");
  url.searchParams.delete("session_state");
  url.searchParams.delete("iss");
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");

  if (section === "overview") {
    url.searchParams.delete(SECTION_PARAM);
  } else {
    url.searchParams.set(SECTION_PARAM, section);
  }

  return url.toString();
}

function withThemeParam(href: string, theme: ThemeId): string {
  try {
    const url = new URL(href, window.location.origin);
    url.searchParams.set("theme", theme);
    return url.toString();
  } catch {
    return href;
  }
}

function loginHref(theme: ThemeId, section: NavSection, loginState: LoginState | null): string {
  try {
    const url = new URL(KEYCLOAK_AUTH_URL);
    url.searchParams.set("client_id", KEYCLOAK_CLIENT_ID);
    url.searchParams.set("redirect_uri", returnUrl(theme, section));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid");
    url.searchParams.set("code_challenge", KEYCLOAK_CODE_CHALLENGE);
    url.searchParams.set("code_challenge_method", "S256");

    if (loginState) {
      url.searchParams.set("state", loginState.value);
    }

    return url.toString();
  } catch {
    return KEYCLOAK_AUTH_URL;
  }
}

function hasServiceRole(service: PublicService, access: UserAccess): boolean {
  return !service.requiredRole || access.roles.has(service.requiredRole);
}

function hasAdminRole(access: UserAccess): boolean {
  return ["portal-admin", "admin", "keycloak-admin"].some((role) => access.roles.has(role));
}

function accessLabel(service: PublicService, access: UserAccess): string {
  if (!service.requiredRole) {
    return "Öffentlich";
  }

  if (!access.hasRoleInfo) {
    return `Rolle ${service.requiredRole}`;
  }

  return hasServiceRole(service, access) ? "Zugriff aktiv" : "Rolle fehlt";
}

function requesterLabel(loginState: LoginState | null): string {
  return loginState?.value ?? "landing-page-user";
}

function roleRequestState(request: RoleRequest): RoleRequestState {
  return request.status ?? request.state ?? "requested";
}

function requestedRoleFor(service: PublicService, requests: RoleRequest[]): RoleRequest | undefined {
  return requests.find(
    (request) =>
      request.serviceId === service.id &&
      (request.requiredRole ?? request.role) === service.requiredRole &&
      roleRequestState(request) === "requested"
  );
}

function formatTime(value: string | null): string {
  if (!value) {
    return "Noch nicht geprüft";
  }

  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function formatFeedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Ohne Datum";
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function metricValue(metric: ServiceMetric): string {
  return `${String(metric.value)}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function metricLabel(metric: ServiceMetric): string {
  return `${metric.label}: ${metricValue(metric)}`;
}

function rowTone(service: PublicService): RowTone {
  if (service.state === "offline" || service.state === "degraded") {
    return "amber";
  }

  if (service.icon === "shield") {
    return "blue";
  }

  if (service.icon === "slack") {
    return "violet";
  }

  if (service.icon === "brain") {
    return "violet";
  }

  if (service.icon === "file-text") {
    return "blue";
  }

  if (service.icon === "gitlab") {
    return "amber";
  }

  return "green";
}

function chartPoints(serviceInfo: ServiceInfoResult | undefined): number[] | null {
  const chart = serviceInfo?.data?.charts?.find((item) => item.points.length > 1);
  if (!chart) {
    return null;
  }

  return chart.points.map((point) => point.value).slice(-16);
}

function averageResponse(services: PublicService[]): number | null {
  const responseTimes = services
    .map((service) => service.responseMs)
    .filter((value): value is number => value !== null);

  if (!responseTimes.length) {
    return null;
  }

  return Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length);
}

function serviceMetricValue(services: ServiceInfoResult[], status: ServiceInfoState): number {
  return services.filter((service) => service.status === status).length;
}

function firstStatusChart(serviceInfo: ServiceInfoSnapshot | null): ServiceChart | null {
  return (
    serviceInfo?.services
      .flatMap((service) => service.data?.charts ?? [])
      .find((chart) => chart.points.length > 1) ?? null
  );
}

function useHealth(): { snapshot: HealthSnapshot | null; socketState: SocketState } {
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [socketState, setSocketState] = useState<SocketState>("connecting");

  useEffect(() => {
    let closed = false;
    let fallbackTimer: number | undefined;

    async function loadSnapshot() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Health snapshot unavailable");
        }
        const data = (await response.json()) as HealthSnapshot;
        if (!closed) {
          setSnapshot(data);
        }
      } catch {
        if (!closed) {
          setSocketState("fallback");
        }
      }
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws/health`);

    socket.addEventListener("open", () => {
      if (!closed) {
        setSocketState("live");
      }
    });

    socket.addEventListener("message", (event) => {
      if (!closed) {
        setSnapshot(JSON.parse(event.data as string) as HealthSnapshot);
      }
    });

    socket.addEventListener("close", () => {
      if (!closed) {
        setSocketState("fallback");
        void loadSnapshot();
        fallbackTimer = window.setInterval(loadSnapshot, HEALTH_REFRESH_MS);
      }
    });

    socket.addEventListener("error", () => {
      if (!closed) {
        setSocketState("fallback");
      }
    });

    void loadSnapshot();

    return () => {
      closed = true;
      socket.close();
      if (fallbackTimer) {
        window.clearInterval(fallbackTimer);
      }
    };
  }, []);

  return { snapshot, socketState };
}

function useServiceInfo(): ServiceInfoSnapshot | null {
  const [snapshot, setSnapshot] = useState<ServiceInfoSnapshot | null>(null);

  useEffect(() => {
    let closed = false;

    async function loadServiceInfo() {
      try {
        const response = await fetch("/api/service-info", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Service info unavailable");
        }
        const data = (await response.json()) as ServiceInfoSnapshot;
        if (!closed) {
          setSnapshot(data);
        }
      } catch {
        if (!closed) {
          setSnapshot(null);
        }
      }
    }

    void loadServiceInfo();
    const timer = window.setInterval(loadServiceInfo, HEALTH_REFRESH_MS);

    return () => {
      closed = true;
      window.clearInterval(timer);
    };
  }, []);

  return snapshot;
}

function usePublicUpdates(): PublicUpdate[] {
  const [updates, setUpdates] = useState<PublicUpdate[]>([]);

  useEffect(() => {
    let closed = false;

    async function loadUpdates() {
      try {
        const response = await fetch("/api/updates", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Updates unavailable");
        }
        const data = (await response.json()) as PublicUpdateSnapshot;
        if (!closed) {
          setUpdates(Array.isArray(data.updates) ? data.updates : []);
        }
      } catch {
        if (!closed) {
          setUpdates([]);
        }
      }
    }

    void loadUpdates();
    const timer = window.setInterval(loadUpdates, HEALTH_REFRESH_MS);

    return () => {
      closed = true;
      window.clearInterval(timer);
    };
  }, []);

  return updates;
}

function useMonitoringHistory(enabled: boolean): MonitoringHistorySnapshot | null {
  const [snapshot, setSnapshot] = useState<MonitoringHistorySnapshot | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSnapshot(null);
      return;
    }

    let closed = false;

    async function loadHistory() {
      try {
        const response = await fetch("/api/monitoring/history", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Monitoring history unavailable");
        }
        const data = (await response.json()) as MonitoringHistorySnapshot;
        if (!closed) {
          setSnapshot(data);
        }
      } catch {
        if (!closed) {
          setSnapshot(null);
        }
      }
    }

    void loadHistory();
    const timer = window.setInterval(loadHistory, HEALTH_REFRESH_MS);

    return () => {
      closed = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return snapshot;
}

function useModuleNews(enabled: boolean): ModuleNews[] {
  const [news, setNews] = useState<ModuleNews[]>([]);

  useEffect(() => {
    if (!enabled) {
      setNews([]);
      return;
    }

    let closed = false;

    async function loadNews() {
      try {
        const response = await fetch("/api/module-news", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Module news unavailable");
        }
        const data = (await response.json()) as ModuleNewsSnapshot;
        if (!closed) {
          setNews(Array.isArray(data.news) ? data.news : []);
        }
      } catch {
        if (!closed) {
          setNews([]);
        }
      }
    }

    void loadNews();
    const timer = window.setInterval(loadNews, HEALTH_REFRESH_MS);

    return () => {
      closed = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return news;
}

function useRoleRequests() {
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [pendingServiceId, setPendingServiceId] = useState<string | null>(null);

  async function loadRequests() {
    try {
      const response = await fetch("/api/role-requests", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Role requests unavailable");
      }
      const data = (await response.json()) as RoleRequestSnapshot;
      setRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch {
      setRequests([]);
    }
  }

  useEffect(() => {
    void loadRequests();
  }, []);

  async function requestRole(service: PublicService, requester: string) {
    if (!service.requiredRole) {
      return;
    }

    setPendingServiceId(service.id);
    try {
      const response = await fetch("/api/role-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          requester,
          source: window.location.href
        })
      });

      if (!response.ok) {
        throw new Error("Role request failed");
      }

      const data = (await response.json()) as { request?: RoleRequest };
      if (data.request) {
        setRequests((current) => [
          data.request!,
          ...current.filter(
            (item) =>
              item.id !== data.request!.id &&
              !(item.serviceId === data.request!.serviceId && (item.requiredRole ?? item.role) === (data.request!.requiredRole ?? data.request!.role))
          )
        ]);
      } else {
        await loadRequests();
      }
    } finally {
      setPendingServiceId(null);
    }
  }

  return {
    requests,
    pendingServiceId,
    requestRole
  };
}

function adminRequestHeaders(userAccess: UserAccess, loginState: LoginState | null): HeadersInit {
  const headers: Record<string, string> = {};
  if (userAccess.roles.size > 0) {
    headers["x-schnick-schnack-roles"] = Array.from(userAccess.roles).join(",");
  }
  headers["x-schnick-schnack-user"] = requesterLabel(loginState);
  return headers;
}

function useAdminRoleRequests(enabled: boolean, userAccess: UserAccess, loginState: LoginState | null): RoleRequest[] {
  const [requests, setRequests] = useState<RoleRequest[]>([]);

  useEffect(() => {
    if (!enabled) {
      setRequests([]);
      return;
    }

    let closed = false;

    async function loadRequests() {
      try {
        const response = await fetch("/api/admin/role-requests", {
          cache: "no-store",
          headers: adminRequestHeaders(userAccess, loginState)
        });
        if (!response.ok) {
          throw new Error("Admin role requests unavailable");
        }
        const data = (await response.json()) as RoleRequestSnapshot;
        if (!closed) {
          setRequests(Array.isArray(data.requests) ? data.requests : []);
        }
      } catch {
        if (!closed) {
          setRequests([]);
        }
      }
    }

    void loadRequests();

    return () => {
      closed = true;
    };
  }, [enabled, loginState, userAccess]);

  return requests;
}

function useBuildInfo(): BuildInfo | null {
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);

  useEffect(() => {
    let closed = false;

    async function loadBuildInfo() {
      try {
        const response = await fetch("/api/build-info", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Build info unavailable");
        }
        const data = (await response.json()) as BuildInfo;
        if (!closed) {
          setBuildInfo(data);
        }
      } catch {
        if (!closed) {
          setBuildInfo(null);
        }
      }
    }

    void loadBuildInfo();

    return () => {
      closed = true;
    };
  }, []);

  return buildInfo;
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 900px)").matches);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const update = () => setIsMobile(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function StatusPill({ state }: { state: ServiceState | RoleRequestState }) {
  const label = state in stateLabels ? stateLabels[state as ServiceState] : roleRequestStateLabels[state as RoleRequestState];
  return <span className={`status-pill status-${state}`}>{label}</span>;
}

function Wordmark() {
  return (
    <div className="wordmark" aria-label="Lu To Bo">
      {["Lu", "To", "Bo"].map((segment, index) => (
        <span key={`${segment}-${index}`} style={{ "--segment-index": index } as React.CSSProperties}>
          {segment}
        </span>
      ))}
    </div>
  );
}

function ThemeToggle({
  activeTheme,
  onThemeChange
}: {
  activeTheme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
}) {
  return (
    <div className="theme-toggle" role="group" aria-label="Darstellung">
      {THEMES.map((theme) => {
        const Icon = theme.id === "dark" ? Moon : Sun;
        return (
          <button
            aria-label={`Theme ${theme.label} aktivieren`}
            aria-pressed={activeTheme === theme.id}
            className={`theme-toggle__option${activeTheme === theme.id ? " is-active" : ""}`}
            data-theme-choice={theme.id}
            key={theme.id}
            onClick={() => onThemeChange(theme.id)}
            type="button"
          >
            <Icon size={15} aria-hidden="true" />
            <span>{theme.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Sidebar({
  activeSection,
  activeTheme,
  loginState,
  onSectionChange,
  onThemeChange,
  userAccess
}: {
  activeSection: NavSection;
  activeTheme: ThemeId;
  loginState: LoginState | null;
  onSectionChange: (section: NavSection) => void;
  onThemeChange: (theme: ThemeId) => void;
  userAccess: UserAccess;
}) {
  const visibleNavItems = navItems.filter((item) => item.id !== "admin" || hasAdminRole(userAccess));

  return (
    <aside className="app-sidebar" aria-label="Schnick Schnack Navigation">
      <a className="brand-lockup" href="/" aria-label="schnick-schnack.info Startseite">
        <span className="brand-mark" aria-hidden="true">
          <span />
        </span>
        <span className="brand-copy">
          <small>schnick-schnack.info</small>
          <Wordmark />
        </span>
      </a>

      <nav className="primary-nav" aria-label="Hauptnavigation">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              aria-pressed={isActive}
              className={isActive ? "is-active" : ""}
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              type="button"
            >
              <Icon size={19} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-wave" aria-hidden="true">
        <span />
        <span />
      </div>

      <div className="sidebar-bottom">
        <ThemeToggle activeTheme={activeTheme} onThemeChange={onThemeChange} />
        <a className="login-secondary" href={loginHref(activeTheme, activeSection, loginState)}>
          Anmelden
        </a>
        <span className="secure-note">Sicher & verschlüsselt</span>
      </div>
    </aside>
  );
}

function VoiceWave() {
  return (
    <svg className="voice-wave" viewBox="0 0 900 230" aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <linearGradient id="waveGradient" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="rgb(162, 72, 255)" stopOpacity="0" />
          <stop offset="28%" stopColor="rgb(99, 221, 255)" stopOpacity="0.78" />
          <stop offset="55%" stopColor="rgb(77, 255, 214)" stopOpacity="0.88" />
          <stop offset="100%" stopColor="rgb(217, 64, 255)" stopOpacity="0.66" />
        </linearGradient>
        <linearGradient id="waveSoft" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="rgb(145, 72, 255)" stopOpacity="0" />
          <stop offset="45%" stopColor="rgb(85, 185, 255)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="rgb(223, 52, 255)" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <path
        d="M0 136 C130 80 205 168 320 112 C430 58 520 82 606 54 C715 16 780 92 900 88"
        fill="none"
        stroke="url(#waveGradient)"
        strokeWidth="6"
      />
      <path
        d="M0 156 C150 108 230 186 360 136 C488 88 555 130 670 70 C782 14 808 170 900 128"
        fill="none"
        stroke="url(#waveSoft)"
        strokeLinecap="round"
        strokeWidth="42"
      />
      {Array.from({ length: 66 }).map((_, index) => (
        <circle
          cx={40 + index * 13}
          cy={70 + Math.sin(index * 0.34) * 42 + Math.cos(index * 0.11) * 24}
          fill="rgb(105, 240, 255)"
          fillOpacity={0.1 + (index % 6) * 0.035}
          key={index}
          r={1.4}
        />
      ))}
    </svg>
  );
}

function TopBar({
  activeSection,
  activeTheme,
  loginState,
  onlineCount,
  serviceCount,
  onStatusClick
}: {
  activeSection: NavSection;
  activeTheme: ThemeId;
  loginState: LoginState | null;
  onlineCount: number;
  serviceCount: number;
  onStatusClick: () => void;
}) {
  return (
    <header className="top-actions">
      <span className="system-online-pill">
        <span aria-hidden="true" />
        {onlineCount} / {serviceCount || 0} Systeme online
      </span>
      <button className="system-status-button" onClick={onStatusClick} type="button">
        <SlidersHorizontal size={17} aria-hidden="true" />
        Status ansehen
      </button>
      <a className="login-primary" href={loginHref(activeTheme, activeSection, loginState)}>
        <UserRound size={19} aria-hidden="true" />
        Anmelden
      </a>
    </header>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const width = 112;
  const height = 46;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const path = points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * width;
      const y = height - ((point - min) / Math.max(1, max - min)) * (height - 10) - 5;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} fill="none" pathLength={100} />
    </svg>
  );
}

function SystemRow({
  activeSection,
  loginState,
  onRequestRole,
  pendingRoleRequest,
  roleRequests,
  service,
  serviceInfo,
  theme,
  userAccess
}: {
  activeSection: NavSection;
  loginState: LoginState | null;
  onRequestRole: (service: PublicService) => void;
  pendingRoleRequest: boolean;
  roleRequests: RoleRequest[];
  service: PublicService;
  serviceInfo: ServiceInfoResult | undefined;
  theme: ThemeId;
  userAccess: UserAccess;
}) {
  const Icon = iconMap[service.icon];
  const metric = serviceInfo?.data?.metrics?.[0];
  const points = chartPoints(serviceInfo);
  const responseText = service.responseMs !== null ? `Antwort ${service.responseMs} ms` : service.message;
  const canOpen = Boolean(service.href) && hasServiceRole(service, userAccess);
  const roleRequest = requestedRoleFor(service, roleRequests);

  return (
    <article className={`system-row system-row--${rowTone(service)}`} aria-label={`${service.name} System`}>
      <div className="system-row__icon" aria-hidden="true">
        <Icon size={27} strokeWidth={2.1} />
      </div>
      <div className="system-row__copy">
        <div>
          <h3>{service.name}</h3>
          <StatusPill state={service.state} />
        </div>
        <p>{service.description}</p>
        <span>
          {metric ? metricLabel(metric) : responseText}
          <b aria-hidden="true">•</b>
          {accessLabel(service, userAccess)}
        </span>
      </div>
      <div className="system-row__api">
        <small>Zugriff</small>
        <strong>{accessLabel(service, userAccess)}</strong>
      </div>
      {points ? <Sparkline points={points} /> : <span className="sparkline-empty">Keine Chartdaten</span>}
      {canOpen && service.href ? (
        <a className="open-link" href={withThemeParam(service.href, theme)}>
          Öffnen
          <ArrowUpRight size={17} aria-hidden="true" />
        </a>
      ) : service.href && userAccess.hasRoleInfo && roleRequest ? (
        <span className="open-link open-link--disabled">Rolle angefragt</span>
      ) : service.href && userAccess.hasRoleInfo ? (
        <button className="open-link open-link--request" disabled={pendingRoleRequest} onClick={() => onRequestRole(service)} type="button">
          {pendingRoleRequest ? "Wird angefragt" : "Rolle anfragen"}
        </button>
      ) : service.href ? (
        <a className="open-link" href={loginHref(theme, activeSection, loginState)}>
          Anmelden
        </a>
      ) : (
        <span className="open-link open-link--disabled">{service.unavailableActionLabel ?? "Geplant"}</span>
      )}
    </article>
  );
}

function SystemsPanel({
  activeSection,
  loginState,
  onRequestRole,
  pendingRoleRequestId,
  roleRequests,
  services,
  serviceInfoById,
  theme,
  userAccess,
  onShowAll,
  showAllButton = true
}: {
  activeSection: NavSection;
  loginState: LoginState | null;
  onRequestRole: (service: PublicService) => void;
  pendingRoleRequestId: string | null;
  roleRequests: RoleRequest[];
  services: PublicService[];
  serviceInfoById: Map<string, ServiceInfoResult>;
  theme: ThemeId;
  userAccess: UserAccess;
  onShowAll: () => void;
  showAllButton?: boolean;
}) {
  return (
    <section className="systems-panel" aria-labelledby="systems-title">
      <div className="section-heading">
        <span>Laufende Systeme</span>
        <h2 id="systems-title">Verfügbare Dienste</h2>
      </div>
      <div className="system-list">
        {services.length ? (
          services.map((service) => (
            <SystemRow
              key={service.id}
              activeSection={activeSection}
              loginState={loginState}
              onRequestRole={onRequestRole}
              pendingRoleRequest={pendingRoleRequestId === service.id}
              roleRequests={roleRequests}
              service={service}
              serviceInfo={serviceInfoById.get(service.id)}
              theme={theme}
              userAccess={userAccess}
            />
          ))
        ) : (
          <div className="panel-empty">Noch keine öffentlichen Dienste geladen.</div>
        )}
      </div>
      {showAllButton ? (
        <button className="show-all-button" onClick={onShowAll} type="button">
          <SlidersHorizontal size={15} aria-hidden="true" />
          Alle Systeme anzeigen
        </button>
      ) : null}
    </section>
  );
}

function NewsPanel({
  updates
}: {
  updates: PublicUpdate[];
}) {
  const [feature, ...items] = updates;

  return (
    <section className="news-panel" aria-labelledby="news-title">
      <div className="section-heading">
        <span>Neuigkeiten</span>
        <h2 id="news-title">Öffentliche Updates</h2>
      </div>
      {feature ? (
        <div className="news-layout">
          <article className="feature-news">
            <span className="news-badge">{feature.serviceId}</span>
            <time dateTime={feature.date}>{formatDate(feature.date)}</time>
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
            {feature.href ? (
              <a href={feature.href}>
                Öffnen
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            ) : null}
          </article>
          <div className="news-list">
            {items.slice(0, 3).map((item) => (
              <article className="news-item" key={item.id}>
                <span className="news-item__icon" aria-hidden="true">
                  <FileText size={22} />
                </span>
                <div>
                  <time dateTime={item.date}>{formatDate(item.date)}</time>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
                {item.href ? <ArrowUpRight size={17} aria-hidden="true" /> : null}
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="news-empty">
          <FileText size={24} aria-hidden="true" />
          <h3>Keine öffentlichen News verfügbar</h3>
          <p>Dieser Bereich bleibt leer, bis ein Dienst freigegebene Updates über die Service-Info-API liefert.</p>
        </div>
      )}
    </section>
  );
}

function GlobalChat({
  feed,
  serviceHref,
  theme
}: {
  feed: ServiceFeed | undefined;
  serviceHref: string | null;
  theme: ThemeId;
}) {
  const messages = feed?.items ?? [];
  const chatHref = feed?.href ?? serviceHref;

  return (
    <section className="global-chat" aria-labelledby="global-chat-title">
      <div className="chat-header">
        <div>
          <span>Globaler Chat</span>
          <h2 id="global-chat-title">{feed?.title ?? "Chat-Channel"}</h2>
          <small>{messages.length ? `${messages.length} Nachrichten geladen` : "Keine Nachrichten geladen"}</small>
        </div>
      </div>
      <div className="message-list">
        {messages.length ? (
          messages.map((message) => (
            <article className="chat-message" key={message.id}>
              <span className="chat-avatar chat-avatar--live" aria-hidden="true">
                {message.author
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)}
              </span>
              <div>
                <header>
                  <strong>{message.author}</strong>
                  <time dateTime={message.createdAt}>{formatFeedTime(message.createdAt)}</time>
                </header>
                <p>{message.text}</p>
              </div>
            </article>
          ))
        ) : (
          <div className="chat-empty">
            <Slack size={24} aria-hidden="true" />
            <h3>Keine freigegebenen Chat-Nachrichten</h3>
            <p>Der Bereich zeigt erst Nachrichten, wenn die Rocket.Chat-Brücke echte Channel-Daten liefert.</p>
          </div>
        )}
      </div>
      <div className="chat-footer">
        {chatHref ? (
          <a className="chat-open" href={withThemeParam(chatHref, theme)}>
            Im Chat öffnen
            <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        ) : (
          <span className="chat-open chat-open--disabled">Chat-Link nicht verfügbar</span>
        )}
      </div>
    </section>
  );
}

function SystemStatusPanel({
  serviceInfo,
  snapshot
}: {
  serviceInfo: ServiceInfoSnapshot | null;
  snapshot: HealthSnapshot | null;
}) {
  const services = snapshot?.services ?? [];
  const activeServices = services.filter((service) => service.state !== "planned");
  const onlineCount = activeServices.filter((service) => service.state === "online").length;
  const averageResponseMs = averageResponse(activeServices);
  const infoServices = serviceInfo?.services ?? [];
  const infoAvailable = infoServices.filter((service) => service.status === "available").length;
  const statusChart = firstStatusChart(serviceInfo);
  const chartValues = statusChart?.points.map((point) => point.value).slice(-76) ?? [];
  const maxChartValue = Math.max(1, ...chartValues);

  return (
    <section className="status-dashboard" aria-labelledby="system-status-title">
      <div className="section-heading">
        <span>Systemstatus</span>
        <h2 id="system-status-title">{overallLabels[snapshot?.overall ?? "checking"]}</h2>
      </div>
      <div className="status-metrics">
        <div><strong>{onlineCount}/{activeServices.length || services.length || 0}</strong><span>Online</span></div>
        <div><strong>{averageResponseMs !== null ? `${averageResponseMs} ms` : "n/a"}</strong><span>Ø Antwort</span></div>
        <div><strong>{infoAvailable}/{infoServices.length || services.length || 0}</strong><span>Info APIs</span></div>
        <div><strong>{formatTime(snapshot?.generatedAt ?? null)}</strong><span>Update</span></div>
      </div>
      {chartValues.length ? (
        <div className="status-bars" aria-label={statusChart?.title ?? "Service-Info Diagramm"}>
          {chartValues.map((height, index) => (
            <span
              key={`${height}-${index}`}
              style={{ "--bar-height": `${Math.max(10, Math.round((height / maxChartValue) * 100))}%` } as React.CSSProperties}
            />
          ))}
        </div>
      ) : (
        <div className="status-bars-empty">Keine Diagrammdaten aus Service-Info verfügbar.</div>
      )}
      <div className="status-updated">
        Letzte Aktualisierung: {formatTime(snapshot?.generatedAt ?? null)}
        <RefreshCw size={14} aria-hidden="true" />
      </div>
    </section>
  );
}

function PageHeader({
  eyebrow,
  title
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="page-header" aria-labelledby={`page-${title.toLowerCase()}-title`}>
      <VoiceWave />
      <div>
        <span>{eyebrow}</span>
        <h1 id={`page-${title.toLowerCase()}-title`}>{title}</h1>
      </div>
    </section>
  );
}

function OverviewMetrics({
  buildInfo,
  feed,
  serviceInfo,
  snapshot
}: {
  buildInfo: BuildInfo | null;
  feed: ServiceFeed | undefined;
  serviceInfo: ServiceInfoSnapshot | null;
  snapshot: HealthSnapshot | null;
}) {
  const services = snapshot?.services ?? [];
  const activeServices = services.filter((service) => service.state !== "planned");
  const onlineCount = activeServices.filter((service) => service.state === "online").length;
  const infoServices = serviceInfo?.services ?? [];
  const infoAvailable = serviceMetricValue(infoServices, "available");
  const averageResponseMs = averageResponse(activeServices);

  return (
    <section className="overview-metrics" aria-label="Live Kennzahlen">
      <div><strong>{onlineCount}/{activeServices.length || services.length || 0}</strong><span>Systeme online</span></div>
      <div><strong>{averageResponseMs !== null ? `${averageResponseMs} ms` : "n/a"}</strong><span>Ø Antwort</span></div>
      <div><strong>{infoAvailable}/{infoServices.length || services.length || 0}</strong><span>Info APIs</span></div>
      <div><strong>{feed?.items.length ?? 0}</strong><span>Chat-Nachrichten</span></div>
      <div className="overview-metrics__build"><strong>{formatDateTime(buildInfo?.builtAt)}</strong><span>Letzter Build</span></div>
    </section>
  );
}

function MetricGrid({ metrics }: { metrics: ServiceMetric[] }) {
  return (
    <div className="detail-metric-grid" aria-label="Service-Metriken">
      {metrics.map((metric) => (
        <div key={metric.id}>
          <span>{metric.label}</span>
          <strong>{metricValue(metric)}</strong>
        </div>
      ))}
    </div>
  );
}

function ChartPreview({ chart }: { chart: ServiceChart }) {
  const values = chart.points.slice(-24);
  const maxValue = Math.max(1, ...values.map((point) => point.value));

  return (
    <div className="detail-chart" aria-label={chart.title}>
      <header>
        <span>{chart.title}</span>
        {chart.unit ? <small>{chart.unit}</small> : null}
      </header>
      <div>
        {values.map((point, index) => (
          <span
            key={`${point.label}-${index}`}
            title={`${point.label}: ${point.value}${chart.unit ?? ""}`}
            style={{ "--bar-height": `${Math.max(8, Math.round((point.value / maxValue) * 100))}%` } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}

function SystemDetailCard({
  activeSection,
  loginState,
  onRequestRole,
  pendingRoleRequest,
  roleRequests,
  service,
  serviceInfo,
  theme,
  userAccess
}: {
  activeSection: NavSection;
  loginState: LoginState | null;
  onRequestRole: (service: PublicService) => void;
  pendingRoleRequest: boolean;
  roleRequests: RoleRequest[];
  service: PublicService;
  serviceInfo: ServiceInfoResult | undefined;
  theme: ThemeId;
  userAccess: UserAccess;
}) {
  const Icon = iconMap[service.icon];
  const data = serviceInfo?.data;
  const metrics = data?.metrics ?? [];
  const charts = data?.charts ?? [];
  const sections = data?.sections ?? [];
  const actions = data?.actions ?? [];
  const canOpen = hasServiceRole(service, userAccess);
  const roleRequest = requestedRoleFor(service, roleRequests);

  return (
    <article className={`system-detail-card system-row--${rowTone(service)}`}>
      <header>
        <div className="system-row__icon" aria-hidden="true">
          <Icon size={25} strokeWidth={2.1} />
        </div>
        <div>
          <h3>{service.name}</h3>
          <p>{data?.summary ?? service.description}</p>
        </div>
        <StatusPill state={service.state} />
      </header>

      <dl className="service-facts">
        <div><dt>Health</dt><dd>{service.message}</dd></div>
        <div><dt>Antwort</dt><dd>{service.responseMs !== null ? `${service.responseMs} ms` : "n/a"}</dd></div>
        <div><dt>Update</dt><dd>{formatTime(service.updatedAt)}</dd></div>
        <div><dt>Rolle</dt><dd>{service.requiredRole ?? "Öffentlich"}</dd></div>
        <div><dt>Zugriff</dt><dd>{roleRequest ? "Rolle angefragt" : accessLabel(service, userAccess)}</dd></div>
      </dl>

      {metrics.length ? <MetricGrid metrics={metrics} /> : <p className="detail-empty">Keine öffentlichen Metriken geliefert.</p>}
      {charts.length ? charts.slice(0, 2).map((chart) => <ChartPreview chart={chart} key={chart.id} />) : null}
      {sections.length ? (
        <div className="detail-sections">
          {sections.slice(0, 2).map((section) => (
            <section key={section.id}>
              <h4>{section.title}</h4>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      ) : null}

      <div className="detail-actions">
        {actions.length && canOpen ? (
          actions.map((action) => (
            <a href={withThemeParam(action.href, theme)} key={action.id}>
              {action.label}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          ))
        ) : service.href && canOpen ? (
          <a href={withThemeParam(service.href, theme)}>
            Dienst öffnen
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        ) : service.href && userAccess.hasRoleInfo && roleRequest ? (
          <span>Rolle angefragt</span>
        ) : service.href && userAccess.hasRoleInfo ? (
          <button disabled={pendingRoleRequest} onClick={() => onRequestRole(service)} type="button">
            {pendingRoleRequest ? "Wird angefragt" : "Rolle anfragen"}
          </button>
        ) : service.href ? (
          <a href={loginHref(theme, activeSection, loginState)}>Anmelden</a>
        ) : (
          <span>Kein öffentlicher Link verfügbar</span>
        )}
      </div>
    </article>
  );
}

function OverviewView({
  activeSection,
  buildInfo,
  feed,
  loginState,
  onRequestRole,
  pendingRoleRequestId,
  roleRequests,
  serviceInfo,
  serviceInfoById,
  services,
  snapshot,
  theme,
  userAccess,
  updates,
  onShowSystems
}: {
  activeSection: NavSection;
  buildInfo: BuildInfo | null;
  feed: ServiceFeed | undefined;
  loginState: LoginState | null;
  onRequestRole: (service: PublicService) => void;
  pendingRoleRequestId: string | null;
  roleRequests: RoleRequest[];
  serviceInfo: ServiceInfoSnapshot | null;
  serviceInfoById: Map<string, ServiceInfoResult>;
  services: PublicService[];
  snapshot: HealthSnapshot | null;
  theme: ThemeId;
  userAccess: UserAccess;
  updates: PublicUpdate[];
  onShowSystems: () => void;
}) {
  return (
    <div className="page-view">
      <PageHeader eyebrow="Cockpit" title="Übersicht" />
      <OverviewMetrics buildInfo={buildInfo} feed={feed} serviceInfo={serviceInfo} snapshot={snapshot} />
      <SystemsPanel
        activeSection={activeSection}
        loginState={loginState}
        onRequestRole={onRequestRole}
        pendingRoleRequestId={pendingRoleRequestId}
        roleRequests={roleRequests}
        services={services}
        serviceInfoById={serviceInfoById}
        theme={theme}
        userAccess={userAccess}
        onShowAll={onShowSystems}
        showAllButton={false}
      />
      <NewsPanel updates={updates} />
    </div>
  );
}

function SystemsView({
  activeSection,
  loginState,
  onRequestRole,
  pendingRoleRequestId,
  roleRequests,
  serviceInfoById,
  services,
  theme,
  userAccess
}: {
  activeSection: NavSection;
  loginState: LoginState | null;
  onRequestRole: (service: PublicService) => void;
  pendingRoleRequestId: string | null;
  roleRequests: RoleRequest[];
  serviceInfoById: Map<string, ServiceInfoResult>;
  services: PublicService[];
  theme: ThemeId;
  userAccess: UserAccess;
}) {
  return (
    <div className="page-view">
      <PageHeader eyebrow="Dienste" title="Systeme" />
      <section className="page-panel">
        <div className="section-heading">
          <span>Health & Service Info</span>
          <h2>Öffentliche Systemdetails</h2>
        </div>
        <div className="system-detail-grid">
          {services.length ? (
            services.map((service) => (
              <SystemDetailCard
                key={service.id}
                activeSection={activeSection}
                loginState={loginState}
                onRequestRole={onRequestRole}
                pendingRoleRequest={pendingRoleRequestId === service.id}
                roleRequests={roleRequests}
                service={service}
                serviceInfo={serviceInfoById.get(service.id)}
                theme={theme}
                userAccess={userAccess}
              />
            ))
          ) : (
            <div className="panel-empty">Noch keine öffentlichen Dienste geladen.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function ChannelsView({
  feed,
  serviceHref,
  theme
}: {
  feed: ServiceFeed | undefined;
  serviceHref: string | null;
  theme: ThemeId;
}) {
  return (
    <div className="page-view">
      <PageHeader eyebrow="Kommunikation" title="Kanäle" />
      <section className="page-panel page-panel--full">
        <div className="section-heading">
          <span>Rocket.Chat Bridge</span>
          <h2>{feed?.title ?? "Chat-Channel"}</h2>
        </div>
        <div className="channel-layout">
          <GlobalChat feed={feed} serviceHref={serviceHref} theme={theme} />
          <div className="channel-meta">
            <div><span>Quelle</span><strong>{feed ? "Rocket.Chat API" : "Nicht verbunden"}</strong></div>
            <div><span>Nachrichten</span><strong>{feed?.items.length ?? 0}</strong></div>
            <div><span>Letzte Nachricht</span><strong>{feed?.items[0] ? formatFeedTime(feed.items[0].createdAt) : "n/a"}</strong></div>
            <div><span>Channel-Link</span><strong>{feed?.href || serviceHref ? "Verfügbar" : "Fehlt"}</strong></div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusServiceGrid({
  serviceInfoById,
  services
}: {
  serviceInfoById: Map<string, ServiceInfoResult>;
  services: PublicService[];
}) {
  return (
    <section className="page-panel">
      <div className="section-heading">
        <span>Statusmatrix</span>
        <h2>Checks pro Dienst</h2>
      </div>
      <div className="status-service-grid">
        {services.map((service) => {
          const info = serviceInfoById.get(service.id);
          return (
            <article key={service.id}>
              <header>
                <h3>{service.name}</h3>
                <StatusPill state={service.state} />
              </header>
              <dl className="service-facts">
                <div><dt>Health</dt><dd>{service.message}</dd></div>
                <div><dt>Antwort</dt><dd>{service.responseMs !== null ? `${service.responseMs} ms` : "n/a"}</dd></div>
                <div><dt>Info API</dt><dd>{infoStateLabels[info?.status ?? service.infoState]}</dd></div>
                <div><dt>Info Antwort</dt><dd>{info?.responseMs !== null && info?.responseMs !== undefined ? `${info.responseMs} ms` : "n/a"}</dd></div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StatusView({
  serviceInfo,
  serviceInfoById,
  services,
  snapshot
}: {
  serviceInfo: ServiceInfoSnapshot | null;
  serviceInfoById: Map<string, ServiceInfoResult>;
  services: PublicService[];
  snapshot: HealthSnapshot | null;
}) {
  return (
    <div className="page-view">
      <PageHeader eyebrow="Betrieb" title="Status" />
      <SystemStatusPanel serviceInfo={serviceInfo} snapshot={snapshot} />
      <StatusServiceGrid serviceInfoById={serviceInfoById} services={services} />
    </div>
  );
}

function NewsView({ updates }: { updates: PublicUpdate[] }) {
  return (
    <div className="page-view">
      <PageHeader eyebrow="Updates" title="News" />
      <section className="page-panel">
        <div className="section-heading">
          <span>Module und Merge Requests</span>
          <h2>Was gerade passiert</h2>
        </div>
        {updates.length ? (
          <div className="news-archive">
            {updates.map((update) => (
              <article key={update.id}>
                <span className="news-badge">{update.serviceId}</span>
                <time dateTime={update.date}>{formatDate(update.date)}</time>
                <h3>{update.title}</h3>
                <p>{update.text}</p>
                {update.href ? (
                  <a href={update.href}>
                    Öffnen
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="news-empty">
            <FileText size={24} aria-hidden="true" />
            <h3>Keine öffentlichen News verfügbar</h3>
            <p>Dieser Bereich bleibt leer, bis ein Dienst freigegebene Updates über die Service-Info-API liefert.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function AdminSection({
  history,
  moduleNews,
  roleRequests
}: {
  history: MonitoringHistorySnapshot | null;
  moduleNews: ModuleNews[];
  roleRequests: RoleRequest[];
}) {
  const historyServices = Array.isArray(history?.services) ? history.services : [];
  const visibleRoleRequests = Array.isArray(roleRequests) ? roleRequests : [];
  const visibleModuleNews = Array.isArray(moduleNews) ? moduleNews : [];

  return (
    <section className="content-section admin-section" aria-labelledby="admin-heading">
      <div className="section-heading">
        <span className="eyebrow">Admin</span>
        <h2 id="admin-heading">Adminbereich</h2>
        <p>Monitoring, Rollenfreigaben und automatisch veröffentlichte Modulmeldungen.</p>
      </div>
      <div className="admin-grid">
        <article className="admin-panel">
          <h3>Monitoring-Verlauf</h3>
          {historyServices.slice(0, 6).map((service) => {
            const samples = Array.isArray(service.samples) ? service.samples : [];
            const incidents = Array.isArray(service.incidents) ? service.incidents : [];
            return (
              <div className="history-row" key={service.serviceId}>
                <strong>{service.serviceId}</strong>
                <span>{samples.length} Messpunkte</span>
                <span>{incidents.length} Auffälligkeiten</span>
              </div>
            );
          })}
        </article>
        <article className="admin-panel">
          <h3>Berechtigungsanfragen</h3>
          {visibleRoleRequests.slice(0, 8).map((request) => (
            <div className="request-row" key={request.id ?? `${request.serviceId}-${request.role}`}>
              <strong>{request.serviceName}</strong>
              <span>{request.requester ?? "Öffentlich"}</span>
              <StatusPill state={roleRequestState(request)} />
            </div>
          ))}
        </article>
        <article className="admin-panel">
          <h3>Modulnews</h3>
          {visibleModuleNews.slice(0, 8).map((item) => (
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

function ActivePage({
  activeSection,
  buildInfo,
  feed,
  loginState,
  onRequestRole,
  pendingRoleRequestId,
  roleRequests,
  serviceHref,
  serviceInfo,
  serviceInfoById,
  services,
  snapshot,
  theme,
  userAccess,
  updates,
  onShowSystems
}: {
  activeSection: NavSection;
  buildInfo: BuildInfo | null;
  feed: ServiceFeed | undefined;
  loginState: LoginState | null;
  onRequestRole: (service: PublicService) => void;
  pendingRoleRequestId: string | null;
  roleRequests: RoleRequest[];
  serviceHref: string | null;
  serviceInfo: ServiceInfoSnapshot | null;
  serviceInfoById: Map<string, ServiceInfoResult>;
  services: PublicService[];
  snapshot: HealthSnapshot | null;
  theme: ThemeId;
  userAccess: UserAccess;
  updates: PublicUpdate[];
  onShowSystems: () => void;
}) {
  switch (activeSection) {
    case "channels":
      return <ChannelsView feed={feed} serviceHref={serviceHref} theme={theme} />;
    case "news":
      return <NewsView updates={updates} />;
    case "status":
      return <StatusView serviceInfo={serviceInfo} serviceInfoById={serviceInfoById} services={services} snapshot={snapshot} />;
    case "systems":
      return (
        <SystemsView
          activeSection={activeSection}
          loginState={loginState}
          onRequestRole={onRequestRole}
          pendingRoleRequestId={pendingRoleRequestId}
          roleRequests={roleRequests}
          serviceInfoById={serviceInfoById}
          services={services}
          theme={theme}
          userAccess={userAccess}
        />
      );
    case "overview":
    default:
      return (
        <OverviewView
          activeSection={activeSection}
          feed={feed}
          buildInfo={buildInfo}
          loginState={loginState}
          onRequestRole={onRequestRole}
          pendingRoleRequestId={pendingRoleRequestId}
          roleRequests={roleRequests}
          serviceInfo={serviceInfo}
          serviceInfoById={serviceInfoById}
          services={services}
          snapshot={snapshot}
          theme={theme}
          userAccess={userAccess}
          updates={updates}
          onShowSystems={onShowSystems}
        />
      );
  }
}

function MobilePage({
  activeSection,
  buildInfo,
  feed,
  loginState,
  onRequestRole,
  pendingRoleRequestId,
  roleRequests,
  serviceHref,
  serviceInfo,
  serviceInfoById,
  services,
  snapshot,
  theme,
  userAccess,
  updates,
  onShowSystems
}: {
  activeSection: NavSection;
  buildInfo: BuildInfo | null;
  feed: ServiceFeed | undefined;
  loginState: LoginState | null;
  onRequestRole: (service: PublicService) => void;
  pendingRoleRequestId: string | null;
  roleRequests: RoleRequest[];
  serviceHref: string | null;
  serviceInfo: ServiceInfoSnapshot | null;
  serviceInfoById: Map<string, ServiceInfoResult>;
  services: PublicService[];
  snapshot: HealthSnapshot | null;
  theme: ThemeId;
  userAccess: UserAccess;
  updates: PublicUpdate[];
  onShowSystems: () => void;
}) {
  return (
    <div className="page-view page-view--mobile">
      <OverviewMetrics buildInfo={buildInfo} feed={feed} serviceInfo={serviceInfo} snapshot={snapshot} />
      <SystemsPanel
        activeSection={activeSection}
        loginState={loginState}
        onRequestRole={onRequestRole}
        pendingRoleRequestId={pendingRoleRequestId}
        roleRequests={roleRequests}
        services={services}
        serviceInfoById={serviceInfoById}
        theme={theme}
        userAccess={userAccess}
        onShowAll={onShowSystems}
      />
      <GlobalChat feed={feed} serviceHref={serviceHref} theme={theme} />
      <SystemStatusPanel serviceInfo={serviceInfo} snapshot={snapshot} />
      <NewsPanel updates={updates} />
    </div>
  );
}

function App() {
  const { snapshot, socketState } = useHealth();
  const buildInfo = useBuildInfo();
  const serviceInfo = useServiceInfo();
  const updates = usePublicUpdates();
  const isMobile = useIsMobile();
  const [activeTheme, setActiveTheme] = useState<ThemeId>(() => applyInitialTheme());
  const [activeSection, setActiveSection] = useState<NavSection>(() => initialSection());
  const [loginState] = useState<LoginState | null>(() => readLoginState());
  const [userAccess] = useState<UserAccess>(() => readUserAccess());
  const adminViewEnabled = activeSection === "admin" && hasAdminRole(userAccess);
  const monitoringHistory = useMonitoringHistory(adminViewEnabled);
  const moduleNews = useModuleNews(adminViewEnabled);
  const roleRequestState = useRoleRequests();
  const adminRoleRequests = useAdminRoleRequests(adminViewEnabled, userAccess, loginState);

  const services = snapshot?.services ?? [];
  const activeServices = services.filter((service) => service.state !== "planned");
  const visibleServices = services;
  const serviceInfoById = useMemo(
    () => new Map((serviceInfo?.services ?? []).map((service) => [service.serviceId, service])),
    [serviceInfo]
  );
  const slackService = visibleServices.find((service) => service.id === "slack");
  const slackFeed = serviceInfoById.get("slack")?.data?.feeds?.[0];
  const onlineCount = activeServices.filter((service) => service.state === "online").length;

  function requestRole(service: PublicService) {
    void roleRequestState.requestRole(service, requesterLabel(loginState));
  }

  function changeTheme(theme: ThemeId) {
    const update = () => {
      setActiveTheme(theme);
      applyTheme(theme);
      window.history.replaceState(null, "", returnUrl(theme, activeSection));
    };

    const viewTransitionDocument = document as ViewTransitionDocument;
    if (viewTransitionDocument.startViewTransition && !prefersReducedMotion()) {
      viewTransitionDocument.startViewTransition(update);
      return;
    }

    update();
  }

  function selectSection(section: NavSection) {
    setActiveSection(section);
    window.history.replaceState(null, "", returnUrl(activeTheme, section));
  }

  useEffect(() => {
    let frame = 0;
    const trackPointerGlow = (event: PointerEvent) => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        document.documentElement.style.setProperty("--mx", `${event.clientX}px`);
        document.documentElement.style.setProperty("--my", `${event.clientY}px`);
      });
    };

    window.addEventListener("pointermove", trackPointerGlow);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", trackPointerGlow);
    };
  }, []);

  return (
    <div className="openvoice-shell">
      <Sidebar
        activeSection={activeSection}
        activeTheme={activeTheme}
        loginState={loginState}
        onSectionChange={selectSection}
        onThemeChange={changeTheme}
        userAccess={userAccess}
      />

      <main className="voice-main">
        <TopBar
          activeSection={activeSection}
          activeTheme={activeTheme}
          loginState={loginState}
          onlineCount={onlineCount}
          serviceCount={activeServices.length || visibleServices.length}
          onStatusClick={() => selectSection("status")}
        />
        {adminViewEnabled ? (
          <AdminSection
            history={monitoringHistory}
            moduleNews={moduleNews}
            roleRequests={adminRoleRequests}
          />
        ) : isMobile ? (
          <MobilePage
            activeSection={activeSection}
            buildInfo={buildInfo}
            feed={slackFeed}
            loginState={loginState}
            onRequestRole={requestRole}
            pendingRoleRequestId={roleRequestState.pendingServiceId}
            roleRequests={roleRequestState.requests}
            serviceHref={slackService?.href ?? null}
            serviceInfo={serviceInfo}
            serviceInfoById={serviceInfoById}
            services={visibleServices}
            snapshot={snapshot}
            theme={activeTheme}
            userAccess={userAccess}
            updates={updates}
            onShowSystems={() => selectSection("systems")}
          />
        ) : (
          <ActivePage
            activeSection={activeSection}
            buildInfo={buildInfo}
            feed={slackFeed}
            loginState={loginState}
            onRequestRole={requestRole}
            pendingRoleRequestId={roleRequestState.pendingServiceId}
            roleRequests={roleRequestState.requests}
            serviceHref={slackService?.href ?? null}
            serviceInfo={serviceInfo}
            serviceInfoById={serviceInfoById}
            services={visibleServices}
            snapshot={snapshot}
            theme={activeTheme}
            userAccess={userAccess}
            updates={updates}
            onShowSystems={() => selectSection("systems")}
          />
        )}
      </main>

      {!isMobile ? (
        <aside className="voice-rail" aria-label="Kommunikation und Status">
          <GlobalChat
            feed={slackFeed}
            serviceHref={slackService?.href ?? null}
            theme={activeTheme}
          />
          <SystemStatusPanel
            serviceInfo={serviceInfo}
            snapshot={snapshot}
          />
        </aside>
      ) : null}

      <span className={`socket-state socket-state--${socketState}`} aria-live="polite">
        {socketState === "live" ? "Live" : "Fallback"}
      </span>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
