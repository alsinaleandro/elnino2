import { getRequester } from "@/lib/contact";
import { registerVisitLocation } from "@/lib/visits";

// La página lo llama una vez por carga, cuando consigue la ubicación GPS del visitante.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const { latitude, longitude, accuracy } = body ?? {};

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return Response.json({ error: "Coordenadas inválidas." }, { status: 400 });
  }

  const saved = registerVisitLocation(
    {
      latitude,
      longitude,
      accuracy: typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
    },
    getRequester(request).ip,
  );

  return new Response(null, { status: saved ? 204 : 429 });
}
