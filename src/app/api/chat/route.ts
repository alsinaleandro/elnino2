import { addMessage, listMessages } from "@/lib/chat";
import { getCurrentNeighbor, ValidationError } from "@/lib/neighbors";

// Chat del barrio. Solo para vecinos con sesión que completaron sus datos y eligieron barrio: cada
// uno lee y escribe únicamente en el chat de su propio barrio.

async function currentMember() {
  const neighbor = await getCurrentNeighbor();
  return neighbor?.whatsapp && neighbor.barrio ? { id: neighbor.id, barrioId: neighbor.barrio.id } : null;
}

const notMember = () =>
  Response.json({ error: "Para usar el chat tenés que sumarte al comité de tu barrio." }, { status: 401 });

// GET /api/chat?despues=123 → mensajes posteriores al 123 (la página consulta cada pocos segundos).
export async function GET(request: Request) {
  const member = await currentMember();
  if (!member) return notMember();

  const after = Number(new URL(request.url).searchParams.get("despues"));
  const messages = listMessages(member.barrioId, member.id, Number.isSafeInteger(after) && after > 0 ? after : 0);
  return Response.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}

// POST /api/chat { message } → guarda el mensaje y devuelve los nuevos desde `despues`.
export async function POST(request: Request) {
  const member = await currentMember();
  if (!member) return notMember();

  const body = (await request.json().catch(() => null)) as { message?: unknown; despues?: unknown } | null;
  try {
    addMessage(member.id, member.barrioId, body?.message);
  } catch (error) {
    if (error instanceof ValidationError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }

  const after = Number(body?.despues);
  const messages = listMessages(member.barrioId, member.id, Number.isSafeInteger(after) && after > 0 ? after : 0);
  return Response.json({ messages });
}
