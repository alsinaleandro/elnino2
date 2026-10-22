// Mensajes públicos de la pestaña Contactanos.
import { NextResponse } from "next/server";
import { verifyCaptcha } from "@/lib/captcha";
import {
  getRequester,
  isRateLimited,
  listPublicMessages,
  parsePublicMessage,
  savePublicMessage,
  ValidationError,
} from "@/lib/contact";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// GET: los últimos mensajes, sin datos de contacto ni ubicación.
export async function GET() {
  return NextResponse.json({ messages: listPublicMessages() }, { headers: { "Cache-Control": "no-store" } });
}

// POST: publica un mensaje. Body: { topic, firstName, lastName, whatsapp, email, message,
// location?, captchaId, captchaAnswer }.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail("Pedido inválido.");

  let input;
  try {
    input = parsePublicMessage(body);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message);
    throw error;
  }

  if (!verifyCaptcha(body.captchaId, body.captchaAnswer)) {
    return fail("La respuesta del captcha no es correcta. Probá con el nuevo.");
  }

  const requester = getRequester(request);
  if (isRateLimited(requester.ip)) return fail("Mandaste varios mensajes seguidos. Probá de nuevo en un rato.", 429);

  savePublicMessage(input, requester);
  return NextResponse.json({ ok: true, messages: listPublicMessages() });
}
