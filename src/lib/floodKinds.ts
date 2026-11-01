// Reportes colaborativos de inundaciones (Idea 2): lo que comparten el servidor (floods.ts) y el mapa
// de la app. Sin acceso a la base, para poder usarlo en el navegador.

export const FLOOD_STATUSES = ["seco", "anegada", "intransitable"] as const;
export type FloodStatus = (typeof FLOOD_STATUSES)[number];

export const FLOOD_CAUSES = ["lluvia", "rio"] as const;
export type FloodCause = (typeof FLOOD_CAUSES)[number];

export const FLOOD_STATUS_INFO: Record<FloodStatus, { label: string; color: string; hint: string }> = {
  seco: { label: "Sin agua", color: "#16a34a", hint: "Se puede pasar" },
  anegada: { label: "Zona anegada", color: "#f97316", hint: "Hay agua, se pasa con cuidado" },
  intransitable: { label: "Intransitable", color: "#dc2626", hint: "No se puede pasar" },
};

// Cuánto se ve un reporte en el mapa. La lluvia sube y baja en horas; la crecida del río se queda
// días. "Sin agua" no tiene causa y se ve 12 horas.
export const FLOOD_CAUSE_INFO: Record<FloodCause, { label: string; hours: number }> = {
  lluvia: { label: "Por lluvia", hours: 12 },
  rio: { label: "Por crecida del río", hours: 4 * 24 },
};
export const DRY_HOURS = 12;

// Radio alrededor de cada punto que pinta la capa continua (ver floods.ts).
export const FLOOD_ZONE_RADIUS_METERS = 200;

export type FloodReport = {
  id: number;
  latitude: number;
  longitude: number;
  status: FloodStatus;
  cause: FloodCause | null;
  createdAt: string;
  expiresAt: string;
  mine: boolean;
};

export type FloodZones = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { status: FloodStatus };
    geometry: { type: "Polygon"; coordinates: number[][][] };
  }>;
};

// Respuesta de /api/inundaciones. `canReport`: el vecino ya se sumó a un comité.
export type FloodData = { reports: FloodReport[]; zones: FloodZones; canReport: boolean };
