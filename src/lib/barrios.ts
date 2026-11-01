// Barrios de los comités (Idea 1, etapa 2). Detección a demanda con el GPS del vecino:
//   1. ¿El punto cae en un polígono de la base local? Ese es el barrio.
//   2. Si no, se pregunta a OpenStreetMap (overpass.ts) y, si tiene el polígono, se copia a la base.
//   3. Si OSM no lo tiene (o no responde), el vecino elige uno cercano o escribe el suyo.
// La app solo propone: el vecino confirma o corrige, porque tiene que ser donde vive.
import { ValidationError } from "./contact";
import { db } from "./db";
import { leaveBarrioRoles } from "./delegates";
import { geometryContainsPoint, type GeoJsonMultiPolygon } from "./geo";
import { sanitize } from "./moderation";
import { lookupOsm, type OsmBarrio } from "./overpass";

export type Barrio = { id: number; name: string; localidad: string | null; source: "osm" | "vecino" };

export type Detection = {
  barrio: Barrio | null;
  localidad: string | null;
  // Barrios cargados cerca del punto, para elegir uno antes de escribir uno nuevo.
  nearby: Barrio[];
  osmUnavailable: boolean;
};

const NEARBY_KM = 3;
const NEARBY_LIMIT = 8;

type BarrioRow = { id: number; name: string; localidad: string | null; source: "osm" | "vecino" };

const toBarrio = ({ id, name, localidad, source }: BarrioRow): Barrio => ({ id, name, localidad, source });

// "B° Villa Prosperidad", "barrio V. Prosperidad" y "Villa Prosperidad" quedan iguales.
export function normalizeBarrioName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(barrio|b|bo|bº|b°)\s+/, "")
    .replace(/\bv\b/g, "villa")
    .replace(/\s+/g, " ");
}

const kmBetween = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.hypot(x, lat2 - lat1) * 111.32;
};

export function getBarrio(id: number) {
  const row = db.prepare("SELECT id, name, localidad, source FROM barrios WHERE id = ?").get(id) as
    | BarrioRow
    | undefined;
  return row ? toBarrio(row) : null;
}

// Paso 1: polígonos de la base local cuyo rectángulo contiene el punto; el más chico que lo contenga.
function findLocalBarrio(lat: number, lon: number) {
  const rows = db
    .prepare(
      `SELECT id, name, localidad, source, geometry FROM barrios
        WHERE geometry IS NOT NULL AND min_lat <= ? AND max_lat >= ? AND min_lon <= ? AND max_lon >= ?
        ORDER BY (max_lat - min_lat) * (max_lon - min_lon)`,
    )
    .all(lat, lat, lon, lon) as Array<BarrioRow & { geometry: string }>;
  const match = rows.find((row) => geometryContainsPoint(JSON.parse(row.geometry), [lon, lat]));
  return match ? toBarrio(match) : null;
}

