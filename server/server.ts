import express from "express";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

type ServiceState = "online" | "degraded" | "offline" | "checking" | "planned";
type ServiceCategory = "communication" | "identity" | "development" | "ai" | "roadmap";

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

type HealthTarget = {
  id: string;
  name: string;
  category: ServiceCategory;
  icon: PublicService["icon"];
  href: string | null;
  unavailableActionLabel?: string;
  requiredRole?: string;
  description: string;
  url?: string;
  okStatuses?: number[];
  timeoutMs?: number;
  infoUrl?: string | null;
};

type HealthSnapshot = {
  generatedAt: string;
  overall: Exclude<ServiceState, "planned">;
  services: PublicService[];
};

type BuildInfo = {
  builtAt: string | null;
};

type ServiceInfoState = "checking" | "available" | "unsupported" | "error" | "planned";

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
  points: Array<{
    label: string;
    value: number;
  }>;
};

type ServiceAction = {
  id: string;
  label: string;
  href: string;
  kind?: "primary" | "secondary" | "danger";
};

type ServiceSection = {
  id: string;
  title: string;
  body: string;
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
  sections?: ServiceSection[];
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

type PublicUpdate = {
  id: string;
  serviceId: string;
  date: string;
  title: string;
  text: string;
  href?: string;
};

type UpdateSnapshot = {
  generatedAt: string;
  updates: PublicUpdate[];
};

type GitLabMergeRequest = {
  project_id?: number;
  iid?: number;
  state?: string;
  title?: string;
  web_url?: string;
  updated_at?: string;
  merged_at?: string | null;
  created_at?: string;
  changes_count?: string | number | null;
  references?: {
    full?: string;
    relative?: string;
    short?: string;
  };
};

const DEFAULT_TIMEOUT_MS = 4500;
const INFO_TIMEOUT_MS = Number.parseInt(process.env.INFO_TIMEOUT_MS ?? "3500", 10);
const HEALTH_INTERVAL_MS = Number.parseInt(process.env.HEALTH_INTERVAL_MS ?? "10000", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT ?? "8080", 10);
const SERVICE_INFO_PATH = "/.well-known/schnick-schnack/service-info.json";
const GITLAB_BASE_URL = process.env.GITLAB_BASE_URL ?? "https://labs.schnick-schnack.info";
const GITLAB_GROUP_PATH = process.env.GITLAB_GROUP_PATH ?? "schnick-schnack";
const GITLAB_TOKEN = optionalEnv("GITLAB_TOKEN") ?? optionalEnv("GITLAB_ACCESS_TOKEN") ?? optionalEnv("GLAB_TOKEN");
const GITLAB_UPDATES_LOOKBACK_HOURS = Math.max(
  1,
  Number.parseInt(process.env.GITLAB_UPDATES_LOOKBACK_HOURS ?? "48", 10) || 48
);
const GITLAB_UPDATES_CACHE_MS = Math.max(
  30000,
  Number.parseInt(process.env.GITLAB_UPDATES_CACHE_MS ?? "300000", 10) || 300000
);
const GITLAB_UPDATES_LIMIT = Math.min(100, Math.max(1, Number.parseInt(process.env.GITLAB_UPDATES_LIMIT ?? "80", 10) || 80));
const ROCKET_CHAT_URL = process.env.ROCKET_CHAT_URL ?? "https://slack.schnick-schnack.info";
const ROCKET_CHAT_CHANNEL = process.env.ROCKET_CHAT_CHANNEL ?? "landing-feed";
const ROCKET_CHAT_CHANNEL_URL =
  process.env.ROCKET_CHAT_CHANNEL_URL ?? `https://chat.schnick-schnack.info/channel/${ROCKET_CHAT_CHANNEL}`;
const ROCKET_CHAT_MESSAGE_LIMIT = Math.min(
  8,
  Math.max(1, Number.parseInt(process.env.ROCKET_CHAT_MESSAGE_LIMIT ?? "5", 10) || 5)
);

function readBuildInfo(): BuildInfo {
  try {
    const raw = readFileSync(path.resolve("dist", "build-info.json"), "utf8");
    const data = JSON.parse(raw) as Partial<BuildInfo>;
    return {
      builtAt: typeof data.builtAt === "string" ? data.builtAt : null
    };
  } catch {
    return { builtAt: null };
  }
}

const buildInfo = readBuildInfo();

function defaultInfoUrl(href: string | null): string | null {
  if (!href) {
    return null;
  }

  return new URL(SERVICE_INFO_PATH, href).toString();
}

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

const SCHNACK_TO_TEXT_DEFAULT_URL = "https://stt.schnick-schnack.info";
const SCHNACK_TO_TEXT_URL = optionalEnv("SCHNACK_TO_TEXT_URL") ?? SCHNACK_TO_TEXT_DEFAULT_URL;
const SCHNACK_TO_TEXT_HEALTH_URL = optionalEnv("HEALTH_SCHNACK_TO_TEXT_URL") ?? SCHNACK_TO_TEXT_URL ?? undefined;
const SCHNACK_TO_TEXT_INFO_URL = optionalEnv("INFO_SCHNACK_TO_TEXT_URL") ?? defaultInfoUrl(SCHNACK_TO_TEXT_URL);
const LLM_HUB_URL = optionalEnv("LLM_HUB_URL");
const LLM_HUB_HEALTH_URL = optionalEnv("HEALTH_LLM_HUB_URL") ?? LLM_HUB_URL ?? undefined;
const LLM_HUB_INFO_URL = optionalEnv("INFO_LLM_HUB_URL") ?? defaultInfoUrl(LLM_HUB_URL);

const targets: HealthTarget[] = [
  {
    id: "voice",
    name: "Voice",
    category: "communication",
    icon: "mic",
    href: "https://voice.schnick-schnack.info",
    requiredRole: "voice",
    description: "Geschützter Zugang zur OpenVoice-Oberfläche.",
    url: process.env.HEALTH_VOICE_URL ?? "https://voice.schnick-schnack.info/",
    infoUrl: process.env.INFO_VOICE_URL ?? defaultInfoUrl("https://voice.schnick-schnack.info"),
    okStatuses: [200, 204, 301, 302, 307, 308, 401, 403]
  },
  {
    id: "auth",
    name: "Auth / SSO",
    category: "identity",
    icon: "shield",
    href: "https://auth.schnick-schnack.info",
    requiredRole: "auth",
    description: "Zentrale Anmeldung für Dienste mit Single Sign-on.",
    url:
      process.env.HEALTH_AUTH_URL ??
      "https://auth.schnick-schnack.info/realms/master/.well-known/openid-configuration",
    infoUrl: process.env.INFO_AUTH_URL ?? defaultInfoUrl("https://auth.schnick-schnack.info"),
    okStatuses: [200, 204, 301, 302, 307, 308]
  },
  {
    id: "slack",
    name: "Slack",
    category: "communication",
    icon: "slack",
    href: "https://slack.schnick-schnack.info",
    requiredRole: "slack",
    description: "Team-Kommunikation, Channels und Benachrichtigungen für Betrieb und Projekte.",
    url: process.env.HEALTH_SLACK_URL ?? "https://slack.schnick-schnack.info/",
    infoUrl: process.env.INFO_SLACK_URL ?? defaultInfoUrl("https://slack.schnick-schnack.info"),
    okStatuses: [200, 204, 301, 302, 307, 308, 401, 403]
  },
  {
    id: "schnack-to-text",
    name: "Schnack To Text",
    category: "communication",
    icon: "file-text",
    href: SCHNACK_TO_TEXT_URL,
    requiredRole: "schnack-to-text",
    description: "Audio-Mitschnitt mit Transkription und automatischer Zusammenfassung.",
    url: SCHNACK_TO_TEXT_HEALTH_URL,
    infoUrl: SCHNACK_TO_TEXT_INFO_URL,
    okStatuses: [200, 204, 301, 302, 307, 308, 401, 403]
  },
  {
    id: "llm-hub",
    name: "LLM Hub",
    category: "ai",
    icon: "brain",
    href: LLM_HUB_URL,
    unavailableActionLabel: "Noch nicht in Prod",
    requiredRole: "llm-hub",
    description: "Zentraler Zugang zu LLM-Tools, Modellen und Experimenten.",
    url: LLM_HUB_HEALTH_URL,
    infoUrl: LLM_HUB_INFO_URL,
    okStatuses: [200, 204, 301, 302, 307, 308, 401, 403]
  },
  {
    id: "gitlab",
    name: "GitLab",
    category: "development",
    icon: "gitlab",
    href: "https://labs.schnick-schnack.info/schnick-schnack/landing-page",
    requiredRole: "gitlab",
    description: "Code- und Projektplattform für die schnick-schnack-Projekte.",
    url: process.env.HEALTH_GITLAB_URL ?? "https://labs.schnick-schnack.info/schnick-schnack/landing-page",
    infoUrl: process.env.INFO_GITLAB_URL ?? defaultInfoUrl("https://labs.schnick-schnack.info"),
    okStatuses: [200, 204, 301, 302, 307, 308, 401, 403]
  }
];

let latestServiceInfo: Record<string, ServiceInfoResult> = Object.fromEntries(
  targets.map((target) => [
    target.id,
    {
      serviceId: target.id,
      status: target.infoUrl ? "checking" : target.url ? "unsupported" : "planned",
      message: target.infoUrl ? "Service-Info wird geprüft." : target.url ? "Service-Info-API nicht konfiguriert." : "Geplant.",
      updatedAt: null,
      responseMs: null,
      data: null
    } satisfies ServiceInfoResult
  ])
);

let latestSnapshot: HealthSnapshot = {
  generatedAt: new Date().toISOString(),
  overall: "checking",
  services: targets.map((target) => ({
    id: target.id,
    name: target.name,
    category: target.category,
    icon: target.icon,
    href: target.href,
    unavailableActionLabel: target.unavailableActionLabel,
    requiredRole: target.requiredRole,
    description: target.description,
    state: target.url ? "checking" : "planned",
    message: target.url ? "Status wird geprüft." : target.unavailableActionLabel ?? "Geplant.",
    updatedAt: null,
    responseMs: null,
    infoState: latestServiceInfo[target.id]?.status ?? (target.url ? "checking" : "planned"),
    infoUpdatedAt: latestServiceInfo[target.id]?.updatedAt ?? null
  }))
};

function normalizeServiceInfo(target: HealthTarget, value: unknown): ServiceInfo | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Partial<ServiceInfo>;
  if (data.schemaVersion !== "1.0" || data.serviceId !== target.id || typeof data.generatedAt !== "string") {
    return null;
  }

  return {
    schemaVersion: "1.0",
    serviceId: target.id,
    generatedAt: data.generatedAt,
    summary: typeof data.summary === "string" ? data.summary : undefined,
    metrics: Array.isArray(data.metrics) ? data.metrics.slice(0, 12) : undefined,
    charts: Array.isArray(data.charts)
      ? data.charts
          .filter((chart) => Array.isArray(chart.points))
          .map((chart) => ({
            ...chart,
            points: chart.points.slice(-24)
          }))
          .slice(0, 4)
      : undefined,
    actions: Array.isArray(data.actions) ? data.actions.slice(0, 8) : undefined,
    sections: Array.isArray(data.sections) ? data.sections.slice(0, 6) : undefined,
    feeds: Array.isArray(data.feeds)
      ? data.feeds
          .filter((feed) => Array.isArray(feed.items))
          .map((feed) => ({
            ...feed,
            items: feed.items.slice(0, 8)
          }))
          .slice(0, 4)
      : undefined
  };
}

