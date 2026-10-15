import { geoJsonResponse } from "@/lib/geoJsonResponse";
import { getRainRiskLayerMapJson } from "@/lib/rainRiskLayer";

// Capa de riesgo hídrico por precipitaciones (Res. 121/14) en GeoJSON, con los contornos
// simplificados a ~1 m para dibujarla en el mapa. El cálculo de zona (/api/geo/contains) usa la
// capa con precisión completa.
export async function GET(request: Request) {
  try {
    return geoJsonResponse(request, "riesgo-lluvia", await getRainRiskLayerMapJson());
  } catch (error) {
    console.error("[geo/capa-lluvia]", error);
    return Response.json(
      { success: false, error: "No se pudo cargar la capa de riesgo por precipitaciones." },
      { status: 500 },
    );
  }
}
