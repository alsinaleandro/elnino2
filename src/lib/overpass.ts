// Consulta a OpenStreetMap (Overpass API) qué barrio y qué localidad contienen un punto. Overpass es
// un servicio gratuito con límites de uso que a veces no responde: se prueban los servidores de
// OVERPASS_URL (separados por comas) en orden y, si ninguno contesta, se devuelve "unavailable"
// para que el registro siga sin él.
// Datos © OpenStreetMap contributors, licencia ODbL.
import { geometryContainsPoint, type GeoJsonMultiPolygon, type PointTuple } from "./geo";

const SERVERS = (
  process.env.OVERPASS_URL ??
  "https://overpass-api.de/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

// Por servidor: con los dos de la lista, el vecino espera como mucho unos 16 segundos.
const TIMEOUT_MS = 8_000;

export type OsmBarrio = {
  osmType: "way" | "relation";
  osmId: number;
  name: string;
  geometry: GeoJsonMultiPolygon;
};

export type OsmLookup =
  | { status: "ok"; barrio: OsmBarrio | null; localidad: string | null }
  | { status: "unavailable" };

type LatLon = { lat: number; lon: number };
type Element = {
  type: "area" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  geometry?: LatLon[];
  members?: Array<{ type: string; role: string; geometry?: LatLon[] }>;
};

// Barrios: lugares con nombre (neighbourhood, suburb, quarter) o límites administrativos de nivel
// 9-10. Localidad: ciudad o pueblo, o el municipio (nivel 6-8). De los barrios se pide el polígono.
const query = (lat: number, lon: number) => `[out:json][timeout:10];
is_in(${lat},${lon})->.a;
(area.a[place~"^(neighbourhood|suburb|quarter)$"][name];
 area.a[boundary=administrative][admin_level~"^(9|10)$"][name];)->.b;
(area.a[place~"^(city|town|village)$"][name];
 area.a[boundary=administrative][admin_level~"^(6|7|8)$"][name];)->.l;
.l out tags;
(way(pivot.b);rel(pivot.b););
out geom;`;

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

const bboxArea = (geometry: GeoJsonMultiPolygon) => {
  const points = geometry.coordinates.flatMap((polygon) => polygon[0]);
  const lons = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return (Math.max(...lons) - Math.min(...lons)) * (Math.max(...lats) - Math.min(...lats));
};

// "Municipio de Resistencia" → "Resistencia".
const cleanLocalidad = (name: string) => name.replace(/^(municipio|municipalidad|comuna|ciudad) de /i, "").trim();

function pickLocalidad(areas: Element[]) {
  const places = areas.filter((area) => area.tags?.place);
  if (places.length) return cleanLocalidad(places[0].tags!.name);
  const boundaries = areas
    .filter((area) => area.tags?.admin_level)
    .sort((a, b) => Number(b.tags!.admin_level) - Number(a.tags!.admin_level));
  return boundaries.length ? cleanLocalidad(boundaries[0].tags!.name) : null;
}

// Si el punto cae en más de un barrio (uno dentro de otro), se queda el más chico.
function pickBarrio(elements: Element[], point: PointTuple): OsmBarrio | null {
  const candidates = elements
    .filter((element) => (element.type === "way" || element.type === "relation") && element.tags?.name)
    .map((element) => ({ element, geometry: toMultiPolygon(element) }))
    .filter(
      (item): item is { element: Element; geometry: GeoJsonMultiPolygon } =>
        item.geometry !== null && geometryContainsPoint(item.geometry, point),
    )
    .sort((a, b) => bboxArea(a.geometry) - bboxArea(b.geometry));

  const best = candidates[0];
  if (!best) return null;
  return {
    osmType: best.element.type as OsmBarrio["osmType"],
    osmId: best.element.id,
    name: best.element.tags!.name.trim(),
    geometry: best.geometry,
  };
}

export async function lookupOsm(lat: number, lon: number): Promise<OsmLookup> {
  for (const server of SERVERS) {
    try {
      const response = await fetch(server, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "elnino2 (ptpchaco.org.ar)" },
        body: new URLSearchParams({ data: query(lat, lon) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { elements } = (await response.json()) as { elements: Element[] };
      return {
        status: "ok",
        barrio: pickBarrio(elements, [lon, lat]),
        localidad: pickLocalidad(elements.filter((element) => element.type === "area")),
      };
    } catch (error) {
      console.warn(`[barrios] Overpass no respondió (${server}):`, error instanceof Error ? error.message : error);
    }
  }
  return { status: "unavailable" };
}
