import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isGoogleConfigured, startLogin } from "@/lib/google";
import { secureCookies } from "@/lib/neighbors";

// Empieza el ingreso con Google. "?acepto=1" llega desde la pantalla de aceptación: solo así se
// puede crear un vecino nuevo (los que ya se sumaron entran sin él).
export async function GET(request: Request) {
  const base = process.env.APP_URL ?? request.url;
  if (!isGoogleConfigured()) return NextResponse.redirect(new URL("/organizate?error=config", base));

  const accepted = new URL(request.url).searchParams.get("acepto") === "1";
  const { url, state, verifier } = startLogin();

  (await cookies()).set("oauth_google", [state, verifier, accepted ? "1" : "0"].join("."), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 10 * 60,
  });

  return NextResponse.redirect(url);
}
