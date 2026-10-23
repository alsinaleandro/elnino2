// Localidades con mapas de riesgo hídrico. Solo datos: lo usan el servidor (cálculo de zona, capas) y
// la página (leyendas, encuadre del mapa). Las capas se leen en localityLayers.ts.

export type LocalityId = "amgr" | "colonia-benitez";
export type RiskMapKey = "rio" | "lluvia";

export type Locality = {
  id: LocalityId;
  name: string;
  // Origen de cada mapa, para leyendas y carteles.
  sources: Record<RiskMapKey, string>;
  // Niveles que existen en cada mapa (códigos de 1 = leve a 4 = prohibida, ver riskLayer.ts y
  // rainRiskLayer.ts): no todas las localidades tienen "leve regulada" o "severa temporaria".
  codes: Record<RiskMapKey, number[]>;
  // Si las definiciones de cada zona (RiskBars.tsx) corresponden a sus mapas.
  hasZoneMeanings: boolean;
  // Encuadre inicial del mapa: [[sur, oeste], [norte, este]].
  bounds: [[number, number], [number, number]];
};

export const LOCALITIES: Record<LocalityId, Locality> = {
  amgr: {
    id: "amgr",
    name: "Gran Resistencia",
    sources: { rio: "Resolución APA 303/17", lluvia: "Resolución APA 121/14" },
    codes: { rio: [1, 2, 3, 4], lluvia: [1, 2, 3, 4] },
    hasZoneMeanings: true,
    bounds: [
      [-27.554, -59.104],
      [-27.329, -58.892],
    ],
  },
  "colonia-benitez": {
    id: "colonia-benitez",
    name: "Colonia Benítez",
    sources: { rio: "Mapa APA 2018", lluvia: "Mapa APA 2018" },
    codes: { rio: [1, 3, 4], lluvia: [1, 3, 4] },
    hasZoneMeanings: false,
    bounds: [
      [-27.378, -59.029],
      [-27.27, -58.897],
    ],
  },
};

// Rectángulo que cubre las capas del AMGR: fuera de él y de las demás localidades no hay mapa.
export const AMGR_AREA = { west: -59.12, south: -27.56, east: -58.84, north: -27.32 };
