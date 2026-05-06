import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

type ServiceState = "online" | "degraded" | "offline" | "checking" | "planned";
type ServiceCategory = "communication" | "identity" | "development" | "roadmap";

type PublicService = {
  id: string;
  name: string;
  category: ServiceCategory;
  icon: "mic" | "shield" | "gitlab" | "slack";
  href: string | null;
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

type ServiceInfo = {
  schemaVersion: "1.0";
  serviceId: string;
  generatedAt: string;
  summary?: string;
  metrics?: ServiceMetric[];
  charts?: ServiceChart[];
  actions?: ServiceAction[];
  sections?: ServiceSection[];
};

type ServiceInfoResult = {
  serviceId: string;
  status: ServiceInfoState;
  message: string;
  updatedAt: string | null;
  responseMs: number | null;
  data: ServiceInfo | null;
};

const DEFAULT_TIMEOUT_MS = 4500;
const INFO_TIMEOUT_MS = Number.parseInt(process.env.INFO_TIMEOUT_MS ?? "3500", 10);
const HEALTH_INTERVAL_MS = Number.parseInt(process.env.HEALTH_INTERVAL_MS ?? "10000", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT ?? "8080", 10);
const SERVICE_INFO_PATH = "/.well-known/schnick-schnack/service-info.json";

function defaultInfoUrl(href: string | null): string | null {
  if (!href) {
    return null;
  }

  return new URL(SERVICE_INFO_PATH, href).toString();
}

const targets: HealthTarget[] = [
  {
    id: "voice",
    name: "Voice",
    category: "communication",
    icon: "mic",
    href: "https://voice.schnick-schnack.info",
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
    description: "Team-Kommunikation, Channels und Benachrichtigungen für Betrieb und Projekte.",
    url: process.env.HEALTH_SLACK_URL ?? "https://slack.schnick-schnack.info/",
    infoUrl: process.env.INFO_SLACK_URL ?? defaultInfoUrl("https://slack.schnick-schnack.info"),
    okStatuses: [200, 204, 301, 302, 307, 308, 401, 403]
  },
  {
    id: "gitlab",
    name: "GitLab",
    category: "development",
    icon: "gitlab",
    href: "https://gitlab.schnick-schnack.info",
    description: "Code- und Projektplattform für Repositories, Issues und spätere CI/CD-Abläufe.",
    url: process.env.HEALTH_GITLAB_URL ?? "https://gitlab.schnick-schnack.info/",
    infoUrl: process.env.INFO_GITLAB_URL ?? defaultInfoUrl("https://gitlab.schnick-schnack.info"),
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
    description: target.description,
    state: target.url ? "checking" : "planned",
    message: target.url ? "Status wird geprüft." : "Geplant.",
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
    sections: Array.isArray(data.sections) ? data.sections.slice(0, 6) : undefined
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
      return {
        serviceId: target.id,
        status: "unsupported",
        message:
          response.status === 404
            ? "Service-Info-API noch nicht implementiert."
            : "Service-Info-API ist noch nicht öffentlich freigegeben.",
        updatedAt: new Date().toISOString(),
        responseMs,
        data: null
      };
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

    return {
      serviceId: target.id,
      status: "available",
      message: "Service-Info verfügbar.",
      updatedAt: new Date().toISOString(),
      responseMs,
      data: serviceInfo
    };
  } catch {
    return {
      serviceId: target.id,
      status: "unsupported",
      message: "Service-Info-API nicht erreichbar oder noch nicht implementiert.",
      updatedAt: new Date().toISOString(),
      responseMs: null,
      data: null
    };
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
      description: target.description,
      state: "planned",
      message: "Geplant.",
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
    }
  },
  components: {
    schemas: {
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
          sections: { type: "array", items: { $ref: "#/components/schemas/ServiceSection" } }
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
