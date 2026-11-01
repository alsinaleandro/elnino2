import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isFacebookConfigured, startFacebookLogin } from "@/lib/facebook";
import { secureCookies } from "@/lib/neighbors";

// Empieza el ingreso con Facebook. "?acepto=1" llega desde la pantalla de aceptación: solo así se
// puede crear un vecino nuevo (los que ya se sumaron entran sin él).
export async function GET(request: Request) {
  const base = process.env.APP_URL ?? request.url;
  if (!isFacebookConfigured()) return NextResponse.redirect(new URL("/organizate?error=config", base));

  const accepted = new URL(request.url).searchParams.get("acepto") === "1";
  const { url, state } = startFacebookLogin();

  (await cookies()).set("oauth_facebook", [state, accepted ? "1" : "0"].join("."), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/api/auth/facebook",
    maxAge: 10 * 60,
  });

  return NextResponse.redirect(url);
}
