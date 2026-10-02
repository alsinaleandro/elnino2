import { readFile } from "node:fs/promises";
import path from "node:path";
import { COTA_LEVELS } from "./cotas";

// Une los cinco GeoJSON de cotas en una sola colección. Cada feature lleva `nivel` (índice en
// COTA_LEVELS) para saber a qué rango pertenece. Se lee una vez y queda en memoria.

type CotasLayer = { type: "FeatureCollection"; features: Array<Record<string, unknown> & { properties: Record<string, unknown> }> };

let layerPromise: Promise<{ layer: CotasLayer; json: string }> | null = null;

async function load() {
  const collections = await Promise.all(
    COTA_LEVELS.map(async (level, nivel) => {
      const raw = await readFile(path.join(process.cwd(), "public/data", `${level.file}.geojson`), "utf8");
      const collection = JSON.parse(raw) as CotasLayer;
      return collection.features.map((feature) => ({
        ...feature,
        properties: { ...feature.properties, nivel, rango: level.label },
      }));
    }),
  );

  const layer: CotasLayer = { type: "FeatureCollection", features: collections.flat() };
  return { layer, json: JSON.stringify(layer) };
}

function loadLayer() {
  layerPromise ??= load().catch((error) => {
    layerPromise = null;
    throw error;
  });
  return layerPromise;
}

export async function getCotasLayer() {
  return (await loadLayer()).layer;
}

export async function getCotasLayerJson() {
  return (await loadLayer()).json;
}
