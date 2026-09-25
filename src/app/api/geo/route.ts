import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: true,
    endpoints: [
      "/api/geo/contains",
      "/api/geo/contains?lng=-74.01&lat=40.71&file=public/data/sample-layer.geojson",
    ],
  });
}
