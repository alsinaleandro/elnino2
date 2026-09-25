import { NextRequest, NextResponse } from "next/server";
import { createResource, resources } from "@/lib/store";

export async function GET() {
  return NextResponse.json({
    success: true,
    count: resources.length,
    data: resources,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const resource = createResource(body);

    return NextResponse.json(
      {
        success: true,
        data: resource,
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo crear el recurso.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 400 },
    );
  }
}
