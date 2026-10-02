import { readFile } from "node:fs/promises";
import path from "node:path";

// Capa de zonas de riesgo hídrico, leída del KML exportado de Google My Maps
// (public/data/riesgos_hidricos_muni.kml). Cada Placemark trae su categoría en
// ExtendedData/Cod_Tipo (1 = Leve ... 4 = Prohibida) y está dentro de una carpeta con el
// mismo nombre ("1 - Leve", "2 - Leve Regulada", ...).

const KML_PATH = path.join(process.cwd(), "public/data/riesgos_hidricos_muni.kml");

// Ordenadas de menor a mayor peligro.
export const RISK_CATEGORIES: Record<number, string> = {
  1: "Zona de Restricción Leve",
  2: "Zona de Restricción Leve Regulada",
  3: "Zona de Restricción Severa",
  4: "Zona Prohibida",
};

type Position = [number, number];
type Geometry =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "LineString"; coordinates: Position[] }
  | { type: "GeometryCollection"; geometries: Geometry[] };

export type RiskFeature = {
  type: "Feature";
  id: number;
  properties: { id: number; codigo: number; categoria: string; area_ha: number | null };
  geometry: Geometry;
};

export type RiskLayer = { type: "FeatureCollection"; name: string; features: RiskFeature[] };

// ---------- Lectura del KML ----------

const tagContent = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1];

function parseCoordinates(text: string): Position[] {
  return text
    .trim()
    .split(/\s+/)
    .map((tuple) => tuple.split(",").map(Number))
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))
    .map(([lng, lat]) => [lng, lat]);
}

function parsePolygon(xml: string): Geometry {
  const ring = (boundary: string) => parseCoordinates(tagContent(boundary, "coordinates") ?? "");
  const outer = xml.match(/<outerBoundaryIs>([\s\S]*?)<\/outerBoundaryIs>/)?.[1] ?? "";
  const inner = [...xml.matchAll(/<innerBoundaryIs>([\s\S]*?)<\/innerBoundaryIs>/g)].map((match) => ring(match[1]));
  return { type: "Polygon", coordinates: [ring(outer), ...inner] };
}

function parseGeometries(xml: string): Geometry[] {
  const geometries: Geometry[] = [];

  for (const match of xml.matchAll(/<(Polygon|LineString)>([\s\S]*?)<\/\1>/g)) {
    if (match[1] === "Polygon") {
      geometries.push(parsePolygon(match[2]));
    } else {
      geometries.push({ type: "LineString", coordinates: parseCoordinates(tagContent(match[2], "coordinates") ?? "") });
    }
  }

  return geometries;
}

// Superficie aproximada en hectáreas (proyección equirectangular local: error despreciable
// para polígonos del tamaño de una ciudad).
function ringAreaM2(ring: Position[]) {
  if (ring.length < 3) return 0;
  const lat0 = (ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length) * (Math.PI / 180);
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos(lat0);
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * mPerDegLng * ring[i][1] * mPerDegLat - ring[i][0] * mPerDegLng * ring[j][1] * mPerDegLat;
  }
  return Math.abs(sum / 2);
}

function areaHectares(geometries: Geometry[]): number | null {
  let total = 0;
  for (const geometry of geometries) {
    if (geometry.type === "Polygon") {
      const [outer, ...holes] = geometry.coordinates;
      total += ringAreaM2(outer) - holes.reduce((sum, hole) => sum + ringAreaM2(hole), 0);
    }
  }
  return total > 0 ? Math.round(total / 100) / 100 : null;
}

