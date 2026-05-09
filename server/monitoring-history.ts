import type { Database } from "./db.js";

const DEFAULT_MONITORING_HISTORY_LIMIT_PER_SERVICE = 720;

type ServiceState = "online" | "degraded" | "offline" | "checking" | "planned";

export type MonitoringSampleInput = {
  serviceId: string;
  state: ServiceState;
  message: string;
  responseMs: number | null;
  checkedAt: string;
};

export type MonitoringSample = MonitoringSampleInput & {
  id: number;
};

type MonitoringSampleRow = {
  id: number;
  service_id: string;
  state: ServiceState;
  message: string;
  response_ms: number | null;
  checked_at: string;
};

export type MonitoringHistoryService = {
  serviceId: string;
  samples: MonitoringSample[];
  incidents: MonitoringSample[];
};

function mapSample(row: MonitoringSampleRow): MonitoringSample {
  return {
    id: row.id,
    serviceId: row.service_id,
    state: row.state,
    message: row.message,
    responseMs: row.response_ms,
    checkedAt: row.checked_at
  };
}

export function monitoringHistoryLimitPerService(): number {
  const configured = Number.parseInt(process.env.MONITORING_HISTORY_LIMIT_PER_SERVICE ?? "", 10);
  if (!Number.isFinite(configured) || configured < 1) {
    return DEFAULT_MONITORING_HISTORY_LIMIT_PER_SERVICE;
  }
  return configured;
}

export function insertMonitoringSamples(db: Database, samples: MonitoringSampleInput[]): void {
  const insertStatement = db.prepare(
    "INSERT INTO monitoring_samples (service_id, state, message, response_ms, checked_at) VALUES (?, ?, ?, ?, ?)"
  );
  const pruneStatement = db.prepare(
    `DELETE FROM monitoring_samples
     WHERE service_id = ?
       AND id NOT IN (
         SELECT id FROM monitoring_samples
         WHERE service_id = ?
         ORDER BY checked_at DESC, id DESC
         LIMIT ?
       )`
  );
  const retentionLimit = monitoringHistoryLimitPerService();

  db.exec("BEGIN");
  try {
    for (const sample of samples) {
      insertStatement.run(sample.serviceId, sample.state, sample.message, sample.responseMs, sample.checkedAt);
      pruneStatement.run(sample.serviceId, sample.serviceId, retentionLimit);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function monitoringHistory(db: Database, serviceIds: string[], limitPerService = 24): MonitoringHistoryService[] {
  const samplesStatement = db.prepare(
    `SELECT * FROM monitoring_samples
     WHERE service_id = ?
     ORDER BY checked_at DESC, id DESC
     LIMIT ?`
  );
  const incidentsStatement = db.prepare(
    `SELECT * FROM monitoring_samples
     WHERE service_id = ?
       AND state IN ('offline', 'degraded')
     ORDER BY checked_at DESC, id DESC
     LIMIT 6`
  );

  return serviceIds.map((serviceId) => {
    const samples = (samplesStatement.all(serviceId, limitPerService) as MonitoringSampleRow[]).map(mapSample);
    const incidents = (incidentsStatement.all(serviceId) as MonitoringSampleRow[]).map(mapSample);
    return {
      serviceId,
      samples,
      incidents
    };
  });
}
