import {
  Activity,
  ArrowUpRight,
  Clock3,
  GitBranch,
  Mic2,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  SwatchBook,
  Languages
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
  infoState: ServiceInfoState;
  infoUpdatedAt: string | null;
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
  points: Array<{ label: string; value: number }>;
};

type ServiceAction = {
  id: string;
  label: string;
  href: string;
  kind?: "primary" | "secondary" | "danger";
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

type SocketState = "connecting" | "live" | "fallback";
type Language = "de" | "en";
const HEALTH_REFRESH_MS = 10000;
const IDLE_ROTATION_MS = 6500;
const POINTER_IDLE_MS = 4800;
const HOVER_INTENT_MS = 360;
const STORAGE_KEY = "schnick-schnack.theme";
const LANGUAGE_STORAGE_KEY = "schnick-schnack.language";
const DEFAULT_THEME = "crimson-command";
const DEFAULT_LANGUAGE: Language = "de";
const THEMES = [
  { id: "crimson-command", label: "Crimson Command", colors: ["#6ffdf0", "#ff566f"] },
  { id: "neon-ice", label: "Neon Ice", colors: ["#8be1ff", "#e6faff"] },
  { id: "violet-warp", label: "Violet Warp", colors: ["#b770ff", "#ff56d3"] },
  { id: "amber-terminal", label: "Amber Terminal", colors: ["#ffc75c", "#ff5f52"] },
  { id: "bio-matrix", label: "Bio Matrix", colors: ["#61ff8b", "#d5ff63"] },
  { id: "solar-flare", label: "Solar Flare", colors: ["#ffe27a", "#ff3d2e"] },
  { id: "deep-ocean", label: "Deep Ocean", colors: ["#3fe8ff", "#3264ff"] },
  { id: "ghost-glass", label: "Ghost Glass", colors: ["#f7fbff", "#8aa7ff"] }
] as const;

type ThemeId = (typeof THEMES)[number]["id"];
type LocalizedText = Record<Language, string>;
type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => void;
};

