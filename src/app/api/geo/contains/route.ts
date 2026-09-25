import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { findMatchingFeatures, normalizePoint } from "@/lib/geo";

function resolveGeoJson(filePath?: string | null) {
  if (!filePath) {
    return null;
  }

  const projectRoot = process.cwd();
  const resolved = path.resolve(projectRoot, filePath.replace(/^\.?\/?/, ""));
  const raw = readFileSync(resolved, "utf8");
  return JSON.parse(raw);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lng = Number(searchParams.get("lng"));
  const lat = Number(searchParams.get("lat"));
  const file = searchParams.get("file");

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return NextResponse.json(
      {
        success: false,
        error: "Debes enviar lng y lat válidos en la query string.",
      },
      { status: 400 },
    );
  }

  const point = { type: "Point", coordinates: [lng, lat] };
  const geojson = resolveGeoJson(file) ?? null;

  if (!geojson) {
    return NextResponse.json(
      {
        success: false,
        error: "No se encontró un archivo GeoJSON. Usa el parámetro file o envía geojson en el body.",
      },
      { status: 400 },
    );
  }

  const matches = findMatchingFeatures(geojson, point);

  return NextResponse.json({
    success: true,
    point,
    inside: matches.length > 0,
    matches,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const rawPoint = body?.point ?? null;
    const geojson = (body?.geojson ?? body?.layer ?? body?.data ?? null) as unknown;
    const file = typeof body?.file === "string" ? body.file : null;

    const point = normalizePoint(rawPoint);

    if (!point) {
      return NextResponse.json(
        {
          success: false,
          error: "El punto debe estar en formato GeoJSON Point, por ejemplo { type: 'Point', coordinates: [lng, lat] }.",
        },
        { status: 400 },
      );
    }

    const resolvedGeojson = geojson ?? resolveGeoJson(file);

    if (!resolvedGeojson) {
      return NextResponse.json(
        {
          success: false,
          error: "Debes enviar un geojson o un file con una capa GeoJSON.",
        },
        { status: 400 },
      );
    }

    const matches = findMatchingFeatures(resolvedGeojson, point);

    return NextResponse.json({
      success: true,
      point: { type: "Point", coordinates: point },
      inside: matches.length > 0,
      matches,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo procesar la consulta geoespacial.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 400 },
    );
  }
}