function sanitizeFeedText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}

function normalizeRocketChatMessage(value: unknown): ServiceFeedItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const message = value as {
    _id?: unknown;
    msg?: unknown;
    ts?: unknown;
    u?: {
      name?: unknown;
      username?: unknown;
    };
  };
  const text = sanitizeFeedText(message.msg);
  const id = typeof message._id === "string" ? message._id : "";
  const createdAt = typeof message.ts === "string" ? message.ts : new Date().toISOString();
  const author =
    typeof message.u?.name === "string"
      ? message.u.name
      : typeof message.u?.username === "string"
        ? message.u.username
        : "channel";

  if (!id || !text) {
    return null;
  }

  return {
    id,
    author: sanitizeFeedText(author).slice(0, 48) || "channel",
    text,
    createdAt,
    href: ROCKET_CHAT_CHANNEL_URL
  };
}

async function fetchRocketChatFeed(): Promise<ServiceFeed | null> {
  const userId = process.env.ROCKET_CHAT_USER_ID;
  const authToken = process.env.ROCKET_CHAT_AUTH_TOKEN;

  if (!userId || !authToken) {
    return null;
  }

  const url = new URL("/api/v1/channels.messages", ROCKET_CHAT_URL);
  url.searchParams.set("roomName", ROCKET_CHAT_CHANNEL);
  url.searchParams.set("count", String(ROCKET_CHAT_MESSAGE_LIMIT));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INFO_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "X-Auth-Token": authToken,
        "X-User-Id": userId
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { messages?: unknown[] };
    const items = Array.isArray(payload.messages)
      ? payload.messages.map(normalizeRocketChatMessage).filter((item): item is ServiceFeedItem => item !== null)
      : [];

    if (items.length === 0) {
      return null;
    }

    return {
      id: `rocket-chat-${ROCKET_CHAT_CHANNEL}`,
      title: `#${ROCKET_CHAT_CHANNEL}`,
      href: ROCKET_CHAT_CHANNEL_URL,
      items
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function mergeServiceFeeds(target: HealthTarget, result: ServiceInfoResult): Promise<ServiceInfoResult> {
  if (target.id !== "slack") {
    return result;
  }

  const feed = await fetchRocketChatFeed();
  if (!feed) {
    return result;
  }

  const baseData: ServiceInfo =
    result.data ?? {
      schemaVersion: "1.0",
      serviceId: target.id,
      generatedAt: new Date().toISOString(),
      summary: "Slack/Rocket.Chat Channel-Bridge liefert freigegebene öffentliche Nachrichten."
    };

  return {
    ...result,
    status: "available",
    message: result.data ? result.message : "Service-Info über Channel-Bridge verfügbar.",
    data: {
      ...baseData,
      generatedAt: new Date().toISOString(),
      feeds: [feed, ...(baseData.feeds ?? []).filter((item) => item.id !== feed.id)].slice(0, 4)
    }
  };
}

function publicServiceInfoUpdates(): PublicUpdate[] {
  return Object.values(latestServiceInfo).flatMap((service) =>
    (service.data?.sections ?? []).map((section) => ({
      id: `${service.serviceId}-${section.id}`,
      serviceId: service.serviceId,
      date: service.data?.generatedAt ?? service.updatedAt ?? new Date().toISOString(),
      title: section.title,
      text: section.body,
      href: service.data?.actions?.[0]?.href
    }))
  );
}

function sanitizeUpdateText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.replace(/\s+/g, " ").trim().slice(0, 180) || fallback;
}

function projectSlugFromMergeRequest(mergeRequest: GitLabMergeRequest): string {
  const reference = mergeRequest.references?.full ?? mergeRequest.references?.relative ?? "";
  const match = reference.match(/^schnick-schnack\/([^!]+)!/);
  if (match?.[1]) {
    return match[1];
  }

  if (mergeRequest.web_url) {
    try {
      const url = new URL(mergeRequest.web_url);
      const parts = url.pathname.split("/").filter(Boolean);
      const groupIndex = parts.findIndex((part) => part === GITLAB_GROUP_PATH);
      const projectSlug = parts[groupIndex + 1];
      if (groupIndex >= 0 && projectSlug) {
        return projectSlug;
      }
    } catch {
      return "gitlab";
    }
  }

  return "gitlab";
}

function mergeRequestReference(mergeRequest: GitLabMergeRequest): string {
  return (
    mergeRequest.references?.full ??
    mergeRequest.references?.relative ??
    (mergeRequest.iid ? `${GITLAB_GROUP_PATH}/${projectSlugFromMergeRequest(mergeRequest)}!${mergeRequest.iid}` : "Merge Request")
  );
}

function mergeRequestStateLabel(state: string | undefined): string {
  if (state === "merged") {
    return "wurde gemerged";
  }

  if (state === "opened") {
    return "ist offen";
  }

  return "wurde aktualisiert";
}

function formatChangedFiles(value: string | number | null | undefined): string {
  const count = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(count) || count < 1) {
    return "Änderungen sind enthalten.";
  }

  return count === 1 ? "1 Datei wurde geändert." : `${count} Dateien wurden geändert.`;
}

