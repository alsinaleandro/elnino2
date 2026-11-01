// Capa de reportes de vecinos en el mapa (Idea 2): la zona continua (vecino más cercano, calculada en
// el servidor) y encima cada punto reportado.
import { FLOOD_CAUSE_INFO, FLOOD_STATUS_INFO, type FloodData } from "@/lib/floodKinds";
import { timeAgo } from "./format";

export const FLOOD_PANE = "floodPane";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildFloodLayer(L: any, data: FloodData) {
  const group = L.layerGroup();

  L.geoJSON(data.zones, {
    pane: FLOOD_PANE,
    interactive: false,
    style: (feature: { properties: { status: keyof typeof FLOOD_STATUS_INFO } }) => ({
      stroke: false,
      fillColor: FLOOD_STATUS_INFO[feature.properties.status].color,
      fillOpacity: 0.4,
    }),
  }).addTo(group);

  for (const report of data.reports) {
    const info = FLOOD_STATUS_INFO[report.status];
    const marker = L.circleMarker([report.latitude, report.longitude], {
      pane: FLOOD_PANE,
      radius: report.mine ? 8 : 6,
      color: report.mine ? "#111827" : "#ffffff",
      weight: 2,
      fillColor: info.color,
      fillOpacity: 1,
    });
    const cause = report.cause ? `${FLOOD_CAUSE_INFO[report.cause].label} · ` : "";
    marker.bindPopup(
      `<strong>${info.label}</strong><br>${cause}${timeAgo(report.createdAt)}<br>` +
        `<small>${report.mine ? "Tu reporte" : "Reporte de un vecino, no es información oficial"}</small>`,
    );
    marker.addTo(group);
  }

  return group;
}
