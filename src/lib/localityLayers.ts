import { readFile } from "node:fs/promises";
import path from "node:path";
import { findMatchingFeatures, type PointTuple } from "./geo";
import { AMGR_AREA, LOCALITIES, type LocalityId, type RiskMapKey } from "./localities";
import { getRainRiskLayer } from "./rainRiskLayer";
import { getRiskLayer, RISK_CATEGORIES, simplifyLayerForMap, type Geometry, type RiskFeature, type RiskLayer } from "./riskLayer";

// Capas de riesgo de cada localidad (ver localities.ts) y búsqueda de la localidad de un punto.
// El AMGR usa sus capas de siempre (riskLayer.ts y rainRiskLayer.ts); las demás localidades vienen
// en GeoJSON con la categoría en `nivel` ("leve", "severo", "prohibida").

// Archivos de las localidades fuera del AMGR, en public/data.
const LOCALITY_FILES: Partial<Record<LocalityId, Record<RiskMapKey, string>>> = {
  "colonia-benitez": {
    rio: "riesgo_hidrico_crecida_colonia_benitez.geojson",
    lluvia: "riesgo_hidrico_precipitacion_colonia_benitez.geojson",
  },
};

// Los códigos son los mismos en los dos mapas del AMGR para estos tres niveles.
const LEVEL_CODES: Record<string, number> = { leve: 1, severo: 3, severa: 3, prohibida: 4 };

type SourceFeature = { properties?: Record<string, unknown>; geometry?: Geometry | null };

export function parseLocalityGeoJson(raw: string, name: string): RiskLayer {
  const source = JSON.parse(raw) as { features?: SourceFeature[] };
  const features: RiskFeature[] = [];

  for (const feature of source.features ?? []) {
    const codigo = LEVEL_CODES[String(feature.properties?.nivel ?? "").trim().toLowerCase()];
    const geometry = feature.geometry;
    if (!codigo || (geometry?.type !== "Polygon" && geometry?.type !== "MultiPolygon")) continue;

    const hectares = Number(feature.properties?.area_ha);
    const id = features.length + 1;
    features.push({
      type: "Feature",
      id,
      properties: {
        id,
        codigo,
        categoria: RISK_CATEGORIES[codigo],
        area_ha: Number.isFinite(hectares) ? Math.round(hectares * 100) / 100 : null,
      },
      geometry,
    });
  }

  if (features.length === 0) {
    throw new Error(`El GeoJSON ${name} no tiene zonas reconocibles.`);
  }

  return { type: "FeatureCollection", name, features };
}

// Se leen y procesan una sola vez por proceso; si fallan, se reintenta en la próxima consulta.
const layerPromises = new Map<string, Promise<RiskLayer>>();

function loadLocalityLayer(file: string) {
  let promise = layerPromises.get(file);
  if (!promise) {
    promise = readFile(path.join(process.cwd(), "public/data", file), "utf8")
      .then((raw) => parseLocalityGeoJson(raw, file.replace(/\.geojson$/, "")))
      .catch((error) => {
        layerPromises.delete(file);
        throw error;
      });
    layerPromises.set(file, promise);
  }
  return promise;
}

export async function getLocalityLayer(locality: LocalityId, map: RiskMapKey): Promise<RiskLayer> {
  if (locality === "amgr") {
    return map === "rio" ? getRiskLayer() : getRainRiskLayer();
  }
  return loadLocalityLayer(LOCALITY_FILES[locality]![map]);
}

// Localidad que contiene el punto: primero las que tienen el ejido completo dibujado (todo su
// territorio está en alguna zona), y si no, el AMGR, cuyas capas no cubren toda la ciudad y se
// reconoce por su rectángulo. null = sin mapa para ese lugar.
export async function findLocality(point: PointTuple): Promise<LocalityId | null> {
  const geoPoint = { type: "Point", coordinates: point };

  for (const id of Object.keys(LOCALITY_FILES) as LocalityId[]) {
    const layers = await Promise.all([getLocalityLayer(id, "rio"), getLocalityLayer(id, "lluvia")]);
    if (layers.some((layer) => findMatchingFeatures(layer, geoPoint).length > 0)) return id;
  }

  const [lng, lat] = point;
  const inAmgr = lng >= AMGR_AREA.west && lng <= AMGR_AREA.east && lat >= AMGR_AREA.south && lat <= AMGR_AREA.north;
  return inAmgr ? "amgr" : null;
}

// ---------- Capas para dibujar en el mapa ----------

// Todas las localidades juntas en una sola capa por mapa, simplificadas a ~1 m. Cada zona lleva su
// localidad y la fuente, para el cartel que se abre al tocarla.
let mapJsonPromises: Partial<Record<RiskMapKey, Promise<string>>> = {};

export function getAllLocalitiesMapJson(map: RiskMapKey) {
  mapJsonPromises[map] ??= Promise.all(
    Object.values(LOCALITIES).map(async (locality) => {
      const layer = simplifyLayerForMap(await getLocalityLayer(locality.id, map));
      return layer.features.map((feature) => ({
        ...feature,
        id: `${locality.id}-${feature.id}`,
        properties: { ...feature.properties, localidad: locality.name, fuente: locality.sources[map] },
      }));
    }),
  )
    .then((groups) => JSON.stringify({ type: "FeatureCollection", name: `riesgo-${map}`, features: groups.flat() }))
    .catch((error) => {
      mapJsonPromises = { ...mapJsonPromises, [map]: undefined };
      throw error;
    });

  return mapJsonPromises[map]!;
}
