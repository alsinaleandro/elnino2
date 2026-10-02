// Niveles de cota del terreno (escala MOP, metros sobre el nivel del mar) y su equivalencia con
// el hidrómetro del puerto de Barranqueras, donde Prefectura mide el río Paraná.
// Un archivo GeoJSON por nivel en public/data/. Compartido entre servidor y navegador.

// hidrómetro de Barranqueras = cota MOP − 41,8 m (los propios archivos lo confirman:
// "49 a 50 m" ↔ "7,2 a 8,2 m").
export const RIVER_SCALE_OFFSET = 41.8;

export const toRiverScale = (cota: number) => Math.round((cota - RIVER_SCALE_OFFSET) * 100) / 100;

// Escala ordinal de un solo tono (validada): más oscuro = terreno más bajo, más expuesto al agua.
export const COTA_LEVELS = [
  { file: "cotas_menor_49m", label: "Menos de 49 m", min: null, max: 49, color: "#0d366b" },
  { file: "cotas_49_a_50m", label: "49 a 50 m", min: 49, max: 50, color: "#184f95" },
  { file: "cotas_50_a_51m", label: "50 a 51 m", min: 50, max: 51, color: "#256abf" },
  { file: "cotas_51_a_52m", label: "51 a 52 m", min: 51, max: 52, color: "#3987e5" },
  { file: "cotas_mayor_52m", label: "Más de 52 m", min: 52, max: null, color: "#86b6ef" },
] as const satisfies ReadonlyArray<{ file: string; label: string; min: number | null; max: number | null; color: string }>;

export type CotaMatch = {
  nivel: number;
  rango: string;
  cotaMin: number | null;
  cotaMax: number | null;
  hidrometroMin: number | null;
  hidrometroMax: number | null;
};

export function describeCotaLevel(nivel: number): CotaMatch {
  const level = COTA_LEVELS[nivel];
  return {
    nivel,
    rango: level.label,
    cotaMin: level.min,
    cotaMax: level.max,
    hidrometroMin: level.min === null ? null : toRiverScale(level.min),
    hidrometroMax: level.max === null ? null : toRiverScale(level.max),
  };
}
