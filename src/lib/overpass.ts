// Carga desde OpenStreetMap (Overpass API) todos los barrios de una localidad, con sus polígonos, para
// el panel /ptpadmin/barrios. Overpass es un servicio gratuito con límites de uso que a veces no
// responde: se prueban los servidores de OVERPASS_URL (separados por comas) en orden y se reintenta.
// La detección del barrio de cada vecino no lo usa (ver nominatim.ts).
// Datos © OpenStreetMap contributors, licencia ODbL.
import { geometryContainsPoint, type GeoJsonMultiPolygon, type PointTuple } from "./geo";

const SERVERS = (
  process.env.OVERPASS_URL ??
  "https://overpass-api.de/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

export type OsmBarrio = {
  osmType: "way" | "relation";
  osmId: number;
  name: string;
  geometry: GeoJsonMultiPolygon;
};

type LatLon = { lat: number; lon: number };
type Element = {
  type: "area" | "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  // Solo los nodos: su ubicación.
  lat?: number;
  lon?: number;
  geometry?: LatLon[];
  members?: Array<{ type: string; role: string; geometry?: LatLon[] }>;
};

const toTuple = ({ lat, lon }: LatLon): PointTuple => [lon, lat];
const samePoint = (a: PointTuple, b: PointTuple) => a[0] === b[0] && a[1] === b[1];

// Una relación trae sus bordes en tramos (una vía por tramo): se unen punta con punta hasta
// cerrar cada anillo. Los tramos que no cierran se descartan.
function assembleRings(segments: PointTuple[][]) {
  const pending = segments.filter((segment) => segment.length > 1).map((segment) => [...segment]);
  const rings: PointTuple[][] = [];

  while (pending.length) {
    const ring = pending.shift()!;
    while (!samePoint(ring[0], ring[ring.length - 1])) {
      const end = ring[ring.length - 1];
      const index = pending.findIndex(
        (segment) => samePoint(segment[0], end) || samePoint(segment[segment.length - 1], end),
      );
      if (index === -1) break;
      const [next] = pending.splice(index, 1);
      if (!samePoint(next[0], end)) next.reverse();
      ring.push(...next.slice(1));
    }
    if (ring.length >= 4 && samePoint(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

function toMultiPolygon(element: Element): GeoJsonMultiPolygon | null {
  if (element.type === "way") {
    const ring = (element.geometry ?? []).map(toTuple);
    if (ring.length < 4 || !samePoint(ring[0], ring[ring.length - 1])) return null;
    return { type: "MultiPolygon", coordinates: [[ring]] };
  }

  const members = element.members ?? [];
  const ringsOf = (role: string) =>
    assembleRings(
      members
        .filter((member) => member.type === "way" && (member.role === role || (role === "outer" && member.role === "")))
        .map((member) => (member.geometry ?? []).map(toTuple)),
    );

  const polygons: PointTuple[][][] = ringsOf("outer").map((outer) => [outer]);
  if (!polygons.length) return null;
  // Cada hueco va con el anillo exterior que lo contiene.
  for (const inner of ringsOf("inner")) {
    const owner = polygons.find((polygon) =>
      geometryContainsPoint({ type: "Polygon", coordinates: [polygon[0]] }, inner[0]),
    );
    owner?.push(inner);
  }
  return { type: "MultiPolygon", coordinates: polygons };
}

// "Municipio de Resistencia" → "Resistencia".
const cleanLocalidad = (name: string) => name.replace(/^(municipio|municipalidad|comuna|ciudad) de /i, "").trim();

// Prueba los servidores en orden; null si ninguno contestó a tiempo.
async function runQuery(data: string, timeoutMs: number): Promise<Element[] | null> {
  for (const server of SERVERS) {
    try {
      const response = await fetch(server, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "elnino2 (ptpchaco.org.ar)" },
        body: new URLSearchParams({ data }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { elements } = (await response.json()) as { elements: Element[] };
      return elements;
    } catch (error) {
      console.warn(`[barrios] Overpass no respondió (${server}):`, error instanceof Error ? error.message : error);
    }
  }
  return null;
}

// ---------- Carga de todos los barrios de una localidad (desde /ptpadmin/barrios) ----------

// Solo se buscan localidades del Chaco, para no confundir "Fontana" o "Resistencia" con otras del país.
const PROVINCE_ISO = "AR-H";

// Desde el panel se puede esperar mucho: la carga corre en segundo plano.
const LOCALIDAD_TIMEOUT_MS = 150_000;
// Cuando Overpass está saturado contesta al instante con 502 o 504 ("at capacity") y pide reintentar
// con esperas crecientes: 15 s, 30 s, 60 s, 2 min y 2 min (casi 6 minutos en total).
const LOCALIDAD_RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000, 120_000];

export type OsmPoint = { osmType: "node"; osmId: number; name: string; lat: number; lon: number };

export type OsmLocalidadLookup =
  | {
      status: "ok";
      // Nombres de los municipios encontrados ("Resistencia"); vacío si no hay ninguno con ese nombre.
      localidades: string[];
      barrios: OsmBarrio[];
      // Barrios que en OSM son solo un punto, sin polígono: no sirven para detectar por GPS, pero sí
      // para la lista de barrios cercanos del vecino.
      points: OsmPoint[];
    }
  | { status: "unavailable" };

// El municipio (nivel 7 u 8) con ese nombre, con o sin "Municipio de", y los barrios dentro de él.
const localidadQuery = (name: string) => `[out:json][timeout:120];
area["ISO3166-2"="${PROVINCE_ISO}"]->.p;
rel(area.p)[boundary=administrative][admin_level~"^(7|8)$"][name~"^((municipio|municipalidad|comuna|ciudad) de )?${name}$",i];
out tags;
map_to_area->.l;
node(area.l)[place~"^(neighbourhood|suburb|quarter)$"][name];
out;
(way(area.l)[place~"^(neighbourhood|suburb|quarter)$"][name];
 rel(area.l)[place~"^(neighbourhood|suburb|quarter)$"][name];
 rel(area.l)[boundary=administrative][admin_level~"^(9|10)$"][name];);
out geom;`;

// "name" ya viene validado (solo letras, espacios, guiones y apóstrofos): no rompe la consulta.
// "onRetry" avisa cada reintento, para mostrar en el panel que la carga sigue.
export async function lookupOsmLocalidad(
  name: string,
  onRetry?: (attempt: number, waitMs: number) => void,
): Promise<OsmLocalidadLookup> {
  let elements = await runQuery(localidadQuery(name), LOCALIDAD_TIMEOUT_MS);
  for (const [index, waitMs] of LOCALIDAD_RETRY_DELAYS_MS.entries()) {
    if (elements) break;
    onRetry?.(index + 2, waitMs);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    elements = await runQuery(localidadQuery(name), LOCALIDAD_TIMEOUT_MS);
  }
  if (!elements) return { status: "unavailable" };

  const isMunicipio = (element: Element) =>
    element.type === "relation" && /^(7|8)$/.test(element.tags?.admin_level ?? "");
  const localidades = [
    ...new Set(elements.filter(isMunicipio).map((element) => cleanLocalidad(element.tags!.name))),
  ];

  const barrios: OsmBarrio[] = [];
  const seen = new Set<string>();
  for (const element of elements) {
    if ((element.type !== "way" && element.type !== "relation") || isMunicipio(element) || !element.tags?.name) continue;
    const key = `${element.type}/${element.id}`;
    const geometry = seen.has(key) ? null : toMultiPolygon(element);
    if (!geometry) continue;
    seen.add(key);
    barrios.push({ osmType: element.type, osmId: element.id, name: element.tags.name.trim(), geometry });
  }

  const points = elements
    .filter(
      (element) =>
        element.type === "node" && element.tags?.name && Number.isFinite(element.lat) && Number.isFinite(element.lon),
    )
    .map((element): OsmPoint => ({
      osmType: "node",
      osmId: element.id,
      name: element.tags!.name.trim(),
      lat: element.lat!,
      lon: element.lon!,
    }));

  return { status: "ok", localidades, barrios, points };
}
