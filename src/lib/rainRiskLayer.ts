import { readFile } from "node:fs/promises";
import path from "node:path";
import { simplifyLayerForMap, type Geometry, type RiskFeature, type RiskLayer } from "./riskLayer";

// Capa de zonas de riesgo hídrico por precipitaciones (Resolución 121/14), en
// public/data/res_121_14.geojson. Cada feature trae su categoría en `RIESGO` (en mayúsculas) y
// su superficie en `HECTARES`; se pasa al mismo formato que la capa del río (riskLayer.ts).

const GEOJSON_PATH = path.join(process.cwd(), "public/data/res_121_14.geojson");

// Ordenadas de menor a mayor peligro.
export const RAIN_RISK_CATEGORIES: Record<number, string> = {
  1: "Zona de Restricción Leve",
  2: "Zona de Restricción Severa Temporaria",
  3: "Zona de Restricción Severa",
  4: "Zona Prohibida",
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();

function categoryCode(riesgo: unknown) {
  const text = normalize(riesgo);
  if (text.includes("PROHIBIDA")) return 4;
  if (text.includes("SEVERA TEMPORARIA")) return 2;
  if (text.includes("SEVERA")) return 3;
  if (text.includes("LEVE")) return 1;
  return null;
}

type SourceFeature = { properties?: Record<string, unknown>; geometry?: Geometry | null };

export function parseRainRiskGeoJson(raw: string): RiskLayer {
  const source = JSON.parse(raw) as { features?: SourceFeature[] };
  const features: RiskFeature[] = [];

  for (const feature of source.features ?? []) {
    const codigo = categoryCode(feature.properties?.RIESGO);
    const geometry = feature.geometry;
    if (!codigo || (geometry?.type !== "Polygon" && geometry?.type !== "MultiPolygon")) continue;

    const hectares = Number(feature.properties?.HECTARES);
    const id = features.length + 1;
    features.push({
      type: "Feature",
      id,
      properties: {
        id,
        codigo,
        categoria: RAIN_RISK_CATEGORIES[codigo],
        area_ha: Number.isFinite(hectares) ? Math.round(hectares * 100) / 100 : null,
      },
      geometry,
    });
  }

  if (features.length === 0) {
    throw new Error("El GeoJSON de riesgo por precipitaciones no tiene zonas reconocibles.");
  }

  return { type: "FeatureCollection", name: "res_121_14", features };
}

// Se lee y procesa una sola vez por proceso; si falla, se reintenta en la próxima consulta.
let layerPromise: Promise<{ full: RiskLayer; map: string }> | null = null;

function loadLayers() {
  layerPromise ??= readFile(GEOJSON_PATH, "utf8")
    .then((raw) => {
      const full = parseRainRiskGeoJson(raw);
      return { full, map: JSON.stringify(simplifyLayerForMap(full)) };
    })
    .catch((error) => {
      layerPromise = null;
      throw error;
    });

  return layerPromise;
}

export async function getRainRiskLayer() {
  return (await loadLayers()).full;
}

export async function getRainRiskLayerMapJson() {
  return (await loadLayers()).map;
}
