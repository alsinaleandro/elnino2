import { addFloodReport, listFloods, removeFloodReport } from "@/lib/floods";
import type { FloodData } from "@/lib/floodKinds";
import { getCurrentNeighbor, ValidationError } from "@/lib/neighbors";

// Reportes colaborativos de inundaciones (Idea 2). Cualquiera ve el mapa; para reportar hay que
// haberse sumado al comité de un barrio. Cada vecino tiene un solo punto vigente.

async function viewer() {
  const neighbor = await getCurrentNeighbor();
  return { id: neighbor?.id ?? null, member: Boolean(neighbor?.whatsapp && neighbor.barrio) };
}

const payload = (id: number | null, member: boolean): FloodData => ({ ...listFloods(id), canReport: member });

// GET /api/inundaciones → reportes vigentes y la capa continua.
export async function GET() {
  const { id, member } = await viewer();
  return Response.json(payload(id, member), { headers: { "Cache-Control": "no-store" } });
}

// POST /api/inundaciones { latitude, longitude, accuracy, status, cause } → reemplaza el punto del vecino.
export async function POST(request: Request) {
  const { id, member } = await viewer();
  if (id === null || !member) {
    return Response.json({ error: "Para reportar tenés que sumarte al comité de tu barrio." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    addFloodReport(id, body ?? {});
  } catch (error) {
    if (error instanceof ValidationError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
  return Response.json(payload(id, member));
}

// DELETE /api/inundaciones → saca del mapa el punto del vecino.
export async function DELETE() {
  const { id, member } = await viewer();
  if (id !== null) removeFloodReport(id);
  return Response.json(payload(id, member));
}