function normalizeMergeRequestUpdate(mergeRequest: GitLabMergeRequest): PublicUpdate | null {
  if (mergeRequest.state === "closed" || String(mergeRequest.changes_count ?? "1") === "0") {
    return null;
  }

  const serviceId = projectSlugFromMergeRequest(mergeRequest);
  const date = mergeRequest.merged_at ?? mergeRequest.updated_at ?? mergeRequest.created_at;
  const iid = mergeRequest.iid;
  const projectId = mergeRequest.project_id;
  const title = sanitizeUpdateText(mergeRequest.title, "Merge Request aktualisiert");

  if (!date || !iid || !projectId) {
    return null;
  }

  return {
    id: `gitlab-${projectId}-${iid}`,
    serviceId,
    date,
    title,
    text: `${mergeRequestReference(mergeRequest)} ${mergeRequestStateLabel(mergeRequest.state)}. ${formatChangedFiles(
      mergeRequest.changes_count
    )}`,
    href: mergeRequest.web_url
  };
}

let gitLabUpdatesCache: { expiresAt: number; updates: PublicUpdate[] } = {
  expiresAt: 0,
  updates: []
};

async function fetchGitLabJson<T>(pathName: string, searchParams?: URLSearchParams): Promise<T | null> {
  const url = new URL(pathName, GITLAB_BASE_URL);
  if (searchParams) {
    url.search = searchParams.toString();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INFO_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (GITLAB_TOKEN) {
      headers["PRIVATE-TOKEN"] = GITLAB_TOKEN;
    }

    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGitLabMergeRequestDetails(mergeRequest: GitLabMergeRequest): Promise<GitLabMergeRequest | null> {
  if (!mergeRequest.project_id || !mergeRequest.iid) {
    return null;
  }

  return fetchGitLabJson<GitLabMergeRequest>(
    `/api/v4/projects/${encodeURIComponent(String(mergeRequest.project_id))}/merge_requests/${mergeRequest.iid}`
  );
}

async function fetchGitLabUpdates(): Promise<PublicUpdate[]> {
  const now = Date.now();
  if (now < gitLabUpdatesCache.expiresAt) {
    return gitLabUpdatesCache.updates;
  }

  const updatedAfter = new Date(now - GITLAB_UPDATES_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    updated_after: updatedAfter,
    state: "all",
    order_by: "updated_at",
    sort: "desc",
    per_page: String(GITLAB_UPDATES_LIMIT)
  });

  const mergeRequests =
    (await fetchGitLabJson<GitLabMergeRequest[]>(
      `/api/v4/groups/${encodeURIComponent(GITLAB_GROUP_PATH)}/merge_requests`,
      params
    )) ?? [];

  const details = await Promise.all(mergeRequests.slice(0, GITLAB_UPDATES_LIMIT).map(fetchGitLabMergeRequestDetails));
  const updates = details
    .filter((item): item is GitLabMergeRequest => item !== null)
    .map(normalizeMergeRequestUpdate)
    .filter((item): item is PublicUpdate => item !== null)
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

  gitLabUpdatesCache = {
    expiresAt: now + GITLAB_UPDATES_CACHE_MS,
    updates
  };

  return updates;
}

async function updateSnapshot(): Promise<UpdateSnapshot> {
  const updates = [...publicServiceInfoUpdates(), ...(await fetchGitLabUpdates())].sort(
    (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()
  );

  return {
    generatedAt: new Date().toISOString(),
    updates
  };
}

async function fetchServiceInfo(target: HealthTarget): Promise<ServiceInfoResult> {
  if (!target.url) {
    return {
      serviceId: target.id,
      status: "planned",
      message: "Dienst ist geplant.",
      updatedAt: new Date().toISOString(),
      responseMs: null,
      data: null
    };
  }

  if (!target.infoUrl) {
    return {
      serviceId: target.id,
      status: "unsupported",
      message: "Service-Info-API ist noch nicht konfiguriert.",
      updatedAt: new Date().toISOString(),
      responseMs: null,
      data: null
    };
  }

  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INFO_TIMEOUT_MS);

  try {
    const response = await fetch(target.infoUrl, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    const responseMs = Math.round(performance.now() - startedAt);

    if ([401, 403, 404].includes(response.status)) {
      return mergeServiceFeeds(target, {
        serviceId: target.id,
        status: "unsupported",
        message:
          response.status === 404
            ? "Service-Info-API noch nicht implementiert."
            : "Service-Info-API ist noch nicht öffentlich freigegeben.",
        updatedAt: new Date().toISOString(),
        responseMs,
        data: null
      });
    }

    if (!response.ok) {
      return {
        serviceId: target.id,
        status: "error",
        message: `Service-Info antwortet mit HTTP ${response.status}.`,
        updatedAt: new Date().toISOString(),
        responseMs,
        data: null
      };
    }

    const serviceInfo = normalizeServiceInfo(target, await response.json());
    if (!serviceInfo) {
      return {
        serviceId: target.id,
        status: "error",
        message: "Service-Info-Payload entspricht nicht der Spezifikation.",
        updatedAt: new Date().toISOString(),
        responseMs,
        data: null
      };
    }

    return mergeServiceFeeds(target, {
      serviceId: target.id,
      status: "available",
      message: "Service-Info verfügbar.",
      updatedAt: new Date().toISOString(),
      responseMs,
      data: serviceInfo
    });
  } catch {
    return mergeServiceFeeds(target, {
      serviceId: target.id,
      status: "unsupported",
      message: "Service-Info-API nicht erreichbar oder noch nicht implementiert.",
      updatedAt: new Date().toISOString(),
      responseMs: null,
      data: null
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkTarget(target: HealthTarget): Promise<PublicService> {
  if (!target.url) {
    return {
      id: target.id,
      name: target.name,
      category: target.category,
      icon: target.icon,
      href: target.href,
      unavailableActionLabel: target.unavailableActionLabel,
      requiredRole: target.requiredRole,
      description: target.description,
      state: "planned",
      message: target.unavailableActionLabel ?? "Geplant.",
      updatedAt: new Date().toISOString(),
      responseMs: null,
      infoState: latestServiceInfo[target.id]?.status ?? "planned",
      infoUpdatedAt: latestServiceInfo[target.id]?.updatedAt ?? null
    };
  }

  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), target.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(target.url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal
    });
    const responseMs = Math.round(performance.now() - startedAt);
    const okStatuses = target.okStatuses ?? [200, 204, 301, 302, 307, 308];
    const isExpected = okStatuses.includes(response.status);

    return {
      id: target.id,
      name: target.name,
      category: target.category,
      icon: target.icon,
      href: target.href,
      unavailableActionLabel: target.unavailableActionLabel,
      requiredRole: target.requiredRole,
      description: target.description,
      state: isExpected ? "online" : "degraded",
      message: isExpected ? "Dienst antwortet." : "Dienst antwortet unerwartet.",
      updatedAt: new Date().toISOString(),
      responseMs,
      infoState: latestServiceInfo[target.id]?.status ?? "checking",
      infoUpdatedAt: latestServiceInfo[target.id]?.updatedAt ?? null
    };
  } catch {
    return {
      id: target.id,
      name: target.name,
      category: target.category,
      icon: target.icon,
      href: target.href,
      unavailableActionLabel: target.unavailableActionLabel,
      requiredRole: target.requiredRole,
      description: target.description,
      state: "offline",
      message: "Dienst ist aktuell nicht erreichbar.",
      updatedAt: new Date().toISOString(),
      responseMs: null,
      infoState: latestServiceInfo[target.id]?.status ?? "checking",
      infoUpdatedAt: latestServiceInfo[target.id]?.updatedAt ?? null
    };
  } finally {
    clearTimeout(timeout);
  }
}

function deriveOverall(services: PublicService[]): HealthSnapshot["overall"] {
  const activeServices = services.filter((service) => service.state !== "planned");

  if (activeServices.some((service) => service.state === "checking")) {
    return "checking";
  }

  if (activeServices.some((service) => service.state === "offline")) {
    return "offline";
  }

  if (activeServices.some((service) => service.state === "degraded")) {
    return "degraded";
  }

  return "online";
}

async function refreshHealth(): Promise<HealthSnapshot> {
  const infoResults = await Promise.all(targets.map((target) => fetchServiceInfo(target)));
  latestServiceInfo = Object.fromEntries(infoResults.map((result) => [result.serviceId, result]));
  const services = await Promise.all(targets.map((target) => checkTarget(target)));
  latestSnapshot = {
    generatedAt: new Date().toISOString(),
    overall: deriveOverall(services),
    services
  };
  return latestSnapshot;
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/health" });

app.disable("x-powered-by");

app.get("/api/health", (_request, response) => {
  response.json(latestSnapshot);
});

app.get("/api/build-info", (_request, response) => {
  response.json(buildInfo);
});

app.get("/api/service-info", (_request, response) => {
  response.json({
    generatedAt: new Date().toISOString(),
    services: Object.values(latestServiceInfo)
  });
});

app.get("/api/service-info/:serviceId", (request, response) => {
  const serviceInfo = latestServiceInfo[request.params.serviceId];
  if (!serviceInfo) {
    response.status(404).json({ message: "Unknown service." });
    return;
  }
  response.json(serviceInfo);
});

app.get("/api/updates", async (_request, response) => {
  response.json(await updateSnapshot());
});

app.get("/api/design-preferences", (_request, response) => {
  response.json({
    defaults: {
      theme: "dark"
    },
    storage: {
      theme: "schnick-schnack.theme"
    },
    cookies: {
      domain: ".schnick-schnack.info",
      sameSite: "Lax"
    },
    queryParams: ["theme"],
    themes: ["dark", "light"]
  });
});

const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Schnick Schnack Service Info API",
    version: "1.0.0",
    description:
      "Spezifikation fuer Dienste, die oeffentliche Zusatzinformationen an die Landing Page liefern. Jeder Dienst stellt den Endpunkt /.well-known/schnick-schnack/service-info.json bereit."
  },
  servers: [{ url: "https://{service-domain}", variables: { "service-domain": { default: "voice.schnick-schnack.info" } } }],
  paths: {
    [SERVICE_INFO_PATH]: {
      get: {
        summary: "Public service information",
        description:
          "Liefert bewusst oeffentliche Metadaten, Kennzahlen, Diagrammdaten und Aktionen fuer die Landing Page. Keine internen Ports, Hostnamen oder Secrets ausgeben.",
        responses: {
          "200": {
            description: "Service information payload",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ServiceInfo" },
                examples: {
                  openvoice: {
                    summary: "OpenVoice example",
                    value: {
                      schemaVersion: "1.0",
                      serviceId: "voice",
                      generatedAt: "2026-05-06T12:00:00.000Z",
                      summary: "OpenVoice verarbeitet aktive Sprachraeume und Nutzerlast.",
                      metrics: [
                        { id: "participants", label: "Teilnehmer", value: 12, unit: "online", tone: "info" },
                        { id: "rooms", label: "Aktive Raeume", value: 3, tone: "success" },
                        { id: "load", label: "Auslastung", value: 41, unit: "%", tone: "neutral" }
                      ],
                      charts: [
                        {
                          id: "user-load",
                          title: "User-Auslastung",
                          unit: "%",
                          points: [
                            { label: "12:00", value: 24 },
                            { label: "12:05", value: 32 },
                            { label: "12:10", value: 41 }
                          ]
                        }
                      ],
                      feeds: [
                        {
                          id: "status-channel",
                          title: "#status",
                          href: "https://slack.schnick-schnack.info/channel/status",
                          items: [
                            {
                              id: "msg-001",
                              author: "ops",
                              text: "OpenVoice Kapazitaet stabil, keine Wartung aktiv.",
                              createdAt: "2026-05-06T12:10:00.000Z",
                              href: "https://slack.schnick-schnack.info/channel/status"
                            }
                          ]
                        }
                      ],
                      actions: [
                        { id: "open", label: "Oeffnen", href: "https://voice.schnick-schnack.info", kind: "primary" }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/updates": {
      get: {
        summary: "Aggregated public module updates",
        description:
          "Liefert Service-Info-Meldungen und GitLab-Merge-Requests der Gruppe schnick-schnack aus dem konfigurierten Zeitfenster.",
        responses: {
          "200": {
            description: "Aggregated update feed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateSnapshot" }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      UpdateSnapshot: {
        type: "object",
        required: ["generatedAt", "updates"],
        properties: {
          generatedAt: { type: "string", format: "date-time" },
          updates: { type: "array", items: { $ref: "#/components/schemas/PublicUpdate" } }
        },
        additionalProperties: false
      },
      PublicUpdate: {
        type: "object",
        required: ["id", "serviceId", "date", "title", "text"],
        properties: {
          id: { type: "string" },
          serviceId: { type: "string" },
          date: { type: "string", format: "date-time" },
          title: { type: "string" },
          text: { type: "string" },
          href: { type: "string", format: "uri" }
        },
        additionalProperties: false
      },
      ServiceInfo: {
        type: "object",
        required: ["schemaVersion", "serviceId", "generatedAt"],
        properties: {
          schemaVersion: { const: "1.0" },
          serviceId: { type: "string", examples: ["voice"] },
          generatedAt: { type: "string", format: "date-time" },
          summary: { type: "string" },
          metrics: { type: "array", items: { $ref: "#/components/schemas/ServiceMetric" } },
          charts: { type: "array", items: { $ref: "#/components/schemas/ServiceChart" } },
          actions: { type: "array", items: { $ref: "#/components/schemas/ServiceAction" } },
          sections: { type: "array", items: { $ref: "#/components/schemas/ServiceSection" } },
          feeds: { type: "array", items: { $ref: "#/components/schemas/ServiceFeed" } }
        },
        additionalProperties: true
      },
      ServiceMetric: {
        type: "object",
        required: ["id", "label", "value"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          value: { oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] },
          unit: { type: "string" },
          tone: { enum: ["neutral", "success", "warning", "danger", "info"] }
        },
        additionalProperties: true
      },
      ServiceChart: {
        type: "object",
        required: ["id", "title", "points"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          unit: { type: "string" },
          points: {
            type: "array",
            items: {
              type: "object",
              required: ["label", "value"],
              properties: {
                label: { type: "string" },
                value: { type: "number" }
              }
            }
          }
        },
        additionalProperties: true
      },
      ServiceAction: {
        type: "object",
        required: ["id", "label", "href"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          href: { type: "string", format: "uri" },
          kind: { enum: ["primary", "secondary", "danger"] }
        },
        additionalProperties: true
      },
      ServiceSection: {
        type: "object",
        required: ["id", "title", "body"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          body: { type: "string" }
        },
        additionalProperties: true
      },
      ServiceFeed: {
        type: "object",
        required: ["id", "title", "items"],
        properties: {
          id: { type: "string" },
          title: { type: "string", examples: ["#general"] },
          href: { type: "string", format: "uri" },
          items: { type: "array", items: { $ref: "#/components/schemas/ServiceFeedItem" } }
        },
        additionalProperties: true
      },
      ServiceFeedItem: {
        type: "object",
        required: ["id", "author", "text", "createdAt"],
        properties: {
          id: { type: "string" },
          author: { type: "string" },
          text: { type: "string", maxLength: 220 },
          createdAt: { type: "string", format: "date-time" },
          href: { type: "string", format: "uri" }
        },
        additionalProperties: true
      }
    }
  }
};

app.get("/api/openapi.json", (_request, response) => {
  response.json(openApiDocument);
});

app.get("/api/docs", (_request, response) => {
  response.type("html").send(`<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0d1422" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5ce1be" />
    <title>Schnick Schnack Service Info API</title>
    <style>
      body { margin: 0; padding: 32px; color: #edf7f8; background: #05070c; font-family: ui-sans-serif, system-ui, sans-serif; }
      a { color: #8cf6e8; }
      pre { overflow: auto; padding: 18px; border: 1px solid rgba(140,246,232,.28); background: rgba(7,13,17,.86); }
    </style>
  </head>
  <body>
    <h1>Schnick Schnack Service Info API</h1>
    <p>OpenAPI JSON: <a href="/api/openapi.json">/api/openapi.json</a></p>
    <p>Dienste implementieren <code>${SERVICE_INFO_PATH}</code>. Die Landing Page aggregiert unter <code>/api/service-info</code>.</p>
    <pre id="spec"></pre>
    <script>
      fetch('/api/openapi.json').then((response) => response.json()).then((spec) => {
        document.getElementById('spec').textContent = JSON.stringify(spec, null, 2);
      });
    </script>
  </body>
</html>`);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.resolve(__dirname, "../client");

app.use(express.static(clientPath, { index: false }));
app.get("*splat", (_request, response) => {
  response.sendFile(path.join(clientPath, "index.html"));
});

function broadcast(snapshot: HealthSnapshot): void {
  const payload = JSON.stringify(snapshot);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

wss.on("connection", (socket) => {
  socket.send(JSON.stringify(latestSnapshot));
});

server.listen(PORT, HOST, () => {
  console.log(`Landing page listening on ${HOST}:${PORT}`);
});

await refreshHealth();
setInterval(() => {
  void refreshHealth().then(broadcast);
}, Number.isFinite(HEALTH_INTERVAL_MS) ? HEALTH_INTERVAL_MS : 10000);
