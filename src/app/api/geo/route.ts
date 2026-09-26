import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: true,
    endpoints: [
      "/api/geo/contains",
      "/api/geo/contains?lng=-58.98&lat=-27.46",
    ],
  });
}
