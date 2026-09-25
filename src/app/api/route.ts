import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "API OK",
    endpoints: [
      "/api/health",
      "/api/resources",
      "/api/resources/:id",
    ],
  });
}
