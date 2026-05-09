import type { Database } from "./db.js";
import { createHash } from "node:crypto";

export type ModuleNewsEventType = "release" | "tag" | "merge";

export type ModuleNewsRecord = {
  id: string;
  externalEventId: string;
  projectId: string;
  projectName: string;
  eventType: ModuleNewsEventType;
  title: string;
  url: string | null;
  eventAt: string;
  createdAt: string;
};

type ModuleNewsInput = Omit<ModuleNewsRecord, "id" | "createdAt">;

type ModuleNewsRow = {
  id: string;
  external_event_id: string;
  project_id: string;
  project_name: string;
  event_type: ModuleNewsEventType;
  title: string;
  url: string | null;
  event_at: string;
  created_at: string;
};

type GitLabProject = {
  id?: unknown;
  name?: unknown;
  path_with_namespace?: unknown;
  web_url?: unknown;
};

type GitLabAttributes = {
  action?: unknown;
  iid?: unknown;
  state?: unknown;
  title?: unknown;
  url?: unknown;
  updated_at?: unknown;
  created_at?: unknown;
  released_at?: unknown;
  merged_at?: unknown;
  tag?: unknown;
  name?: unknown;
};

type GitLabPayload = {
  object_kind?: unknown;
  event_type?: unknown;
  project?: GitLabProject;
  object_attributes?: GitLabAttributes;
  ref?: unknown;
  checkout_sha?: unknown;
  commits?: unknown;
  release?: GitLabAttributes;
};

const GITLAB_ALLOWED_ORIGIN = urlOrigin(process.env.GITLAB_BASE_URL ?? "https://labs.schnick-schnack.info");

function mapModuleNews(row: ModuleNewsRow): ModuleNewsRecord {
  return {
    id: row.id,
    externalEventId: row.external_event_id,
    projectId: row.project_id,
    projectName: row.project_name,
    eventType: row.event_type,
    title: row.title,
    url: row.url,
    eventAt: row.event_at,
    createdAt: row.created_at
  };
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return null;
  }

  return cleaned.slice(0, maxLength);
}

function urlOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function cleanUrl(value: unknown): string | null {
  const cleaned = cleanString(value, 500);
  if (!cleaned) {
    return null;
  }

  try {
    const url = new URL(cleaned);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== GITLAB_ALLOWED_ORIGIN) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function projectId(project: GitLabProject | undefined): string | null {
  return cleanString(project?.id, 120);
}

function projectName(project: GitLabProject | undefined): string | null {
  return cleanString(project?.name, 160) ?? cleanString(project?.path_with_namespace, 160);
}

function eventDate(...values: unknown[]): string | null {
  for (const value of values) {
    const cleaned = cleanString(value, 80);
    if (!cleaned) {
      continue;
    }

    const date = new Date(cleaned);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}

function tagName(value: unknown): string | null {
  return cleanString(value, 180)?.replace(/^refs\/tags\//, "") ?? null;
}

function moduleNewsId(externalEventId: string): string {
  const slug = externalEventId.toLowerCase().replace(/[^a-z0-9:._-]+/g, "-").slice(0, 140);
  const hash = createHash("sha256").update(externalEventId).digest("hex").slice(0, 12);
  return `${slug}-${hash}`;
}

export function listModuleNews(db: Database, limit = 50): ModuleNewsRecord[] {
  return (
    db.prepare("SELECT * FROM module_news ORDER BY event_at DESC LIMIT ?").all(Math.max(1, limit)) as ModuleNewsRow[]
  ).map(mapModuleNews);
}

export function saveModuleNews(db: Database, news: ModuleNewsInput): { news: ModuleNewsRecord; created: boolean } {
  const id = moduleNewsId(news.externalEventId);
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO module_news (
      id, external_event_id, project_id, project_name, event_type, title, url, event_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, news.externalEventId, news.projectId, news.projectName, news.eventType, news.title, news.url, news.eventAt, now);

  const row = db.prepare("SELECT * FROM module_news WHERE external_event_id = ?").get(news.externalEventId) as ModuleNewsRow;
  if (!row) {
    throw new Error(`Module news insert was ignored without existing row for external event ${news.externalEventId}.`);
  }

  return { news: mapModuleNews(row), created: Number(result.changes) > 0 };
}

export function normalizeGitLabEvent(payload: unknown): ModuleNewsInput | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const event = payload as GitLabPayload;
  const project = event.project;
  const projectIdValue = projectId(project);
  const projectNameValue = projectName(project);
  if (!projectIdValue || !projectNameValue) {
    return null;
  }

  if (event.object_kind === "merge_request" || event.event_type === "merge_request") {
    const attributes = event.object_attributes;
    if (attributes?.state !== "merged") {
      return null;
    }

    const iid = cleanString(attributes.iid, 80);
    const title = cleanString(attributes.title, 220);
    const eventAt = eventDate(attributes.merged_at, attributes.updated_at, attributes.created_at);
    if (!iid || !title || !eventAt) {
      return null;
    }

    return {
      externalEventId: `gitlab:merge:${projectIdValue}:${iid}`,
      projectId: projectIdValue,
      projectName: projectNameValue,
      eventType: "merge",
      title,
      url: cleanUrl(attributes.url),
      eventAt
    };
  }

  if (event.object_kind === "tag_push") {
    const checkoutSha = cleanString(event.checkout_sha, 80);
    if (!checkoutSha || /^0+$/.test(checkoutSha)) {
      return null;
    }

    const tag = tagName(event.ref);
    const eventAt = eventDate((event.commits as Array<{ timestamp?: unknown }> | undefined)?.[0]?.timestamp, new Date().toISOString());
    if (!tag || !eventAt) {
      return null;
    }

    return {
      externalEventId: `gitlab:tag:${projectIdValue}:${tag}`,
      projectId: projectIdValue,
      projectName: projectNameValue,
      eventType: "tag",
      title: `Tag ${tag}`,
      url: cleanUrl(project?.web_url),
      eventAt
    };
  }

  if (event.object_kind === "release" || event.event_type === "release") {
    const release = event.release ?? event.object_attributes;
    if (cleanString(release?.action, 40) === "delete" || cleanString((event as GitLabAttributes).action, 40) === "delete") {
      return null;
    }

    const tag = tagName(release?.tag) ?? tagName((event as GitLabAttributes).tag);
    const title = cleanString(release?.name, 220) ?? cleanString((event as GitLabAttributes).name, 220) ?? (tag ? `Release ${tag}` : null);
    const eventAt = eventDate(
      release?.released_at,
      (event as GitLabAttributes).released_at,
      release?.updated_at,
      (event as GitLabAttributes).updated_at,
      release?.created_at,
      (event as GitLabAttributes).created_at,
      new Date().toISOString()
    );
    if (!tag || !title || !eventAt) {
      return null;
    }

    return {
      externalEventId: `gitlab:release:${projectIdValue}:${tag}`,
      projectId: projectIdValue,
      projectName: projectNameValue,
      eventType: "release",
      title,
      url: cleanUrl(release?.url) ?? cleanUrl((event as GitLabAttributes).url) ?? cleanUrl(project?.web_url),
      eventAt
    };
  }

  return null;
}
