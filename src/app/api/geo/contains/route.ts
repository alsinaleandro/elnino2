import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { findMatchingFeatures, normalizePoint } from "@/lib/geo";

// Capa fija: no se acepta una ruta desde la request para no exponer archivos del servidor.
const LAYER_PATH = path.join(process.cwd(), "public/data/riesgo_hidrico_AMGR_todas.geojson");

// Se lee y parsea una sola vez; las consultas siguientes usan la copia en memoria.
let layerPromise: Promise<unknown> | null = null;

function loadLayer() {
  layerPromise ??= readFile(LAYER_PATH, "utf8")
    .then((raw) => JSON.parse(raw) as unknown)
    .catch((error) => {
      layerPromise = null;
      throw error;
    });

  return layerPromise;
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
    const point = { type: "Point", coordinates: [lng, lat] };
    const matches = findMatchingFeatures(await loadLayer(), point);

    return NextResponse.json({
      success: true,
      point,
      inside: matches.length > 0,
      matches,
    });
  } catch (error) {
    return errorResponse(error, "No se pudo cargar la capa de riesgo.");
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
    // Se puede enviar una capa propia en el body; si no, se usa la capa de riesgo.
    const geojson = body?.geojson ?? body?.layer ?? body?.data ?? (await loadLayer());
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
