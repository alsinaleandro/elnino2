// Reportes colaborativos de inundaciones (Idea 2): cada vecino que se sumó a un comité marca un punto
// (por defecto, donde está) como sin agua, anegado o intransitable. Tiene un solo punto vigente: si
// reporta de nuevo, se reemplaza el anterior. En el mapa los puntos se ven sin el nombre del autor;
// el PTP Chaco ve quién reportó cada uno para poder moderar (/ptpadmin/inundaciones).
//
// La capa continua es una interpolación por vecino más cercano: cada lugar toma el estado del
// reporte más cercano, hasta FLOOD_ZONE_RADIUS_METERS de distancia (más lejos no hay dato). Es un
// diagrama de Voronoi recortado a un círculo alrededor de cada punto; con cientos de reportes se
// calcula en milisegundos.
import { ValidationError } from "./contact";
import { db } from "./db";
import {
  DRY_HOURS,
  FLOOD_CAUSE_INFO,
  FLOOD_CAUSES,
  FLOOD_STATUSES,
  FLOOD_ZONE_RADIUS_METERS,
  type FloodCause,
  type FloodReport,
  type FloodStatus,
  type FloodZones,
} from "./floodKinds";

// La provincia del Chaco con un margen: los reportes tienen que caer adentro.
const CHACO = { minLat: -28.2, maxLat: -23.8, minLon: -63.6, maxLon: -58.0 };
// Como mucho 10 reportes por hora por vecino (cada uno reemplaza al anterior).
const REPORTS_PER_HOUR = 10;
// Lados del polígono que aproxima el círculo de cada punto.
const CIRCLE_SIDES = 32;

const METERS_PER_DEGREE_LAT = 110_574;
const metersPerDegreeLon = (latitude: number) => 111_320 * Math.cos((latitude * Math.PI) / 180);

type Row = {
  id: number;
  neighbor_id: number;
  latitude: number;
  longitude: number;
  status: FloodStatus;
  cause: FloodCause | null;
  created_at: string;
  expires_at: string;
};

const ACTIVE = "removed_at IS NULL AND expires_at > ?";

function activeRows() {
  return db
    .prepare(
      `SELECT id, neighbor_id, latitude, longitude, status, cause, created_at, expires_at
         FROM flood_reports WHERE ${ACTIVE} ORDER BY id`,
    )
    .all(new Date().toISOString()) as Row[];
}

// Lo que se publica en el mapa: sin autor, y con el punto redondeado a unos 10 metros.
const round = (value: number) => Math.round(value * 10_000) / 10_000;

const toReport = (row: Row, viewerId: number | null): FloodReport => ({
  id: row.id,
  latitude: round(row.latitude),
  longitude: round(row.longitude),
  status: row.status,
  cause: row.cause,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  mine: row.neighbor_id === viewerId,
});

// La capa continua se recalcula solo cuando cambian los reportes vigentes.
let zonesCache: { key: string; zones: FloodZones } | null = null;

export function listFloods(viewerId: number | null) {
  const rows = activeRows();
  const reports = rows.map((row) => toReport(row, viewerId));
  const key = rows.map((row) => row.id).join(",");
  if (zonesCache?.key !== key) zonesCache = { key, zones: floodZones(reports) };
  return { reports, zones: zonesCache.zones };
}

// ---------- Capa continua ----------

type Vec = [number, number];

