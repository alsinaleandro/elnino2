import { geoJsonResponse } from "@/lib/geoJsonResponse";
import { getAllLocalitiesMapJson } from "@/lib/localityLayers";

// Zonas de riesgo por crecida de ríos de todas las localidades (ver src/lib/localities.ts) en
// GeoJSON, con los contornos simplificados a ~1 m para dibujarlas en el mapa. El cálculo de zona
// (/api/geo/contains) usa las capas con precisión completa.
export async function GET(request: Request) {
  try {
    return geoJsonResponse(request, "riesgo", await getAllLocalitiesMapJson("rio"));
  } catch (error) {
    console.error("[geo/capa]", error);
    return Response.json({ success: false, error: "No se pudo cargar la capa de zonas de riesgo." }, { status: 500 });
  }
}
