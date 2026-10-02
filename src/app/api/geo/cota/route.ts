import { NextRequest, NextResponse } from "next/server";
import { describeCotaLevel } from "@/lib/cotas";
import { getCotasLayer } from "@/lib/cotasLayer";
import { findMatchingFeatures } from "@/lib/geo";

// Cota del terreno en un punto: en qué rango de los mapas de cotas cae, con su equivalencia en
// el hidrómetro de Barranqueras. `cota: null` = el punto está fuera de los mapas de cotas.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lng = Number(searchParams.get("lng"));
  const lat = Number(searchParams.get("lat"));

  if (!searchParams.has("lng") || !searchParams.has("lat") || !Number.isFinite(lng) || !Number.isFinite(lat)) {
    return NextResponse.json(
      { success: false, error: "Debes enviar lng y lat válidos en la query string." },
      { status: 400 },
    );
  }

  try {
    const point = { type: "Point", coordinates: [lng, lat] };
    const [match] = findMatchingFeatures(await getCotasLayer(), point);
    const nivel = match?.properties?.nivel;

    return NextResponse.json({
      success: true,
      point,
      inside: typeof nivel === "number",
      cota: typeof nivel === "number" ? describeCotaLevel(nivel) : null,
    });
  } catch (error) {
    console.error("[geo/cota]", error);
    return NextResponse.json({ success: false, error: "No se pudo cargar el mapa de cotas." }, { status: 500 });
  }
}