// Recorta un polígono convexo al semiplano de los puntos x con x·n <= limit (Sutherland–Hodgman).
function clip(polygon: Vec[], n: Vec, limit: number): Vec[] {
  const result: Vec[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const sideA = a[0] * n[0] + a[1] * n[1] - limit;
    const sideB = b[0] * n[0] + b[1] * n[1] - limit;
    if (sideA <= 0) result.push(a);
    if ((sideA < 0 && sideB > 0) || (sideA > 0 && sideB < 0)) {
      const t = sideA / (sideA - sideB);
      result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return result;
}

export function floodZones(reports: FloodReport[]): FloodZones {
  const radius = FLOOD_ZONE_RADIUS_METERS;
  // Grilla de celdas de 2 radios: solo los reportes de las celdas vecinas pueden recortar un círculo.
  const cellLat = (2 * radius) / METERS_PER_DEGREE_LAT;
  const cellLon = (2 * radius) / metersPerDegreeLon(-27);
  const cellKey = (lat: number, lon: number) => `${Math.floor(lat / cellLat)}:${Math.floor(lon / cellLon)}`;
  const grid = new Map<string, FloodReport[]>();
  for (const report of reports) {
    const key = cellKey(report.latitude, report.longitude);
    grid.set(key, [...(grid.get(key) ?? []), report]);
  }

  const circle: Vec[] = Array.from({ length: CIRCLE_SIDES }, (_, i) => {
    const angle = (2 * Math.PI * i) / CIRCLE_SIDES;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });

  const features: FloodZones["features"] = [];
  for (const report of reports) {
    // Metros alrededor del reporte (x al este, y al norte).
    const lonScale = metersPerDegreeLon(report.latitude);
    const toLocal = (other: FloodReport): Vec => [
      (other.longitude - report.longitude) * lonScale,
      (other.latitude - report.latitude) * METERS_PER_DEGREE_LAT,
    ];

    let cell: Vec[] = circle;
    const row = Math.floor(report.latitude / cellLat);
    const col = Math.floor(report.longitude / cellLon);
    for (let dr = -1; dr <= 1 && cell.length > 0; dr++) {
      for (let dc = -1; dc <= 1 && cell.length > 0; dc++) {
        for (const other of grid.get(`${row + dr}:${col + dc}`) ?? []) {
          if (other.id === report.id) continue;
          const q = toLocal(other);
          const distance2 = q[0] * q[0] + q[1] * q[1];
          if (distance2 > 4 * radius * radius) continue;
          // En el mismo lugar manda el reporte más nuevo.
          if (distance2 < 1) {
            if (other.id > report.id) cell = [];
            continue;
          }
          // Lado del reporte en la mediatriz entre los dos puntos.
          cell = clip(cell, q, distance2 / 2);
          if (cell.length === 0) break;
        }
      }
    }
    if (cell.length < 3) continue;

    const ring = cell.map(([x, y]) => [
      round6(report.longitude + x / lonScale),
      round6(report.latitude + y / METERS_PER_DEGREE_LAT),
    ]);
    ring.push(ring[0]);
    features.push({
      type: "Feature",
      properties: { status: report.status },
      geometry: { type: "Polygon", coordinates: [ring] },
    });
  }
  return { type: "FeatureCollection", features };
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

// ---------- Reportar ----------

function requireNumber(value: unknown, min: number, max: number) {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new ValidationError("El punto tiene que estar en la provincia del Chaco.");
  }
  return number;
}

export function addFloodReport(
  neighborId: number,
  input: { latitude?: unknown; longitude?: unknown; accuracy?: unknown; status?: unknown; cause?: unknown },
) {
  const latitude = requireNumber(input.latitude, CHACO.minLat, CHACO.maxLat);
  const longitude = requireNumber(input.longitude, CHACO.minLon, CHACO.maxLon);
  const accuracy =
    typeof input.accuracy === "number" && Number.isFinite(input.accuracy) && input.accuracy >= 0
      ? Math.round(input.accuracy)
      : null;
  if (!FLOOD_STATUSES.includes(input.status as FloodStatus)) throw new ValidationError("Elegí cómo está la zona.");
  const status = input.status as FloodStatus;

  let cause: FloodCause | null = null;
  if (status !== "seco") {
    if (!FLOOD_CAUSES.includes(input.cause as FloodCause)) {
      throw new ValidationError("Elegí si el agua es por lluvia o por crecida del río.");
    }
    cause = input.cause as FloodCause;
  }

  const now = Date.now();
  const { count } = db
    .prepare("SELECT COUNT(*) AS count FROM flood_reports WHERE neighbor_id = ? AND created_at > ?")
    .get(neighborId, new Date(now - 60 * 60 * 1000).toISOString()) as { count: number };
  if (count >= REPORTS_PER_HOUR) throw new ValidationError("Reportaste muchas veces en la última hora. Esperá un rato.");

  const hours = cause ? FLOOD_CAUSE_INFO[cause].hours : DRY_HOURS;
  const nowIso = new Date(now).toISOString();
  removeFloodReport(neighborId);
  db.prepare(
    `INSERT INTO flood_reports (neighbor_id, latitude, longitude, accuracy, status, cause, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(neighborId, latitude, longitude, accuracy, status, cause, nowIso, new Date(now + hours * 3600 * 1000).toISOString());
}

// El autor saca su punto del mapa (queda en el historial).
export function removeFloodReport(neighborId: number) {
  db.prepare("UPDATE flood_reports SET removed_at = ? WHERE neighbor_id = ? AND removed_at IS NULL").run(
    new Date().toISOString(),
    neighborId,
  );
}

// ---------- Panel del PTP ----------

export type AdminFloodReport = FloodReport & {
  author: string;
  whatsapp: string | null;
  barrio: string | null;
  accuracy: number | null;
};

export function listFloodsForAdmin(): AdminFloodReport[] {
  const rows = db
    .prepare(
      `SELECT f.id, f.neighbor_id, f.latitude, f.longitude, f.accuracy, f.status, f.cause, f.created_at, f.expires_at,
              n.first_name, n.last_name, n.whatsapp, b.name AS barrio
         FROM flood_reports f
         JOIN neighbors n ON n.id = f.neighbor_id
         LEFT JOIN barrios b ON b.id = n.barrio_id
        WHERE f.removed_at IS NULL AND f.expires_at > ?
        ORDER BY f.id DESC`,
    )
    .all(new Date().toISOString()) as Array<
    Row & { accuracy: number | null; first_name: string; last_name: string; whatsapp: string | null; barrio: string | null }
  >;
  return rows.map((row) => ({
    ...toReport(row, null),
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    author: `${row.first_name} ${row.last_name}`,
    whatsapp: row.whatsapp,
    barrio: row.barrio,
  }));
}

// Un reporte falso o malintencionado se borra del todo.
export function deleteFloodReport(id: number) {
  db.prepare("DELETE FROM flood_reports WHERE id = ?").run(id);
}
