// Barrios de los comités (Idea 1, etapa 2). Detección a demanda con el GPS del vecino:
//   1. ¿El punto cae en un polígono de la base local, o hay un barrio sin polígono muy cerca? Ese es.
//   2. Si no, se pregunta a OpenStreetMap (nominatim.ts) el nombre del barrio y se le propone.
//   3. Si OSM no lo sabe (o no responde), el vecino elige uno cercano o escribe el suyo, y el barrio
//      queda guardado con su punto para los vecinos que vengan después.
// Los polígonos se cargan desde /ptpadmin/barrios (overpass.ts), no en la detección.
// La app solo propone: el vecino confirma o corrige, porque tiene que ser donde vive.
import { ValidationError } from "./contact";
import { db } from "./db";
import { leaveBarrioRoles } from "./delegates";
import { geometryContainsPoint, type GeoJsonMultiPolygon, type PointTuple } from "./geo";
import { closeHelpPostsOf } from "./help";
import { sanitize } from "./moderation";
import { lookupNominatim } from "./nominatim";
import type { OsmBarrio, OsmPoint } from "./overpass";

export type Barrio = { id: number; name: string; localidad: string | null; source: "osm" | "vecino" | "ptp" };

export type Detection = {
  barrio: Barrio | null;
  localidad: string | null;
  // Barrios cargados cerca del punto, para elegir uno antes de escribir uno nuevo.
  nearby: Barrio[];
  // Barrio que propone OSM y que todavía no está en la base: se ofrece ya escrito.
  suggestion: { name: string; localidad: string | null } | null;
  osmUnavailable: boolean;
};

const NEARBY_KM = 3;
// Un barrio sin polígono (punto de OSM o de vecinos) a menos de esto se propone como el del vecino.
const NEAR_POINT_KM = 0.4;
const NEARBY_LIMIT = 8;

type BarrioRow = { id: number; name: string; localidad: string | null; source: "osm" | "vecino" | "ptp" };

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

// Paso 1, sin polígono: el barrio más cercano entre los puntos de OSM y los de sus vecinos.
function findNearPointBarrio(lat: number, lon: number) {
  const delta = NEAR_POINT_KM / 111;
  const rows = db
    .prepare(
      `SELECT b.id, b.name, b.localidad, b.source, p.lat, p.lon
         FROM (SELECT id AS barrio_id, center_lat AS lat, center_lon AS lon FROM barrios WHERE geometry IS NULL
               UNION ALL
               SELECT barrio_id, latitude, longitude FROM barrio_points) p
         JOIN barrios b ON b.id = p.barrio_id
        WHERE b.geometry IS NULL AND p.lat BETWEEN ? AND ? AND p.lon BETWEEN ? AND ?`,
    )
    .all(lat - delta, lat + delta, lon - delta * 1.2, lon + delta * 1.2) as Array<
    BarrioRow & { lat: number; lon: number }
  >;
  const nearest = rows
    .map((row) => ({ row, km: kmBetween(lat, lon, row.lat, row.lon) }))
    .filter((item) => item.km <= NEAR_POINT_KM)
    .sort((a, b) => a.km - b.km)[0];
  return nearest ? toBarrio(nearest.row) : null;
}

const findOsmBarrioId = (osm: { osmType: string; osmId: number }) =>
  (
    db.prepare("SELECT id FROM barrios WHERE osm_type = ? AND osm_id = ?").get(osm.osmType, osm.osmId) as
      | { id: number }
      | undefined
  )?.id;

function insertOsmBarrio(osm: OsmBarrio, localidad: string | null) {
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
  return Number(result.lastInsertRowid);
}

// Un barrio de la misma localidad con el mismo nombre ("B° Villa Florida" = "Villa Florida").
function findSameBarrio(name: string, localidad: string | null) {
  const rows = db
    .prepare(
      `SELECT id, localidad, source, osm_id, geometry IS NOT NULL AS has_geometry FROM barrios
        WHERE normalized_name = ?`,
    )
    .all(normalizeBarrioName(name)) as Array<{
    id: number;
    localidad: string | null;
    source: Barrio["source"];
    osm_id: number | null;
    has_geometry: number;
  }>;
  const target = localidad === null ? null : normalizeBarrioName(localidad);
  return rows.filter(
    (row) => row.localidad === null || target === null || normalizeBarrioName(row.localidad) === target,
  );
}

function updateOsmPolygon(id: number, osm: OsmBarrio, localidad: string | null) {
  const box = bbox(osm.geometry);
  db.prepare(
    `UPDATE barrios SET name = ?, normalized_name = ?, localidad = ?, source = 'osm', osm_type = ?, osm_id = ?,
                        geometry = ?, min_lat = ?, min_lon = ?, max_lat = ?, max_lon = ?, center_lat = ?, center_lon = ?
      WHERE id = ?`,
  ).run(
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
    id,
  );
}

