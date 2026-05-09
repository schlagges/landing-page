import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_DB_PATH = path.resolve("data", "landing-page.sqlite");

export type Database = DatabaseSync;

export function openDatabase(dbPath = process.env.SQLITE_DB_PATH ?? DEFAULT_DB_PATH): Database {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  initializeSchema(db);
  return db;
}

function initializeSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_requests (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      required_role TEXT NOT NULL,
      requester TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('requested', 'approved', 'rejected')),
      reviewer TEXT,
      source TEXT NOT NULL DEFAULT 'landing-page',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      reviewed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS role_requests_requester_idx
      ON role_requests(requester, created_at DESC);

    CREATE INDEX IF NOT EXISTS role_requests_status_idx
      ON role_requests(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS monitoring_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id TEXT NOT NULL,
      state TEXT NOT NULL,
      message TEXT NOT NULL,
      response_ms INTEGER,
      checked_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS monitoring_samples_service_checked_idx
      ON monitoring_samples(service_id, checked_at DESC);

    CREATE TABLE IF NOT EXISTS module_news (
      id TEXT PRIMARY KEY,
      external_event_id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      project_name TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('release', 'tag', 'merge')),
      title TEXT NOT NULL,
      url TEXT,
      event_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS module_news_event_at_idx
      ON module_news(event_at DESC);
  `);
}
