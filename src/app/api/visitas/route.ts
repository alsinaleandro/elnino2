import { registerVisit } from "@/lib/visits";

// La página lo llama una vez por carga para registrar la visita. No devuelve el total: solo se ve
// en /estadisticas.
export async function POST() {
  registerVisit();
  return new Response(null, { status: 204 });
}