// Carga en bloque desde el panel. Polígonos: los que ya estaban se actualizan con el nombre y el
// polígono de OSM, y si hay uno del mismo nombre sin polígono (de un vecino o un punto de OSM) se le
// pone el polígono; el id no cambia, así los vecinos siguen en su barrio. Si el PTP ya lo dibujó a
// mano, queda el dibujado.
// Puntos (barrios que en OSM no tienen polígono): se guardan sin polígono, con el punto como centro,
// salvo que ya haya un barrio con ese nombre; a ese solo se le anota el id de OSM.
export function importOsmBarrios(barrios: OsmBarrio[], points: OsmPoint[], localidad: string | null) {
  const counts = { added: 0, updated: 0, pointsAdded: 0, pointsUpdated: 0 };
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const osm of barrios) {
      const id = findOsmBarrioId(osm);
      if (id !== undefined) {
        updateOsmPolygon(id, osm, localidad);
        counts.updated++;
        continue;
      }
      const same = findSameBarrio(osm.name, localidad);
      const withoutPolygon = same.find((row) => !row.has_geometry);
      if (withoutPolygon) {
        updateOsmPolygon(withoutPolygon.id, osm, localidad);
        counts.updated++;
      } else if (!same.some((row) => row.source === "ptp")) {
        insertOsmBarrio(osm, localidad);
        counts.added++;
      }
    }

    for (const point of points) {
      const id = findOsmBarrioId(point);
      if (id !== undefined) {
        // Si después alguien le dibujó el polígono, el punto ya no cambia nada.
        const result = db
          .prepare(
            `UPDATE barrios SET name = ?, normalized_name = ?, localidad = ?, center_lat = ?, center_lon = ?
              WHERE id = ? AND geometry IS NULL`,
          )
          .run(point.name, normalizeBarrioName(point.name), localidad, point.lat, point.lon, id);
        if (Number(result.changes) > 0) counts.pointsUpdated++;
        continue;
      }
      const same = findSameBarrio(point.name, localidad);
      if (same.length > 0) {
        const unlinked = same.find((row) => row.osm_id === null);
        if (unlinked) {
          db.prepare(
            `UPDATE barrios SET osm_type = ?, osm_id = ?, center_lat = COALESCE(center_lat, ?),
                                center_lon = COALESCE(center_lon, ?)
              WHERE id = ?`,
          ).run(point.osmType, point.osmId, point.lat, point.lon, unlinked.id);
          counts.pointsUpdated++;
        }
        continue;
      }
      db.prepare(
        `INSERT INTO barrios (name, normalized_name, localidad, source, osm_type, osm_id, center_lat, center_lon, created_at)
         VALUES (?, ?, ?, 'osm', ?, ?, ?, ?, ?)`,
      ).run(
        point.name,
        normalizeBarrioName(point.name),
        localidad,
        point.osmType,
        point.osmId,
        point.lat,
        point.lon,
        new Date().toISOString(),
      );
      counts.pointsAdded++;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return counts;
}

// ---------- Panel de administración (/ptpadmin/barrios) ----------

export type AdminBarrio = Barrio & {
  geometry: GeoJsonMultiPolygon | null;
  center: { lat: number; lon: number } | null;
  neighbors: number;
};

export function listBarriosForAdmin(): AdminBarrio[] {
  const rows = db
    .prepare(
      `SELECT b.id, b.name, b.localidad, b.source, b.geometry, b.center_lat, b.center_lon,
              (SELECT COUNT(*) FROM neighbors n WHERE n.barrio_id = b.id) AS neighbors
         FROM barrios b
        ORDER BY b.localidad IS NULL, b.localidad COLLATE NOCASE, b.name COLLATE NOCASE`,
    )
    .all() as Array<
    BarrioRow & { geometry: string | null; center_lat: number | null; center_lon: number | null; neighbors: number }
  >;
  return rows.map((row) => ({
    ...toBarrio(row),
    geometry: row.geometry ? (JSON.parse(row.geometry) as GeoJsonMultiPolygon) : null,
    center: row.center_lat !== null && row.center_lon !== null ? { lat: row.center_lat, lon: row.center_lon } : null,
    neighbors: row.neighbors,
  }));
}

