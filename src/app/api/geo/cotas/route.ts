import { getCotasLayerJson } from "@/lib/cotasLayer";
import { geoJsonResponse } from "@/lib/geoJsonResponse";

// Los cinco mapas de cotas unidos en una sola capa, para dibujarlos en la pestaña Mapa.
export async function GET(request: Request) {
  try {
    return geoJsonResponse(request, "cotas", await getCotasLayerJson());
  } catch (error) {
    console.error("[geo/cotas]", error);
    return Response.json({ success: false, error: "No se pudo cargar el mapa de cotas." }, { status: 500 });
  }
}
