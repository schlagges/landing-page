import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

type ServiceState = "online" | "degraded" | "offline" | "checking" | "planned";
type ServiceCategory = "communication" | "identity" | "realtime" | "roadmap";

type PublicService = {
  id: string;
  name: string;
  category: ServiceCategory;
  icon: "mic" | "shield" | "radio" | "gitlab";
  href: string | null;
  description: string;
  state: ServiceState;
  message: string;
  updatedAt: string | null;
  responseMs: number | null;
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
};

type HealthSnapshot = {
  generatedAt: string;
  overall: Exclude<ServiceState, "planned">;
  services: PublicService[];
};

const DEFAULT_TIMEOUT_MS = 4500;
const HEALTH_INTERVAL_MS = Number.parseInt(process.env.HEALTH_INTERVAL_MS ?? "10000", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT ?? "8080", 10);

const targets: HealthTarget[] = [
  {
    id: "voice",
    name: "Voice",
    category: "communication",
    icon: "mic",
    href: "https://voice.schnick-schnack.info",
    description: "Geschützter Zugang zur OpenVoice-Oberfläche.",
    url: process.env.HEALTH_VOICE_URL ?? "https://voice.schnick-schnack.info/",
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
    okStatuses: [200, 204, 301, 302, 307, 308]
  },
  {
    id: "realtime",
    name: "Realtime",
    category: "realtime",
    icon: "radio",
    href: "https://voice.schnick-schnack.info",
    description: "Live-Kommunikation für Sprach- und Medienverbindungen.",
    url: process.env.HEALTH_REALTIME_URL ?? "https://voice.schnick-schnack.info/livekit/",
    okStatuses: [200, 204, 301, 302, 307, 308, 401, 403]
  },
  {
    id: "gitlab",
    name: "GitLab",
    category: "roadmap",
    icon: "gitlab",
    href: null,
    description: "Code- und Projektplattform ist für eine spätere Erweiterung vorgesehen."
  }
];

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
    responseMs: null
  }))
};

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
      responseMs: null
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
      responseMs
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
      responseMs: null
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