// Solo se borran barrios sin vecinos: con vecinos dentro habría que mudarlos antes. Se van también
// sus puntos y lo que haya quedado del barrio (chat, ayuda mutua, novedades del barrio).
export function deleteEmptyBarrio(id: number) {
  const used = db.prepare("SELECT COUNT(*) AS total FROM neighbors WHERE barrio_id = ?").get(id) as { total: number };
  if (used.total > 0) throw new ValidationError("Ese barrio tiene vecinos: no se puede borrar.");

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const table of ["barrio_points", "chat_messages", "help_posts", "news_posts"]) {
      db.prepare(`DELETE FROM ${table} WHERE barrio_id = ?`).run(id);
    }
    db.prepare("DELETE FROM barrios WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

const MAX_DRAWN_POINTS = 500;

// El contorno dibujado en el mapa del panel: [lon, lat] de cada vértice, sin repetir el primero.
function parseDrawnRing(value: unknown): GeoJsonMultiPolygon {
  let points: unknown;
  try {
    points = typeof value === "string" ? JSON.parse(value) : null;
  } catch {
    points = null;
  }
  const valid =
    Array.isArray(points) &&
    points.length >= 3 &&
    points.length <= MAX_DRAWN_POINTS &&
    points.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]) &&
        Math.abs(point[0]) <= 180 &&
        Math.abs(point[1]) <= 90,
    );
  if (!valid) throw new ValidationError("Dibujá el contorno del barrio en el mapa: al menos 3 puntos.");

  const ring = (points as PointTuple[]).map(([lon, lat]): PointTuple => [lon, lat]);
  ring.push([...ring[0]]);
  return { type: "MultiPolygon", coordinates: [[ring]] };
}

// Barrio dibujado a mano desde el panel. Si ya hay uno con ese nombre en la localidad y no tiene
// polígono (lo escribió un vecino), se le pone el dibujado y sus vecinos quedan donde estaban.
export function createDrawnBarrio(nameInput: unknown, localidadInput: unknown, ringInput: unknown) {
  const name = requireBarrioName(nameInput, "el barrio");
  const localidad = requireBarrioName(localidadInput, "la localidad");
  const geometry = parseDrawnRing(ringInput);
  const normalized = normalizeBarrioName(name);

  const same = (
    db
      .prepare("SELECT id, name, localidad, source, geometry FROM barrios WHERE normalized_name = ?")
      .all(normalized) as Array<BarrioRow & { geometry: string | null }>
  ).find((row) => row.localidad === null || normalizeBarrioName(row.localidad) === normalizeBarrioName(localidad));
  if (same?.geometry) {
    throw new ValidationError(`${same.name} (${same.localidad ?? localidad}) ya tiene polígono. Borralo antes de dibujarlo de nuevo.`);
  }

  const box = bbox(geometry);
  const values = [
    JSON.stringify(geometry),
    box.minLat,
    box.minLon,
    box.maxLat,
    box.maxLon,
    (box.minLat + box.maxLat) / 2,
    (box.minLon + box.maxLon) / 2,
  ];
  if (same) {
    db.prepare(
      `UPDATE barrios SET source = 'ptp', localidad = ?, geometry = ?, min_lat = ?, min_lon = ?, max_lat = ?,
                          max_lon = ?, center_lat = ?, center_lon = ?
        WHERE id = ?`,
    ).run(localidad, ...values, same.id);
    return { barrio: getBarrio(same.id)!, replaced: true };
  }

  const result = db
    .prepare(
      `INSERT INTO barrios (name, normalized_name, localidad, source, geometry,
                            min_lat, min_lon, max_lat, max_lon, center_lat, center_lon, created_at)
       VALUES (?, ?, ?, 'ptp', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(name, normalized, localidad, ...values, new Date().toISOString());
  return { barrio: getBarrio(Number(result.lastInsertRowid))!, replaced: false };
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
  let barrio = findLocalBarrio(lat, lon) ?? findNearPointBarrio(lat, lon);
  let localidad = barrio?.localidad ?? null;
  let suggestion: Detection["suggestion"] = null;
  let osmUnavailable = false;

  if (!barrio) {
    const osm = await lookupNominatim(lat, lon);
    if (osm.status === "ok") {
      localidad = osm.localidad;
      if (osm.barrio) {
        // Si ya está en la base con el mismo nombre (sin polígono y lejos del punto), se usa ese.
        const same = findSameBarrio(osm.barrio, osm.localidad)[0];
        if (same) barrio = getBarrio(same.id);
        else suggestion = { name: osm.barrio, localidad: osm.localidad };
      }
    } else {
      osmUnavailable = true;
    }
  }

  return { barrio, localidad, nearby: nearbyBarrios(lat, lon, barrio?.id ?? null), suggestion, osmUnavailable };
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
  if (current?.barrio_id != null && current.barrio_id !== barrio.id) {
    leaveBarrioRoles(neighborId);
    closeHelpPostsOf(neighborId);
  }

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