// Paso 2: copia a la base el polígono que devolvió OSM (si ya estaba, lo reutiliza).
function saveOsmBarrio(osm: OsmBarrio, localidad: string | null) {
  const existing = db.prepare("SELECT id FROM barrios WHERE osm_type = ? AND osm_id = ?").get(osm.osmType, osm.osmId) as
    | { id: number }
    | undefined;
  if (existing) return getBarrio(existing.id)!;

  const box = bbox(osm.geometry);
  const result = db
    .prepare(
      `INSERT INTO barrios (name, normalized_name, localidad, source, osm_type, osm_id, geometry,
                            min_lat, min_lon, max_lat, max_lon, center_lat, center_lon, created_at)
       VALUES (?, ?, ?, 'osm', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      osm.name,
      normalizeBarrioName(osm.name),
      localidad,
      osm.osmType,
      osm.osmId,
      JSON.stringify(osm.geometry),
      box.minLat,
      box.minLon,
      box.maxLat,
      box.maxLon,
      (box.minLat + box.maxLat) / 2,
      (box.minLon + box.maxLon) / 2,
      new Date().toISOString(),
    );
  return getBarrio(Number(result.lastInsertRowid))!;
}

function bbox(geometry: GeoJsonMultiPolygon) {
  const points = geometry.coordinates.flatMap((polygon) => polygon[0]);
  const lons = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) };
}

function nearbyBarrios(lat: number, lon: number, excludeId: number | null) {
  const delta = NEARBY_KM / 111;
  const rows = db
    .prepare(
      `SELECT id, name, localidad, source, center_lat, center_lon FROM barrios
        WHERE center_lat BETWEEN ? AND ? AND center_lon BETWEEN ? AND ?`,
    )
    .all(lat - delta, lat + delta, lon - delta * 1.2, lon + delta * 1.2) as Array<
    BarrioRow & { center_lat: number; center_lon: number }
  >;
  return rows
    .filter((row) => row.id !== excludeId)
    .map((row) => ({ row, km: kmBetween(lat, lon, row.center_lat, row.center_lon) }))
    .filter((item) => item.km <= NEARBY_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, NEARBY_LIMIT)
    .map((item) => toBarrio(item.row));
}

export async function detectBarrio(lat: number, lon: number): Promise<Detection> {
  let barrio = findLocalBarrio(lat, lon);
  let localidad = barrio?.localidad ?? null;
  let osmUnavailable = false;

  if (!barrio) {
    const osm = await lookupOsm(lat, lon);
    if (osm.status === "ok") {
      localidad = osm.localidad;
      if (osm.barrio) barrio = saveOsmBarrio(osm.barrio, osm.localidad);
    } else {
      osmUnavailable = true;
    }
  }

  return { barrio, localidad, nearby: nearbyBarrios(lat, lon, barrio?.id ?? null), osmUnavailable };
}

function requireBarrioName(value: unknown, label: string) {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (name.length < 2 || name.length > 60 || !/^[\p{L}\p{N}' .°º-]+$/u.test(name)) {
    throw new ValidationError(`Revisá el nombre de ${label}: letras y números, entre 2 y 60.`);
  }
  if (sanitize(name) !== name) throw new ValidationError(`Revisá el nombre de ${label}.`);
  return name;
}

// Paso 3: el barrio que escribió el vecino. Si ya hay uno con el mismo nombre en esa localidad, se
// usa ese en vez de crear un duplicado.
export function findOrCreateBarrio(nameInput: unknown, localidadInput: unknown, point: { lat: number; lon: number } | null) {
  const name = requireBarrioName(nameInput, "tu barrio");
  const localidad = requireBarrioName(localidadInput, "tu localidad");
  const normalized = normalizeBarrioName(name);

  const candidates = db
    .prepare("SELECT id, name, localidad, source FROM barrios WHERE normalized_name = ?")
    .all(normalized) as BarrioRow[];
  const same = candidates.find(
    (row) => row.localidad === null || normalizeBarrioName(row.localidad) === normalizeBarrioName(localidad),
  );
  if (same) return toBarrio(same);

  const result = db
    .prepare(
      `INSERT INTO barrios (name, normalized_name, localidad, source, center_lat, center_lon, created_at)
       VALUES (?, ?, ?, 'vecino', ?, ?, ?)`,
    )
    .run(name, normalized, localidad, point?.lat ?? null, point?.lon ?? null, new Date().toISOString());
  return getBarrio(Number(result.lastInsertRowid))!;
}

// Guarda el barrio del vecino. En los barrios sin polígono se suma su punto (sin decir de quién es).
export function setNeighborBarrio(neighborId: number, barrio: Barrio, point: { lat: number; lon: number } | null) {
  const current = db.prepare("SELECT barrio_id FROM neighbors WHERE id = ?").get(neighborId) as
    | { barrio_id: number | null }
    | undefined;
  if (current?.barrio_id != null && current.barrio_id !== barrio.id) leaveBarrioRoles(neighborId);

  db.prepare("UPDATE neighbors SET barrio_id = ?, updated_at = ? WHERE id = ?").run(
    barrio.id,
    new Date().toISOString(),
    neighborId,
  );
  if (barrio.source === "vecino" && point) {
    db.prepare("INSERT INTO barrio_points (barrio_id, latitude, longitude, created_at) VALUES (?, ?, ?, ?)").run(
      barrio.id,
      point.lat,
      point.lon,
      new Date().toISOString(),
    );
    // El primer punto de un barrio sin ubicación pasa a ser su centro.
    db.prepare("UPDATE barrios SET center_lat = ?, center_lon = ? WHERE id = ? AND center_lat IS NULL").run(
      point.lat,
      point.lon,
      barrio.id,
    );
  }
}
