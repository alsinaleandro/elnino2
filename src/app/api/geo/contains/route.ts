import { NextRequest, NextResponse } from "next/server";
import { findMatchingFeatures, normalizePoint, type PointTuple } from "@/lib/geo";
import { getRainRiskLayer } from "@/lib/rainRiskLayer";
import { getRiskLayer } from "@/lib/riskLayer";

// Capas fijas: riesgo por crecida del río Negro (KML, ver src/lib/riskLayer.ts) y riesgo por
// precipitaciones (Res. 121/14, ver src/lib/rainRiskLayer.ts). No se acepta una ruta desde la
// request para no exponer archivos del servidor. Se procesan una vez y quedan en memoria.
async function matchRiskLayers(coordinates: PointTuple) {
  const point = { type: "Point", coordinates };
  const [rioLayer, lluviaLayer] = await Promise.all([getRiskLayer(), getRainRiskLayer()]);
  const rio = findMatchingFeatures(rioLayer, point);
  const lluvia = findMatchingFeatures(lluviaLayer, point);

  return {
    success: true,
    point,
    rio: { inside: rio.length > 0, matches: rio },
    lluvia: { inside: lluvia.length > 0, matches: lluvia },
  };
}

function errorResponse(error: unknown, fallback: string) {
  console.error("[geo/contains]", error);

  return NextResponse.json(
    {
      success: false,
      error: error instanceof Error ? error.message : fallback,
    },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lng = Number(searchParams.get("lng"));
  const lat = Number(searchParams.get("lat"));

  if (!searchParams.has("lng") || !searchParams.has("lat") || !Number.isFinite(lng) || !Number.isFinite(lat)) {
    return NextResponse.json(
      {
        success: false,
        error: "Debes enviar lng y lat válidos en la query string.",
      },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await matchRiskLayers([lng, lat]));
  } catch (error) {
    return errorResponse(error, "No se pudieron cargar las capas de riesgo.");
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "El cuerpo de la petición debe ser JSON válido.",
      },
      { status: 400 },
    );
  }

  const point = normalizePoint(body?.point ?? null);

  if (!point) {
    return NextResponse.json(
      {
        success: false,
        error: "El punto debe estar en formato GeoJSON Point, por ejemplo { type: 'Point', coordinates: [lng, lat] }.",
      },
      { status: 400 },
    );
  }

  try {
    // Se puede enviar una capa propia en el body; si no, se consultan las dos capas de riesgo.
    const geojson = body?.geojson ?? body?.layer ?? body?.data;
    if (!geojson) {
      return NextResponse.json(await matchRiskLayers(point));
    }

    const matches = findMatchingFeatures(geojson, { type: "Point", coordinates: point });

    return NextResponse.json({
      success: true,
      point: { type: "Point", coordinates: point },
      inside: matches.length > 0,
      matches,
    });
  } catch (error) {
    return errorResponse(error, "No se pudo procesar la consulta geoespacial.");
  }
}