const translations = {
  de: {
    aria: {
      languageSelection: "Sprachauswahl",
      serviceActions: "Aktionen",
      serviceDetails: "Details anzeigen",
      moduleDetail: "Modul Detail",
      newsDetail: "News Detail",
      overallStatus: "Gesamtstatus",
      liveUpdates: "Live Aktualisierung",
      themeSelection: "Theme Auswahl"
    },
    detail: {
      actions: "Aktionen",
      emptyInfo:
        "Service-Info-API wird geprüft. Dienste können den öffentlichen Info-Endpunkt später implementieren.",
      intro:
        "Dieses Panel ist für Live-Details und Service-Actions vorbereitet, sobald der Dienst seine öffentlichen Metadaten per API bereitstellt. Sichtbar bleiben nur freigegebene Statusdaten; Betriebsdetails und interne Routen bleiben serverseitig.",
      label: "Service Detail",
      metrics: "Service Kennzahlen",
      notAvailable: "Noch nicht verfügbar",
      open: "Öffnen",
      response: "Antwort",
      status: "Status",
      update: "Update"
    },
    hero: {
      eyebrow: "COMMAND DISPLAY / PUBLIC SERVICES",
      text: "Systemzugriff auf verfügbare Dienste. Live-Status aktiv, öffentliche Telemetrie reduziert auf Verfügbarkeit."
    },
    language: {
      label: "Sprache",
      options: {
        de: "Deutsch",
        en: "English"
      },
      switchTo: {
        de: "Deutsch aktivieren",
        en: "Englisch aktivieren"
      }
    },
    live: {
      fallback: "Fallback per Abfrage",
      lastUpdate: "Letzte Aktualisierung",
      live: "Live per WebSocket"
    },
    logbook: {
      autopilot: "Autopilot rotiert bei Inaktivität",
      eyebrow: "Mission Log",
      title: "Was passiert ist"
    },
    refresh: {
      aria: (seconds: number) => `Nächster Refresh in ${seconds} Sekunden`
    },
    services: {
      onlineCount: (online: number, total: number) => `${online} von ${total} Diensten online`,
      subtitle: "Schnelle Einstiege, klickbereit während jeder Animation.",
      title: "Module"
    },
    status: {
      info: {
        available: "API aktiv",
        checking: "API-Prüfung",
        error: "API Fehler",
        planned: "Geplant",
        unsupported: "API offen"
      },
      overall: {
        checking: "Status wird geprüft",
        degraded: "Teilweise verfügbar",
        offline: "Störung erkannt",
        online: "Alle öffentlichen Dienste erreichbar"
      },
      service: {
        checking: "Prüfung",
        degraded: "Eingeschränkt",
        offline: "Offline",
        online: "Online",
        planned: "Geplant"
      }
    },
    theme: {
      activate: (label: string) => `Theme ${label} aktivieren`,
      label: "Theme"
    },
    time: {
      unchecked: "Noch nicht geprüft"
    }
  },
  en: {
    aria: {
      languageSelection: "Language selection",
      serviceActions: "Actions",
      serviceDetails: "show details",
      moduleDetail: "Module detail",
      newsDetail: "News detail",
      overallStatus: "Overall status",
      liveUpdates: "Live updates",
      themeSelection: "Theme selection"
    },
    detail: {
      actions: "Actions",
      emptyInfo:
        "Service Info API is being checked. Services can implement the public info endpoint later.",
      intro:
        "This panel is prepared for live details and service actions once the service exposes public metadata through its API. Only approved status data stays visible; operational details and internal routes remain server-side.",
      label: "Service Detail",
      metrics: "Service metrics",
      notAvailable: "Not available yet",
      open: "Open",
      response: "Response",
      status: "Status",
      update: "Update"
    },
    hero: {
      eyebrow: "COMMAND DISPLAY / PUBLIC SERVICES",
      text: "System access to available services. Live status is active, public telemetry is reduced to availability."
    },
    language: {
      label: "Language",
      options: {
        de: "Deutsch",
        en: "English"
      },
      switchTo: {
        de: "Switch to German",
        en: "Switch to English"
      }
    },
    live: {
      fallback: "Polling fallback",
      lastUpdate: "Last update",
      live: "Live via WebSocket"
    },
    logbook: {
      autopilot: "Autopilot rotates while idle",
      eyebrow: "Mission Log",
      title: "What happened"
    },
    refresh: {
      aria: (seconds: number) => `Next refresh in ${seconds} seconds`
    },
    services: {
      onlineCount: (online: number, total: number) => `${online} of ${total} services online`,
      subtitle: "Fast entry points, clickable through every animation.",
      title: "Modules"
    },
    status: {
      info: {
        available: "API active",
        checking: "API check",
        error: "API error",
        planned: "Planned",
        unsupported: "API open"
      },
      overall: {
        checking: "Checking status",
        degraded: "Partially available",
        offline: "Incident detected",
        online: "All public services reachable"
      },
      service: {
        checking: "Checking",
        degraded: "Degraded",
        offline: "Offline",
        online: "Online",
        planned: "Planned"
      }
    },
    theme: {
      activate: (label: string) => `Activate ${label} theme`,
      label: "Theme"
    },
    time: {
      unchecked: "Not checked yet"
    }
  }
} as const;

type Translation = (typeof translations)[Language];

const serviceCopy: Record<string, LocalizedText> = {
  auth: {
    de: "Zentrale Anmeldung für Dienste mit Single Sign-on.",
    en: "Central sign-in for services with single sign-on."
  },
  gitlab: {
    de: "Code- und Projektplattform für die schnick-schnack-Projekte.",
    en: "Code and project platform for schnick-schnack projects."
  },
  realtime: {
    de: "Live-Kommunikation für Sprach- und Medienverbindungen.",
    en: "Live communication for voice and media connections."
  },
  voice: {
    de: "Geschützter Zugang zur OpenVoice-Oberfläche.",
    en: "Protected access to the OpenVoice interface."
  }
};

