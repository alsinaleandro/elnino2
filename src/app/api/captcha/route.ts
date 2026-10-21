import { NextResponse } from "next/server";
import { createCaptcha } from "@/lib/captcha";

// Un captcha nuevo por pedido: el formulario lo pide al abrirse y después de cada envío.
export async function GET() {
  return NextResponse.json(createCaptcha(), { headers: { "Cache-Control": "no-store" } });
}
