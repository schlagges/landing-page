import {
  Activity,
  ArrowUpRight,
  Clock3,
  GitBranch,
  Mic2,
  RadioTower,
  RefreshCw,
  ShieldCheck
} from "lucide-react";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

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

type HealthSnapshot = {
  generatedAt: string;
  overall: Exclude<ServiceState, "planned">;
  services: PublicService[];
};

type SocketState = "connecting" | "live" | "fallback";
const HEALTH_REFRESH_MS = 10000;

const stateLabels: Record<ServiceState, string> = {
  checking: "Prüfung",
  degraded: "Eingeschränkt",
  offline: "Offline",
  online: "Online",
  planned: "Geplant"
};

const overallLabels: Record<HealthSnapshot["overall"], string> = {
  checking: "Status wird geprüft",
  degraded: "Teilweise verfügbar",
  offline: "Störung erkannt",
  online: "Alle öffentlichen Dienste erreichbar"
};

const iconMap = {
  gitlab: GitBranch,
  mic: Mic2,
  radio: RadioTower,
  shield: ShieldCheck
};

const wordPermutations = [
  ["Lu", "To", "Bo"],
  ["Lu", "Bo", "To"],
  ["To", "Lu", "Bo"],
  ["To", "Bo", "Lu"],
  ["Bo", "Lu", "To"],
  ["Bo", "To", "Lu"]
] as const;

const logbookEntries = [
  {
    title: "Portal online",
    meta: "Log 001 / Public Gateway",
    body: "Die Hauptseite ist als öffentlicher Einstieg aktiv. Voice, Auth und Realtime melden ihren Status live, ohne interne Ports oder Infrastrukturdetails offenzulegen."
  },
  {
    title: "HUD Interface aktiviert",
    meta: "Log 002 / Display System",
    body: "Das Portal wurde auf ein Sci-Fi-Command-Display umgebaut: Raster, Statusmodule, rote Energieakzente und die rotierende ToLuBo-Kennung laufen jetzt im Frontend."
  },
  {
    title: "Service Panels erweitert",
    meta: "Log 003 / Interaction Layer",
    body: "Die Dienstkacheln öffnen sich zu großen Detailpanels. Actions sind vorbereitet und können später direkt aus den jeweiligen Service-APIs ergänzt werden."
  }
];

function shuffleSegments(): string[] {
  const next = wordPermutations[Math.floor(Math.random() * wordPermutations.length)] ?? wordPermutations[0];
  return [...next];
}

