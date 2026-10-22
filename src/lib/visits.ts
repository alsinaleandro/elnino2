import { db } from "./db";

const VISITS = "visits";

// Suma una visita y devuelve el total; el upsert es una sola sentencia, así no se pierden visitas
// simultáneas.
export function registerVisit() {
  const row = db
    .prepare(
      `INSERT INTO counters (name, value) VALUES (?, 1)
       ON CONFLICT(name) DO UPDATE SET value = value + 1
       RETURNING value`,
    )
    .get(VISITS) as { value: number };
  return row.value;
}

export function getVisits() {
  const row = db.prepare("SELECT value FROM counters WHERE name = ?").get(VISITS) as
    | { value: number }
    | undefined;
  return row?.value ?? 0;
}

// Máximo de ubicaciones por IP en una hora: alcanza para varias personas detrás de la misma IP
// (los celulares suelen compartirla) y evita que alguien llene el mapa con puntos falsos.
const LOCATION_RATE_LIMIT = 30;
const LOCATION_RATE_WINDOW_MS = 60 * 60 * 1000;

export type VisitLocation = { latitude: number; longitude: number; accuracy: number | null; createdAt: string };

// Guarda la ubicación de una visita. Devuelve false si la IP superó el límite.
export function registerVisitLocation(
  location: { latitude: number; longitude: number; accuracy: number | null },
  ip: string | null,
) {
  if (ip) {
    const since = new Date(Date.now() - LOCATION_RATE_WINDOW_MS).toISOString();
    const row = db
      .prepare("SELECT COUNT(*) AS total FROM visit_locations WHERE ip = ? AND created_at > ?")
      .get(ip, since) as { total: number };
    if (row.total >= LOCATION_RATE_LIMIT) return false;
  }

  db.prepare(
    "INSERT INTO visit_locations (created_at, latitude, longitude, accuracy, ip) VALUES (?, ?, ?, ?, ?)",
  ).run(new Date().toISOString(), location.latitude, location.longitude, location.accuracy, ip);
  return true;
}

// node:sqlite devuelve filas sin prototipo, que React no deja pasar a un componente cliente: se
// copian a objetos comunes.
export function getVisitLocations(): VisitLocation[] {
  const rows = db
    .prepare(
      `SELECT latitude, longitude, accuracy, created_at AS createdAt
       FROM visit_locations ORDER BY created_at`,
    )
    .all() as VisitLocation[];
  return rows.map((row) => ({ ...row }));
}