export function parseRiskKml(kml: string): RiskLayer {
  const features: RiskFeature[] = [];

  for (const folder of kml.matchAll(/<Folder>([\s\S]*?)<\/Folder>/g)) {
    // "3 - Severa" → 3, por si algún Placemark no trae Cod_Tipo.
    const folderCode = Number(tagContent(folder[1], "name")?.match(/^\s*(\d+)/)?.[1]);

    for (const placemark of folder[1].matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
      const codeText = placemark[1].match(/<Data name="Cod_Tipo">\s*<value>\s*(\d+)\s*<\/value>/)?.[1];
      const codigo = Number(codeText ?? folderCode);
      const geometries = parseGeometries(placemark[1]);

      if (!RISK_CATEGORIES[codigo] || geometries.length === 0) continue;

      const id = features.length + 1;
      features.push({
        type: "Feature",
        id,
        properties: { id, codigo, categoria: RISK_CATEGORIES[codigo], area_ha: areaHectares(geometries) },
        geometry: geometries.length === 1 ? geometries[0] : { type: "GeometryCollection", geometries },
      });
    }
  }

  if (features.length === 0) {
    throw new Error("El KML de riesgos hídricos no tiene zonas reconocibles.");
  }

  return { type: "FeatureCollection", name: "riesgos_hidricos_muni", features };
}

// ---------- Versión liviana para dibujar en el mapa ----------

// Douglas-Peucker: quita vértices que se apartan menos de `tolerance` grados de la línea.
function simplify(points: Position[], tolerance: number): Position[] {
  if (points.length <= 4) return points;
  const last = points.length - 1;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[last] = 1;
  const stack: Array<[number, number]> = [];

  // En un anillo cerrado el primer y el último punto coinciden (segmento de largo cero): se
  // parte primero en el punto más lejano al inicio.
  if (points[0][0] === points[last][0] && points[0][1] === points[last][1]) {
    let farthest = 1;
    for (let i = 2; i < last; i += 1) {
      const distance = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]);
      if (distance > Math.hypot(points[farthest][0] - points[0][0], points[farthest][1] - points[0][1])) farthest = i;
    }
    keep[farthest] = 1;
    stack.push([0, farthest], [farthest, last]);
  } else {
    stack.push([0, last]);
  }

  while (stack.length) {
    const [start, end] = stack.pop()!;
    const [x1, y1] = points[start];
    const [x2, y2] = points[end];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1e-12;
    let maxDistance = 0;
    let index = -1;

    for (let i = start + 1; i < end; i += 1) {
      const distance = Math.abs(dy * points[i][0] - dx * points[i][1] + x2 * y1 - y2 * x1) / length;
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }

    if (index >= 0 && maxDistance > tolerance) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }

  const result = points.filter((_, i) => keep[i]);
  return result.length >= 4 ? result : points;
}

const round6 = ([lng, lat]: Position): Position => [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];

function simplifyGeometry(geometry: Geometry, tolerance: number): Geometry {
  switch (geometry.type) {
    case "Polygon":
      return { type: "Polygon", coordinates: geometry.coordinates.map((ring) => simplify(ring, tolerance).map(round6)) };
    case "LineString":
      return { type: "LineString", coordinates: simplify(geometry.coordinates, tolerance).map(round6) };
    case "GeometryCollection":
      return { type: "GeometryCollection", geometries: geometry.geometries.map((g) => simplifyGeometry(g, tolerance)) };
  }
}

// ~1 m en latitudes del Chaco: a la escala de la ciudad no se nota y reduce mucho los vértices.
const MAP_TOLERANCE_DEGREES = 0.00001;

export function simplifyLayerForMap(layer: RiskLayer): RiskLayer {
  return {
    ...layer,
    features: layer.features.map((feature) => ({
      ...feature,
      geometry: simplifyGeometry(feature.geometry, MAP_TOLERANCE_DEGREES),
    })),
  };
}

// ---------- Caché ----------

// El KML se lee y procesa una sola vez por proceso; si falla, se reintenta en la próxima consulta.
let layerPromise: Promise<{ full: RiskLayer; map: string }> | null = null;

function loadLayers() {
  layerPromise ??= readFile(KML_PATH, "utf8")
    .then((kml) => {
      const full = parseRiskKml(kml);
      return { full, map: JSON.stringify(simplifyLayerForMap(full)) };
    })
    .catch((error) => {
      layerPromise = null;
      throw error;
    });

  return layerPromise;
}

export async function getRiskLayer() {
  return (await loadLayers()).full;
}

export async function getRiskLayerMapJson() {
  return (await loadLayers()).map;
}