function nextSegments(current: string[]): string[] {
  const currentKey = current.join("");
  const choices = wordPermutations.filter((segments) => segments.join("") !== currentKey);
  const next = choices[Math.floor(Math.random() * choices.length)] ?? wordPermutations[0];
  return [...next];
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
        fallbackTimer = window.setInterval(loadSnapshot, 10000);
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

function StatusPill({ state }: { state: ServiceState }) {
  return <span className={`status-pill status-${state}`}>{stateLabels[state]}</span>;
}

function RefreshCountdown({ generatedAt }: { generatedAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = generatedAt ? Math.max(0, now - new Date(generatedAt).getTime()) : HEALTH_REFRESH_MS;
  const remaining = Math.max(0, HEALTH_REFRESH_MS - elapsed);
  const progress = Math.max(0, Math.min(1, remaining / HEALTH_REFRESH_MS));
  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="refresh-countdown" aria-label={`Nächster Refresh in ${seconds} Sekunden`}>
      <div className="refresh-countdown__label">
        <span>Next refresh</span>
        <strong>{seconds}s</strong>
      </div>
      <div className="refresh-countdown__track">
        <span style={{ "--refresh-progress": progress } as React.CSSProperties} />
      </div>
    </div>
  );
}

function ServiceCard({ service, generatedAt }: { service: PublicService; generatedAt: string | null }) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const Icon = iconMap[service.icon];
  const cardClassName = `service-card${isDetailOpen ? " service-card--detail" : ""}`;

  function closeDetail() {
    setIsDetailOpen(false);
  }

  function toggleDetail() {
    setIsDetailOpen((current) => !current);
  }

  return (
    <article
      className={cardClassName}
      onClick={toggleDetail}
      onMouseEnter={() => setIsDetailOpen(true)}
      onMouseLeave={closeDetail}
      onFocus={() => setIsDetailOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          closeDetail();
        }
      }}
      tabIndex={0}
      aria-label={`${service.name} Details anzeigen`}
    >
      <div className="service-card__shell">
        <div className="service-card__face service-card__face--front">
          <div className="service-card__topline">
            <div className="service-icon" aria-hidden="true">
              <Icon size={24} strokeWidth={2} />
            </div>
            <StatusPill state={service.state} />
          </div>
          <div>
            <h3>{service.name}</h3>
            <p>{service.description}</p>
          </div>
          <div className="service-card__meta">
            <span>
              <Clock3 size={15} aria-hidden="true" />
              {formatTime(service.updatedAt)}
            </span>
            {service.responseMs !== null ? <span>{service.responseMs} ms</span> : <span>{service.message}</span>}
          </div>
          <RefreshCountdown generatedAt={generatedAt} />
        </div>

        <div className="service-card__face service-card__face--back" aria-hidden={!isDetailOpen}>
          <div className="detail-header">
            <div className="service-icon service-icon--detail" aria-hidden="true">
              <Icon size={26} strokeWidth={2} />
            </div>
            <div>
              <span>Service Detail</span>
              <h3>{service.name}</h3>
            </div>
          </div>
          <p className="detail-copy">
            {service.description} Dieses Panel ist für Live-Details und Service-Actions vorbereitet,
            sobald der Dienst seine öffentlichen Metadaten per API bereitstellt.
          </p>
          <div className="detail-metrics">
            <span>Status: {stateLabels[service.state]}</span>
            <span>Update: {formatTime(service.updatedAt)}</span>
            <span>{service.responseMs !== null ? `Antwort: ${service.responseMs} ms` : service.message}</span>
          </div>
          <RefreshCountdown generatedAt={generatedAt} />
          <div className="service-actions" aria-label={`${service.name} Aktionen`}>
            {service.href ? (
              <a
                className="service-card__link"
                href={service.href}
                onClick={(event) => event.stopPropagation()}
              >
                Öffnen
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            ) : (
              <span className="service-card__disabled">Noch nicht verfügbar</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function Wordmark() {
  const [segments, setSegments] = useState(() => shuffleSegments());
  const [phase, setPhase] = useState<"entering" | "idle" | "leaving">("entering");

  useEffect(() => {
    const settle = window.setTimeout(() => setPhase("idle"), 900);
    const interval = window.setInterval(() => {
      setPhase("leaving");
      window.setTimeout(() => {
        setSegments((current) => nextSegments(current));
        setPhase("entering");
        window.setTimeout(() => setPhase("idle"), 900);
      }, 320);
    }, 12000);

    return () => {
      window.clearTimeout(settle);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className={`wordmark wordmark--${phase}`} aria-label={segments.join("")}>
      {segments.map((segment, index) => (
        <span key={`${segment}-${index}`} style={{ "--segment-index": index } as React.CSSProperties}>
          {segment}
        </span>
      ))}
    </div>
  );
}

function Logbook() {
  return (
    <section className="logbook" aria-labelledby="logbook-title">
      <div className="logbook__heading">
        <span>Mission Log</span>
        <h2 id="logbook-title">Was passiert ist</h2>
      </div>
      <div className="logbook__entries">
        {logbookEntries.map((entry) => (
          <article className="log-entry" key={entry.title}>
            <span>{entry.meta}</span>
            <h3>{entry.title}</h3>
            <p>{entry.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function App() {
  const { snapshot, socketState } = useHealth();
  const services = snapshot?.services ?? [];
  const activeServices = services.filter((service) => service.state !== "planned");
  const plannedServices = services.filter((service) => service.state === "planned");
  const visibleServices = [...activeServices, ...plannedServices];

  const onlineCount = useMemo(
    () => activeServices.filter((service) => service.state === "online").length,
    [activeServices]
  );

  return (
    <main>
      <div className="grid-runners" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <section className="hero" aria-labelledby="page-title">
        <div className="hero__content">
          <div className="eyebrow">
            <Activity size={16} aria-hidden="true" />
            COMMAND DISPLAY / PUBLIC SERVICES
          </div>
          <p className="domain-label" id="page-title">schnick-schnack.info</p>
          <Wordmark />
          <p>
            Systemzugriff auf verfügbare Dienste. Live-Status aktiv, öffentliche Telemetrie
            reduziert auf Verfügbarkeit.
          </p>
        </div>
        <aside className="status-panel" aria-label="Gesamtstatus">
          <span className={`status-dot status-dot--${snapshot?.overall ?? "checking"}`} />
          <div>
            <strong>{snapshot ? overallLabels[snapshot.overall] : "Status wird geladen"}</strong>
            <span>{onlineCount} von {activeServices.length || 3} Diensten online</span>
          </div>
        </aside>
      </section>

      <section className="live-strip" aria-label="Live Aktualisierung">
        <div>
          <RefreshCw size={17} aria-hidden="true" className={socketState === "live" ? "spin-soft" : ""} />
          <span>{socketState === "live" ? "Live per WebSocket" : "Fallback per Abfrage"}</span>
        </div>
        <span>Letzte Aktualisierung: {formatTime(snapshot?.generatedAt ?? null)}</span>
      </section>

      <Logbook />

      <section className="section-block" aria-labelledby="services-title">
        <div className="section-heading">
          <div>
            <h2 id="services-title">Module</h2>
            <p>Schnelle Einstiege, klickbereit während jeder Animation.</p>
          </div>
        </div>

        <div className="service-grid">
          {services.length > 0 ? (
            visibleServices.map((service) => (
              <ServiceCard key={service.id} service={service} generatedAt={snapshot?.generatedAt ?? null} />
            ))
          ) : (
            <>
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton" />
            </>
          )}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
