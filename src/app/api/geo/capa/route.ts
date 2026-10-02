import { geoJsonResponse } from "@/lib/geoJsonResponse";
import { getRiskLayerMapJson } from "@/lib/riskLayer";

// Capa de zonas de riesgo (del KML) en GeoJSON, con los contornos simplificados a ~1 m para
// dibujarla en el mapa. El cálculo de zona (/api/geo/contains) usa la capa con precisión completa.
export async function GET(request: Request) {
  try {
    return geoJsonResponse(request, "riesgo", await getRiskLayerMapJson());
  } catch (error) {
    console.error("[geo/capa]", error);
    return Response.json({ success: false, error: "No se pudo cargar la capa de zonas de riesgo." }, { status: 500 });
  }
}
