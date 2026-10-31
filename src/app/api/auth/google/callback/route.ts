import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { finishLogin } from "@/lib/google";
import { createNeighbor, findNeighborByGoogle, startSession, updateNeighborEmail } from "@/lib/neighbors";

// Google vuelve acá después de que el vecino elige su cuenta. Se comprueba el "state", se abre la
// sesión y se vuelve a /organizate (ahí se completan los datos si faltan).
export async function GET(request: Request) {
  const base = process.env.APP_URL ?? request.url;
  const back = (query = "") => NextResponse.redirect(new URL(`/organizate${query}`, base));

  const params = new URL(request.url).searchParams;
  const store = await cookies();
  const [state, verifier, accepted] = (store.get("oauth_google")?.value ?? "").split(".");
  store.delete({ name: "oauth_google", path: "/api/auth/google" });

  // El vecino tocó "Cancelar" en la pantalla de Google.
  if (params.get("error")) return back();
  const code = params.get("code");
  if (!code || !state || params.get("state") !== state) return back("?error=google");

  let profile;
  try {
    profile = await finishLogin(code, verifier);
  } catch (error) {
    console.error("[organizate] Falló el ingreso con Google:", error);
    return back("?error=google");
  }

  let neighborId = findNeighborByGoogle(profile.sub);
  if (neighborId === null) {
    if (accepted !== "1") return back("?error=aceptar");
    neighborId = createNeighbor(profile);
  } else {
    updateNeighborEmail(neighborId, profile.email);
  }

  await startSession(neighborId);
  return back();
}
