// Mensajes privados de la pestaña Contactanos: se guardan y se envían por e-mail.
import { NextResponse } from "next/server";
import { verifyCaptcha } from "@/lib/captcha";
import {
  getRequester,
  isRateLimited,
  markEmailed,
  parsePrivateMessage,
  savePrivateMessage,
  ValidationError,
} from "@/lib/contact";
import { sendPrivateMessage } from "@/lib/mailer";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// POST: body { firstName, lastName, whatsapp, email, message, location?, captchaId, captchaAnswer }.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail("Pedido inválido.");

  let input;
  try {
    input = parsePrivateMessage(body);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message);
    throw error;
  }

  if (!verifyCaptcha(body.captchaId, body.captchaAnswer)) {
    return fail("La respuesta del captcha no es correcta. Probá con el nuevo.");
  }

  const requester = getRequester(request);
  if (isRateLimited(requester.ip)) return fail("Mandaste varios mensajes seguidos. Probá de nuevo en un rato.", 429);

  // El mensaje queda guardado aunque el e-mail falle, así no se pierde.
  const id = savePrivateMessage(input, requester);
  if (await sendPrivateMessage(input)) markEmailed(id);

  return NextResponse.json({ ok: true });
}
