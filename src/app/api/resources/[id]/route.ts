import { NextRequest, NextResponse } from "next/server";
import { deleteResource, findResourceById, updateResource } from "@/lib/store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const resource = findResourceById(id);

  if (!resource) {
    return NextResponse.json(
      {
        success: false,
        error: "Recurso no encontrado.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: resource,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const updated = updateResource(id, body);

    if (!updated) {
      return NextResponse.json(
        {
          success: false,
          error: "Recurso no encontrado.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo actualizar el recurso.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = deleteResource(id);

  if (!deleted) {
    return NextResponse.json(
      {
        success: false,
        error: "Recurso no encontrado.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    message: `Recurso ${id} eliminado correctamente.`,
  });
}