const serviceMessages: Record<string, LocalizedText> = {
  "Dienst antwortet.": {
    de: "Dienst antwortet.",
    en: "Service is responding."
  },
  "Dienst antwortet unerwartet.": {
    de: "Dienst antwortet unerwartet.",
    en: "Service responded unexpectedly."
  },
  "Dienst ist aktuell nicht erreichbar.": {
    de: "Dienst ist aktuell nicht erreichbar.",
    en: "Service is currently unreachable."
  },
  "Geplant.": {
    de: "Geplant.",
    en: "Planned."
  },
  "Status wird geprüft.": {
    de: "Status wird geprüft.",
    en: "Checking status."
  }
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

function normalizeLanguage(language: string | null | undefined): Language {
  return language === "en" || language === "de" ? language : DEFAULT_LANGUAGE;
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

function applyLanguage(language: Language, shouldSave = true) {
  document.documentElement.lang = language;

  if (shouldSave && isStorageAvailable()) {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
}

function applyInitialLanguage(): Language {
  const savedLanguage = isStorageAvailable() ? window.localStorage.getItem(LANGUAGE_STORAGE_KEY) : null;
  const initialLanguage = normalizeLanguage(savedLanguage);
  applyLanguage(initialLanguage, false);
  return initialLanguage;
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

const logbookTranslations: Record<string, { title: LocalizedText; meta: LocalizedText; teaser: LocalizedText; body: LocalizedText }> = {
  "hud-interface": {
    title: {
      de: "HUD Interface aktiviert",
      en: "HUD Interface activated"
    },
    meta: {
      de: "Log 002 / Display System",
      en: "Log 002 / Display System"
    },
    teaser: {
      de: "Das Display wurde vom Portal zur Brückenkonsole mit animiertem HUD erweitert.",
      en: "The display evolved from a portal into a bridge console with an animated HUD."
    },
    body: {
      de: logbookEntries[1]!.body,
      en: "The interface moved from a classic landing page to a command display. It keeps a dark, technical tone while using red energy accents, cyan edges, and a fine grid to feel like an active control surface. Motion is short, transform-based, and disabled for reduced-motion users. The result is more expressive than a business dashboard while staying readable: visitors can quickly see what is available and open the right service."
    }
  },
  "portal-online": {
    title: {
      de: "Portal online",
      en: "Portal online"
    },
    meta: {
      de: "Log 001 / Public Gateway",
      en: "Log 001 / Public Gateway"
    },
    teaser: {
      de: "Das öffentliche Gateway bündelt Voice, Auth und Realtime in einer Statusfläche.",
      en: "The public gateway brings Voice, Auth, and Realtime into one status surface."
    },
    body: {
      de: logbookEntries[0]!.body,
      en: "The portal is the public entry point for services on schnick-schnack.info. Its core boundary is deliberate: visitors see service names, status, update times, and actions, but not private containers, ports, database addresses, or routing. Health data is reduced server-side before it reaches the browser, keeping the page useful for orientation without exposing operational internals."
    }
  },
  "service-panels": {
    title: {
      de: "Service Panels erweitert",
      en: "Service panels expanded"
    },
    meta: {
      de: "Log 003 / Interaction Layer",
      en: "Log 003 / Interaction Layer"
    },
    teaser: {
      de: "Kacheln wurden zu Detailpanels mit vorbereiteter Action-Schicht und Refresh-Takt.",
      en: "Tiles became detail panels with a prepared action layer and refresh cadence."
    },
    body: {
      de: logbookEntries[2]!.body,
      en: "The cards now follow a shared interaction model: the front shows compact context, while the detail view contains status, measurements, and actions. The grid stays stable and the centered HUD panel can hold longer content without moving the whole page. The reverse refresh indicator shows how long the current health snapshot remains fresh."
    }
  }
};

function getLogEntry(entry: (typeof logbookEntries)[number], language: Language) {
  const localized = logbookTranslations[entry.id];
  return {
    body: localized?.body[language] ?? entry.body,
    meta: localized?.meta[language] ?? entry.meta,
    teaser: localized?.teaser[language] ?? entry.teaser,
    title: localized?.title[language] ?? entry.title
  };
}

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

function formatTime(value: string | null, language: Language): string {
  if (!value) {
    return translations[language].time.unchecked;
  }

  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
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

function StatusPill({ state, t }: { state: ServiceState; t: Translation }) {
  return <span className={`status-pill status-${state}`}>{t.status.service[state]}</span>;
}

function useHoverIntent(onIntent: () => void) {
  const timer = useRef<number | null>(null);

  const clearIntent = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const scheduleIntent = () => {
    clearIntent();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onIntent();
    }, HOVER_INTENT_MS);
  };

  useEffect(() => clearIntent, []);

  return { clearIntent, scheduleIntent };
}

function RefreshCountdown({ generatedAt, t }: { generatedAt: string | null; t: Translation }) {
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
    <div className="refresh-countdown" aria-label={t.refresh.aria(seconds)}>
      <span
        className="refresh-countdown__dial"
        style={{ "--refresh-progress": progress } as React.CSSProperties}
        aria-hidden="true"
      />
      <strong>{seconds}s</strong>
    </div>
  );
}

function ServiceInfoMetrics({ metrics, t }: { metrics: ServiceMetric[]; t: Translation }) {
  return (
    <div className="service-info-metrics" aria-label={t.detail.metrics}>
      {metrics.map((metric) => (
        <div className={`service-info-metric service-info-metric--${metric.tone ?? "neutral"}`} key={metric.id}>
          <span>{metric.label}</span>
          <strong>
            {String(metric.value)}
            {metric.unit ? <small>{metric.unit}</small> : null}
          </strong>
        </div>
      ))}
    </div>
  );
}

function ServiceInfoChart({ chart }: { chart: ServiceChart }) {
  const maxValue = Math.max(1, ...chart.points.map((point) => point.value));

  return (
    <div className="service-info-chart" aria-label={chart.title}>
      <div className="service-info-chart__heading">
        <span>{chart.title}</span>
        {chart.unit ? <small>{chart.unit}</small> : null}
      </div>
      <div className="service-info-chart__bars">
        {chart.points.map((point) => (
          <span
            aria-label={`${point.label}: ${point.value}${chart.unit ?? ""}`}
            key={`${point.label}-${point.value}`}
            style={{ "--bar-height": `${Math.max(6, Math.round((point.value / maxValue) * 100))}%` } as React.CSSProperties}
            title={`${point.label}: ${point.value}${chart.unit ?? ""}`}
          />
        ))}
      </div>
    </div>
  );
}

function ServiceCard({
  service,
  generatedAt,
  isActive,
  onOpen,
  language,
  t
}: {
  service: PublicService;
  generatedAt: string | null;
  isActive: boolean;
  onOpen: () => void;
  language: Language;
  t: Translation;
}) {
  const Icon = iconMap[service.icon];
  const cardClassName = `service-card${isActive ? " service-card--active" : ""}`;
  const { clearIntent, scheduleIntent } = useHoverIntent(onOpen);
  const description = serviceCopy[service.id]?.[language] ?? service.description;
  const message = serviceMessages[service.message]?.[language] ?? service.message;

  return (
    <article
      className={`${cardClassName}${isActive ? " is-selected" : ""}`}
      data-selectable-card
      aria-selected={isActive}
      onClick={onOpen}
      onMouseEnter={scheduleIntent}
      onMouseLeave={clearIntent}
      onFocus={onOpen}
      tabIndex={0}
      aria-label={`${service.name} ${t.aria.serviceDetails}`}
    >
      <div className="service-card__shell">
        <span className="selected-badge">FOCUS</span>
        <div className="service-card__face service-card__face--front">
          <div className="service-card__topline">
            <div className="service-icon" aria-hidden="true">
              <Icon size={24} strokeWidth={2} />
            </div>
            <StatusPill state={service.state} t={t} />
          </div>
          <div>
            <h3>{service.name}</h3>
            <p>{description}</p>
          </div>
          <div className="service-card__meta">
            <span>
              <Clock3 size={15} aria-hidden="true" />
              {formatTime(service.updatedAt, language)}
            </span>
            {service.responseMs !== null ? <span>{service.responseMs} ms</span> : <span>{message}</span>}
          </div>
          <RefreshCountdown generatedAt={generatedAt} t={t} />
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
  onOpen,
  language,
  t
}: {
  activeLogId: string;
  onOpen: (id: string) => void;
  language: Language;
  t: Translation;
}) {
  const activeEntry = (logbookEntries.find((entry) => entry.id === activeLogId) ?? logbookEntries[0])!;

  return (
    <section className="logbook" aria-labelledby="logbook-title">
      <div className="panel-heading">
        <div>
          <span>{t.logbook.eyebrow}</span>
          <h2 id="logbook-title">{t.logbook.title}</h2>
        </div>
        <small>{t.logbook.autopilot}</small>
      </div>
      <div className="logbook__layout">
        <div className="logbook__entries" data-card-group>
          {logbookEntries.map((entry) => (
            <LogCard
              entry={entry}
              isActive={activeLogId === entry.id}
              key={entry.id}
              language={language}
              onOpen={() => onOpen(entry.id)}
              t={t}
            />
          ))}
        </div>
        <LogDetail entry={activeEntry} language={language} t={t} />
      </div>
    </section>
  );
}

function LogCard({
  entry,
  isActive,
  onOpen,
  language,
  t
}: {
  entry: (typeof logbookEntries)[number];
  isActive: boolean;
  onOpen: () => void;
  language: Language;
  t: Translation;
}) {
  const { clearIntent, scheduleIntent } = useHoverIntent(onOpen);
  const localizedEntry = getLogEntry(entry, language);

  return (
    <article
      className={`log-entry${isActive ? " log-entry--active is-selected" : ""}`}
      data-selectable-card
      aria-selected={isActive}
      tabIndex={0}
      aria-label={`${localizedEntry.title} ${t.aria.serviceDetails}`}
      onMouseEnter={scheduleIntent}
      onMouseLeave={clearIntent}
      onFocus={onOpen}
      onClick={onOpen}
    >
      <span className="selected-badge">FOCUS</span>
      <span>{localizedEntry.meta}</span>
      <h3>{localizedEntry.title}</h3>
      <p>{localizedEntry.teaser}</p>
    </article>
  );
}

function LogDetail({ entry, language, t }: { entry: (typeof logbookEntries)[number]; language: Language; t: Translation }) {
  const localizedEntry = getLogEntry(entry, language);

  return (
    <article className="detail-panel detail-panel--news" aria-label={t.aria.newsDetail} data-active-detail key={entry.id}>
      <div className="detail-header">
        <div className="service-icon service-icon--detail" aria-hidden="true">
          <Activity size={24} strokeWidth={2} />
        </div>
        <div>
          <span>{localizedEntry.meta}</span>
          <h3 data-active-title>{localizedEntry.title}</h3>
        </div>
      </div>
      <p className="detail-copy detail-copy--long" data-active-description>{localizedEntry.body}</p>
    </article>
  );
}

function ServiceDetail({
  service,
  generatedAt,
  serviceInfo,
  language,
  t
}: {
  service: PublicService | undefined;
  generatedAt: string | null;
  serviceInfo: ServiceInfoResult | undefined;
  language: Language;
  t: Translation;
}) {
  if (!service) {
    return null;
  }

  const Icon = iconMap[service.icon];
  const infoStatus = serviceInfo?.status ?? service.infoState;
  const infoData = serviceInfo?.data ?? null;
  const serviceActions = infoData?.actions?.length ? infoData.actions : null;
  const description = serviceCopy[service.id]?.[language] ?? service.description;
  const message = serviceMessages[service.message]?.[language] ?? service.message;

  return (
    <article className="detail-panel detail-panel--service" aria-label={t.aria.moduleDetail} data-active-detail key={service.id}>
      <div className="detail-header">
        <div className="service-icon service-icon--detail" aria-hidden="true">
          <Icon size={24} strokeWidth={2} />
        </div>
        <div>
          <span>{t.detail.label}</span>
          <h3 data-active-title>{service.name}</h3>
        </div>
      </div>
      <p className="detail-copy" data-active-description>
        {infoData?.summary ?? description} {t.detail.intro}
      </p>
      <div className="detail-metrics">
        <span>{t.detail.status}: {t.status.service[service.state]}</span>
        <span>{t.detail.update}: {formatTime(service.updatedAt, language)}</span>
        <span>{service.responseMs !== null ? `${t.detail.response}: ${service.responseMs} ms` : message}</span>
        <span>{t.status.info[infoStatus]}</span>
      </div>
      <div className="service-info-zone">
        {infoData?.metrics?.length ? <ServiceInfoMetrics metrics={infoData.metrics} t={t} /> : null}
        {infoData?.charts?.[0] ? <ServiceInfoChart chart={infoData.charts[0]} /> : null}
        {!infoData ? (
          <p className="service-info-empty">
            {serviceInfo?.message ?? t.detail.emptyInfo}
          </p>
        ) : null}
      </div>
      <RefreshCountdown generatedAt={generatedAt} t={t} />
      <div className="service-actions" aria-label={`${service.name} ${t.aria.serviceActions}`}>
        {serviceActions ? (
          serviceActions.map((action) => (
            <a className="service-card__link" href={action.href} key={action.id}>
              {action.label}
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          ))
        ) : service.href ? (
          <a className="service-card__link" href={service.href}>
            {t.detail.open}
            <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        ) : (
          <span className="service-card__disabled">{t.detail.notAvailable}</span>
        )}
      </div>
    </article>
  );
}

function ThemeDock({
  activeTheme,
  onThemeChange,
  t
}: {
  activeTheme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  t: Translation;
}) {
  return (
    <aside className="theme-dock" aria-label={t.aria.themeSelection}>
      <div className="theme-dock__label">
        <SwatchBook size={15} aria-hidden="true" />
        <span>{t.theme.label}</span>
      </div>
      <div className="theme-dock__chips">
        {THEMES.map((theme) => (
          <button
            aria-label={t.theme.activate(theme.label)}
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

function LanguageSwitch({
  language,
  onLanguageChange,
  t
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: Translation;
}) {
  return (
    <div className="language-switch" aria-label={t.aria.languageSelection}>
      <span>
        <Languages size={15} aria-hidden="true" />
        {t.language.label}
      </span>
      <div>
        {(["de", "en"] as const).map((option) => (
          <button
            aria-label={t.language.switchTo[option]}
            aria-pressed={language === option}
            className={language === option ? "is-active" : ""}
            key={option}
            onClick={() => onLanguageChange(option)}
            type="button"
          >
            {option.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

function App() {
  const { snapshot, socketState } = useHealth();
  const serviceInfoSnapshot = useServiceInfo();
  const [activeTheme, setActiveTheme] = useState<ThemeId>(() => applyInitialTheme());
  const [language, setLanguage] = useState<Language>(() => applyInitialLanguage());
  const [activeLogId, setActiveLogId] = useState(logbookEntries[0]!.id);
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
  const lastPointerAt = useRef(Date.now());
  const services = snapshot?.services ?? [];
  const activeServices = services.filter((service) => service.state !== "planned");
  const plannedServices = services.filter((service) => service.state === "planned");
  const visibleServices = [...activeServices, ...plannedServices];
  const t = translations[language];

  const onlineCount = useMemo(
    () => activeServices.filter((service) => service.state === "online").length,
    [activeServices]
  );
  const activeService = visibleServices.find((service) => service.id === activeServiceId) ?? visibleServices[0];
  const serviceInfoById = useMemo(
    () => new Map((serviceInfoSnapshot?.services ?? []).map((serviceInfo) => [serviceInfo.serviceId, serviceInfo])),
    [serviceInfoSnapshot]
  );

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

  function changeLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    applyLanguage(nextLanguage);
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
            {t.hero.eyebrow}
          </div>
          <p className="domain-label" id="page-title">schnick-schnack.info</p>
          <Wordmark />
          <p>{t.hero.text}</p>
        </div>
        <div className="hero__controls">
          <aside className="status-panel" aria-label={t.aria.overallStatus}>
            <span className={`status-dot status-dot--${snapshot?.overall ?? "checking"}`} />
            <div>
              <strong>{snapshot ? t.status.overall[snapshot.overall] : t.status.overall.checking}</strong>
              <span>{t.services.onlineCount(onlineCount, activeServices.length || 3)}</span>
            </div>
          </aside>
          <LanguageSwitch language={language} onLanguageChange={changeLanguage} t={t} />
        </div>
      </section>

      <section className="live-strip" aria-label={t.aria.liveUpdates}>
        <div>
          <RefreshCw size={17} aria-hidden="true" className={socketState === "live" ? "spin-soft" : ""} />
          <span>{socketState === "live" ? t.live.live : t.live.fallback}</span>
        </div>
        <span>{t.live.lastUpdate}: {formatTime(snapshot?.generatedAt ?? null, language)}</span>
      </section>

      <Logbook
        activeLogId={activeLogId}
        language={language}
        onOpen={setActiveLogId}
        t={t}
      />

      <section className="section-block" aria-labelledby="services-title">
        <div className="panel-heading">
          <div>
            <h2 id="services-title">{t.services.title}</h2>
            <p>{t.services.subtitle}</p>
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
                  language={language}
                  onOpen={() => setActiveServiceId(service.id)}
                  t={t}
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
          <ServiceDetail
            service={activeService}
            generatedAt={snapshot?.generatedAt ?? null}
            language={language}
            serviceInfo={activeService ? serviceInfoById.get(activeService.id) : undefined}
            t={t}
          />
        </div>
      </section>
      <ThemeDock activeTheme={activeTheme} onThemeChange={changeTheme} t={t} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
