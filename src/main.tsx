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

const wordSegments = ["Lu", "To", "Bo"] as const;

function shuffleSegments(): string[] {
  return [...wordSegments]
    .map((value) => ({ value, order: Math.random() }))
    .sort((left, right) => left.order - right.order)
    .map((item) => item.value);
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

function ServiceCard({ service }: { service: PublicService }) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const Icon = iconMap[service.icon];
  const cardClassName = `service-card${isDetailOpen ? " service-card--detail" : ""}`;

  function openDetail() {
    setIsDetailOpen(true);
  }

  function closeDetail() {
    setIsDetailOpen(false);
  }

  return (
    <article
      className={cardClassName}
      onClick={openDetail}
      onMouseLeave={closeDetail}
      onFocus={openDetail}
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
          <p>{service.description}</p>
          <div className="detail-metrics">
            <span>Status: {stateLabels[service.state]}</span>
            <span>Update: {formatTime(service.updatedAt)}</span>
            <span>{service.responseMs !== null ? `Antwort: ${service.responseMs} ms` : service.message}</span>
          </div>
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
  const segments = useMemo(() => shuffleSegments(), []);

  return (
    <div className="wordmark" aria-label={segments.join("")}>
      {segments.map((segment, index) => (
        <span key={`${segment}-${index}`} style={{ "--segment-index": index } as React.CSSProperties}>
          {segment}
        </span>
      ))}
    </div>
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

      <section className="section-block" aria-labelledby="services-title">
        <div className="section-heading">
          <div>
            <h2 id="services-title">Module</h2>
            <p>Schnelle Einstiege, klickbereit während jeder Animation.</p>
          </div>
        </div>

        <div className="service-grid">
          {services.length > 0 ? (
            visibleServices.map((service) => <ServiceCard key={service.id} service={service} />)
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
