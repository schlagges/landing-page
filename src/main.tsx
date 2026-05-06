import {
  Activity,
  ArrowUpRight,
  Clock3,
  GitBranch,
  Mic2,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  SwatchBook
} from "lucide-react";
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
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
const IDLE_ROTATION_MS = 6500;
const POINTER_IDLE_MS = 4800;
const STORAGE_KEY = "schnick-schnack.theme";
const DEFAULT_THEME = "crimson-command";
const THEMES = [
  { id: "crimson-command", label: "Crimson Command", colors: ["#6ffdf0", "#ff566f"] },
  { id: "neon-ice", label: "Neon Ice", colors: ["#8be1ff", "#e6faff"] },
  { id: "violet-warp", label: "Violet Warp", colors: ["#b770ff", "#ff56d3"] },
  { id: "amber-terminal", label: "Amber Terminal", colors: ["#ffc75c", "#ff5f52"] },
  { id: "bio-matrix", label: "Bio Matrix", colors: ["#61ff8b", "#d5ff63"] }
] as const;

type ThemeId = (typeof THEMES)[number]["id"];
type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => void;
};

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

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function normalizeTheme(theme: string | null | undefined): ThemeId {
  return THEMES.some((item) => item.id === theme) ? (theme as ThemeId) : DEFAULT_THEME;
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

function applyTheme(theme: ThemeId, shouldSave = true) {
  document.documentElement.dataset.theme = theme;

  if (shouldSave && isStorageAvailable()) {
    window.localStorage.setItem(STORAGE_KEY, theme);
  }
}

function applyInitialTheme(): ThemeId {
  const savedTheme = isStorageAvailable() ? window.localStorage.getItem(STORAGE_KEY) : null;
  const initialTheme = normalizeTheme(savedTheme);
  applyTheme(initialTheme, false);
  return initialTheme;
}

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
    id: "portal-online",
    title: "Portal online",
    meta: "Log 001 / Public Gateway",
    teaser: "Das öffentliche Gateway bündelt Voice, Auth und Realtime in einer Statusfläche.",
    body: `Das Portal ist der sichtbare Einstiegspunkt für die Dienste auf schnick-schnack.info. Der wichtigste Architekturentscheid war, die öffentliche Ansicht strikt von internen Betriebsdetails zu trennen. Besucher sehen Namen, Status, Aktualisierung und Aktionen, aber keine Container, Ports, Datenbankadressen oder privaten Routings. Die Statusdaten entstehen serverseitig und werden als reduzierte Public-Health-Snapshots ausgeliefert. Der Browser bekommt dadurch nur die Information, die für Orientierung und Vertrauen sinnvoll ist. Voice wird als geschützter OpenVoice-Zugang geführt, Auth verweist auf die SSO-Ebene, und Realtime repräsentiert die Medienstrecke. Im Hintergrund laufen weitere Bausteine wie Postgres, Valkey, Prometheus, Grafana, Coturn und LiveKit, doch die Landing Page behandelt sie nicht als öffentliche Zielsysteme. Das ist Absicht: Infrastruktur unterstützt das Portal, sie wird aber nicht selbst zum Exponat. Der Health-Server aktualisiert regelmäßig und verteilt Snapshots über WebSocket. Wenn die Verbindung fehlt, fällt die Oberfläche auf Abfrage zurück. So bleibt das Display lebendig, ohne Nutzer mit technischen Fehlermeldungen zu belasten. Das erste Deployment wurde als Docker-Service auf dem Server bereitgestellt und lokal hinter Nginx angebunden. Die Domain kann über TLS terminieren, während die Anwendung selbst intern bleibt. Damit ist die Seite öffentlich schnell erreichbar, aber operativ sauber gekapselt. Dieser Stand ist die Basis für spätere Detail-APIs: Jeder Dienst kann künftig eigene öffentliche Metadaten liefern, während das Portal weiterhin entscheidet, welche Informationen wirklich auf die Brücke gehören. Auch das Deployment wurde reproduzierbar gehalten: Build, Containerstart, Healthcheck und GitHub-Push sind dokumentiert und geprüft. Änderungen können dadurch zügig veröffentlicht werden, ohne am Server manuell Dateien zu editieren oder Zustände zu erraten. Für Besucher entsteht ein ruhiger Einstieg, für Betreiber bleibt die Oberfläche kontrollierbar, testbar und erweiterbar. Der nächste Schritt wird sein, Logbuch und Servicekatalog aus Datenquellen zu speisen, damit Deployments, Wartungsfenster und neue Module ohne Frontend-Release erscheinen. Trotzdem bleibt der Sicherheitsfilter zentral: öffentlich ist nur, was bewusst freigegeben wurde. Diese Linie bleibt für spätere Integrationen verbindlich.`
  },
  {
    id: "hud-interface",
    title: "HUD Interface aktiviert",
    meta: "Log 002 / Display System",
    teaser: "Das Display wurde vom Portal zur Brückenkonsole mit animiertem HUD erweitert.",
    body: `Das Interface wurde von einer klassischen Landing Page zu einem Command Display umgebaut. Die Gestaltung bleibt dunkel, technisch und konzentriert, nutzt aber stärkere rote Energieakzente, Cyan-Kanten und ein feines Raster, damit die Oberfläche wie ein aktives Kontrollsystem wirkt. Die ToLuBo-Kennung rotiert nicht nur beim Laden, sondern sortiert sich regelmäßig neu. Dabei blenden die Segmente leicht aus, wabern, setzen sich wieder zusammen und verweilen anschließend lange genug, damit die Bewegung nicht nervös wirkt. Die Servicekarten bekamen schnelle Boot-Animationen, umlaufende Rahmen und kurze Lichtimpulse. Wichtig war, dass diese Effekte nicht gegen die Bedienbarkeit arbeiten. Hover, Fokus und Klick müssen unmittelbar reagieren; Animationen dürfen nie die Aktion blockieren. Deshalb laufen die Übergänge kurz, präzise und überwiegend transformbasiert. Der Hintergrund wurde nachjustiert: Statt eines dominanten Sweeps fahren nur noch gelegentlich kleine Lightcycle-Linien über das Raster. Sie geben dem Display Bewegung, ohne die Inhalte zu überstrahlen. Auch die Farbharmonie wurde geprüft. Rot markiert Energie, Aufmerksamkeit und Interaktion, während Teal und Cyan den technischen Grundton stabilisieren. Erfolgsstatus bleibt grün, Warnung bleibt warm, Fehler bleibt rot. Dadurch entsteht kein reines Alarmbild, sondern ein kontrolliertes Cockpit. Die Live-Statusfläche wurde als eigene HUD-Kachel gestaltet, mit Kanten, Sweep und klarer Verbindungsmeldung. Gleichzeitig respektiert die Oberfläche reduzierte Bewegung: Nutzer mit entsprechender Systemeinstellung bekommen keine Flip-, Waber- oder Laufanimationen. Das Ergebnis ist expressiver als ein Business-Dashboard, aber weiterhin scanbar. Die Seite soll Eindruck machen, ohne die Grundaufgabe zu verlieren: schnell erkennen, was verfügbar ist, und den passenden Dienst öffnen. Diese Balance war der Kern des Refactors. Die Komposition bleibt responsiv, hält Text innerhalb der Panels und vermeidet dekorative Elemente ohne Funktion. So fühlt sich das Portal wie ein Display an, nicht wie eine Effekt-Demo. Technisch bleiben die Animationen bewusst in CSS, damit React nur Zustände steuert. Das reduziert Re-Renders, hält den Code auch unter Last lesbar und macht spätere Theme-Varianten einfacher testbar.`
  },
  {
    id: "service-panels",
    title: "Service Panels erweitert",
    meta: "Log 003 / Interaction Layer",
    teaser: "Kacheln wurden zu Detailpanels mit vorbereiteter Action-Schicht und Refresh-Takt.",
    body: `Die Kacheln folgen jetzt einem wiederverwendbaren Interaktionsmodell: vorne steht eine kompakte Kurzinfo, in der Detailansicht entsteht ein größeres Panel mit Kontext, Messwerten und Aktionen. Dieses Muster gilt nicht nur für Dienste, sondern auch für News und spätere Logbuch-Einträge. Der Nutzer soll überall dasselbe Verhalten lernen: eine Karte zeigt den Teaser, die geöffnete Ansicht zeigt den eigentlichen Inhalt. Ursprünglich wuchs die Karte direkt im Grid. Das erzeugte kurzzeitig Layoutverschiebungen und konnte Scrollbars einblenden. Die aktuelle Richtung trennt Layout und Detailzustand sauberer. Das Grid bleibt stabil, während die Detailansicht als zentriertes HUD-Panel im sichtbaren Bereich erscheint. Dadurch kann die Animation größer und dramatischer sein, ohne über Ränder zu ragen oder die Seite zu verschieben. Jede Dienstkarte hat außerdem einen rückwärts laufenden Refresh-Balken. Er basiert auf dem letzten Health-Snapshot und zeigt, wie lange der aktuelle Zustand voraussichtlich noch gültig ist. Das ist nützlicher als ein statischer Zeitstempel, weil der Nutzer den Takt der Telemetrie direkt sieht. Auf der Rückseite stehen vorbereitete Detailinformationen, Status, Updatezeit und Reaktionszeit. Die Action-Zone enthält aktuell nur Öffnen, ist aber als Platz für spätere API-gelieferte Aktionen angelegt. Denkbar sind direkte Links zu Dashboards, Login-Flows, Raumstatus, Audit-Hinweisen oder Wartungsfenstern. Wichtig bleibt: Die Dienste liefern später öffentliche Metadaten, das Portal entscheidet über Darstellung und Sicherheitsfilter. Intern laufende Komponenten wie LiveKit, Coturn, Valkey, Postgres, Prometheus und Grafana können so Zustände beeinflussen, ohne ungefiltert sichtbar zu werden. Das Interaktionsmodell ist damit vorbereitet für mehr Inhalt, bleibt aber heute schon bedienbar. Tests prüfen nachweisbar Hover, Klick-Schließen, Countdown, Logbuchposition und Statusdarstellung. Das reduziert die Gefahr, dass visuelle Effekte die Nutzbarkeit beschädigen. Der Dialog-Layer ist bewusst zentral, begrenzt und intern scrollbar. So darf Text ausführlich werden, während die Seite selbst ruhig bleibt und keine temporären Browserleisten erzeugt. News nutzen dasselbe Muster: kurzer Teaser außen, technischer Langtext innen, später gespeist aus einem Feed mit Versionsstand und Autor.`
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

function ServiceCard({
  service,
  generatedAt,
  isActive,
  onOpen
}: {
  service: PublicService;
  generatedAt: string | null;
  isActive: boolean;
  onOpen: () => void;
}) {
  const Icon = iconMap[service.icon];
  const cardClassName = `service-card${isActive ? " service-card--active" : ""}`;

  return (
    <article
      className={`${cardClassName}${isActive ? " is-selected" : ""}`}
      data-selectable-card
      aria-selected={isActive}
      onClick={onOpen}
      onMouseEnter={onOpen}
      onFocus={onOpen}
      tabIndex={0}
      aria-label={`${service.name} Details anzeigen`}
    >
      <div className="service-card__shell">
        <span className="selected-badge">FOCUS</span>
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

function Logbook({
  activeLogId,
  onOpen
}: {
  activeLogId: string;
  onOpen: (id: string) => void;
}) {
  const activeEntry = (logbookEntries.find((entry) => entry.id === activeLogId) ?? logbookEntries[0])!;

  return (
    <section className="logbook" aria-labelledby="logbook-title">
      <div className="panel-heading">
        <div>
          <span>Mission Log</span>
          <h2 id="logbook-title">Was passiert ist</h2>
        </div>
        <small>Autopilot rotiert bei Inaktivität</small>
      </div>
      <div className="logbook__layout">
        <div className="logbook__entries" data-card-group>
          {logbookEntries.map((entry) => (
            <LogCard
              entry={entry}
              isActive={activeLogId === entry.id}
              key={entry.id}
              onOpen={() => onOpen(entry.id)}
            />
          ))}
        </div>
        <LogDetail entry={activeEntry} />
      </div>
    </section>
  );
}

function LogCard({
  entry,
  isActive,
  onOpen
}: {
  entry: (typeof logbookEntries)[number];
  isActive: boolean;
  onOpen: () => void;
}) {
  return (
    <article
      className={`log-entry${isActive ? " log-entry--active is-selected" : ""}`}
      data-selectable-card
      aria-selected={isActive}
      tabIndex={0}
      aria-label={`${entry.title} Details anzeigen`}
      onMouseEnter={onOpen}
      onFocus={onOpen}
      onClick={onOpen}
    >
      <span className="selected-badge">FOCUS</span>
      <span>{entry.meta}</span>
      <h3>{entry.title}</h3>
      <p>{entry.teaser}</p>
    </article>
  );
}

function LogDetail({ entry }: { entry: (typeof logbookEntries)[number] }) {
  return (
    <article className="detail-panel detail-panel--news" aria-label="News Detail" data-active-detail key={entry.id}>
      <div className="detail-header">
        <div className="service-icon service-icon--detail" aria-hidden="true">
          <Activity size={24} strokeWidth={2} />
        </div>
        <div>
          <span>{entry.meta}</span>
          <h3 data-active-title>{entry.title}</h3>
        </div>
      </div>
      <p className="detail-copy detail-copy--long" data-active-description>{entry.body}</p>
    </article>
  );
}

function ServiceDetail({
  service,
  generatedAt
}: {
  service: PublicService | undefined;
  generatedAt: string | null;
}) {
  if (!service) {
    return null;
  }

  const Icon = iconMap[service.icon];

  return (
    <article className="detail-panel detail-panel--service" aria-label="Modul Detail" data-active-detail key={service.id}>
      <div className="detail-header">
        <div className="service-icon service-icon--detail" aria-hidden="true">
          <Icon size={24} strokeWidth={2} />
        </div>
        <div>
          <span>Service Detail</span>
          <h3 data-active-title>{service.name}</h3>
        </div>
      </div>
      <p className="detail-copy" data-active-description>
        {service.description} Dieses Panel ist für Live-Details und Service-Actions vorbereitet,
        sobald der Dienst seine öffentlichen Metadaten per API bereitstellt. Sichtbar bleiben nur
        freigegebene Statusdaten; Betriebsdetails und interne Routen bleiben serverseitig.
      </p>
      <div className="detail-metrics">
        <span>Status: {stateLabels[service.state]}</span>
        <span>Update: {formatTime(service.updatedAt)}</span>
        <span>{service.responseMs !== null ? `Antwort: ${service.responseMs} ms` : service.message}</span>
      </div>
      <RefreshCountdown generatedAt={generatedAt} />
      <div className="service-actions" aria-label={`${service.name} Aktionen`}>
        {service.href ? (
          <a className="service-card__link" href={service.href}>
            Öffnen
            <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        ) : (
          <span className="service-card__disabled">Noch nicht verfügbar</span>
        )}
      </div>
    </article>
  );
}

function ThemeDock({
  activeTheme,
  onThemeChange
}: {
  activeTheme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
}) {
  return (
    <aside className="theme-dock" aria-label="Theme Auswahl">
      <div className="theme-dock__label">
        <SwatchBook size={15} aria-hidden="true" />
        <span>Theme</span>
      </div>
      <div className="theme-dock__chips">
        {THEMES.map((theme) => (
          <button
            aria-label={`Theme ${theme.label} aktivieren`}
            aria-pressed={activeTheme === theme.id}
            className={`theme-chip${activeTheme === theme.id ? " is-active" : ""}`}
            data-theme-choice={theme.id}
            key={theme.id}
            onClick={() => onThemeChange(theme.id)}
            type="button"
          >
            <span
              className="theme-chip__swatch"
              style={
                {
                  "--chip-a": theme.colors[0],
                  "--chip-b": theme.colors[1]
                } as React.CSSProperties
              }
              aria-hidden="true"
            />
            <span>{theme.label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function App() {
  const { snapshot, socketState } = useHealth();
  const [activeTheme, setActiveTheme] = useState<ThemeId>(() => applyInitialTheme());
  const [activeLogId, setActiveLogId] = useState(logbookEntries[0]!.id);
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
  const lastPointerAt = useRef(Date.now());
  const services = snapshot?.services ?? [];
  const activeServices = services.filter((service) => service.state !== "planned");
  const plannedServices = services.filter((service) => service.state === "planned");
  const visibleServices = [...activeServices, ...plannedServices];

  const onlineCount = useMemo(
    () => activeServices.filter((service) => service.state === "online").length,
    [activeServices]
  );
  const activeService = visibleServices.find((service) => service.id === activeServiceId) ?? visibleServices[0];

  function changeTheme(theme: ThemeId) {
    const update = () => {
      setActiveTheme(theme);
      applyTheme(theme);
    };

    const viewTransitionDocument = document as ViewTransitionDocument;
    if (viewTransitionDocument.startViewTransition && !prefersReducedMotion()) {
      viewTransitionDocument.startViewTransition(update);
      return;
    }

    update();
  }

  useEffect(() => {
    if (!activeServiceId && visibleServices[0]) {
      setActiveServiceId(visibleServices[0].id);
    }
  }, [activeServiceId, visibleServices]);

  useEffect(() => {
    const markPointer = () => {
      lastPointerAt.current = Date.now();
    };
    window.addEventListener("mousemove", markPointer);
    window.addEventListener("pointerdown", markPointer);
    window.addEventListener("keydown", markPointer);
    return () => {
      window.removeEventListener("mousemove", markPointer);
      window.removeEventListener("pointerdown", markPointer);
      window.removeEventListener("keydown", markPointer);
    };
  }, []);

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

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (Date.now() - lastPointerAt.current < POINTER_IDLE_MS) {
        return;
      }
      setActiveLogId((current) => {
        const index = Math.max(0, logbookEntries.findIndex((entry) => entry.id === current));
        return logbookEntries[(index + 1) % logbookEntries.length]!.id;
      });
      setActiveServiceId((current) => {
        if (visibleServices.length === 0) {
          return current;
        }
        const index = Math.max(0, visibleServices.findIndex((service) => service.id === current));
        return visibleServices[(index + 1) % visibleServices.length]?.id ?? current;
      });
    }, IDLE_ROTATION_MS);

    return () => window.clearInterval(timer);
  }, [visibleServices]);

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

      <Logbook
        activeLogId={activeLogId}
        onOpen={setActiveLogId}
      />

      <section className="section-block" aria-labelledby="services-title">
        <div className="panel-heading">
          <div>
            <h2 id="services-title">Module</h2>
            <p>Schnelle Einstiege, klickbereit während jeder Animation.</p>
          </div>
        </div>

        <div className="module-layout">
          <div className="service-grid" data-card-group>
            {services.length > 0 ? (
              visibleServices.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  generatedAt={snapshot?.generatedAt ?? null}
                  isActive={activeService?.id === service.id}
                  onOpen={() => setActiveServiceId(service.id)}
                />
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
          <ServiceDetail service={activeService} generatedAt={snapshot?.generatedAt ?? null} />
        </div>
      </section>
      <ThemeDock activeTheme={activeTheme} onThemeChange={changeTheme} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
