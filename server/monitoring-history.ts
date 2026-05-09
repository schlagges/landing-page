import type { Database } from "./db.js";

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

export function insertMonitoringSamples(db: Database, samples: MonitoringSampleInput[]): void {
  const statement = db.prepare(
    "INSERT INTO monitoring_samples (service_id, state, message, response_ms, checked_at) VALUES (?, ?, ?, ?, ?)"
  );

  for (const sample of samples) {
    statement.run(sample.serviceId, sample.state, sample.message, sample.responseMs, sample.checkedAt);
  }
}

export function monitoringHistory(db: Database, serviceIds: string[], limitPerService = 24): MonitoringHistoryService[] {
  const statement = db.prepare(
    `SELECT * FROM monitoring_samples
     WHERE service_id = ?
     ORDER BY checked_at DESC
     LIMIT ?`
  );

  return serviceIds.map((serviceId) => {
    const samples = (statement.all(serviceId, limitPerService) as MonitoringSampleRow[]).map(mapSample);
    return {
      serviceId,
      samples,
      incidents: samples.filter((sample) => sample.state === "offline" || sample.state === "degraded").slice(0, 6)
    };
  });
}
