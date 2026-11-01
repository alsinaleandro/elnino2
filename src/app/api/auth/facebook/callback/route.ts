import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { finishFacebookLogin } from "@/lib/facebook";
import { createFacebookNeighbor, findNeighborByFacebook, isEmailInUse, startSession } from "@/lib/neighbors";

// Facebook vuelve acá después de que el vecino acepta. Se comprueba el "state", se abre la sesión y
// se vuelve a /organizate (ahí se completan los datos si faltan). Una cuenta de Facebook nueva no se
// une con otra que tenga el mismo e-mail (ver neighbors.ts).
export async function GET(request: Request) {
  const base = process.env.APP_URL ?? request.url;
  const back = (query = "") => NextResponse.redirect(new URL(`/organizate${query}`, base));

  const params = new URL(request.url).searchParams;
  const store = await cookies();
  const [state, accepted] = (store.get("oauth_facebook")?.value ?? "").split(".");
  store.delete({ name: "oauth_facebook", path: "/api/auth/facebook" });

  // El vecino tocó "Cancelar" en la pantalla de Facebook.
  if (params.get("error")) return back();
  const code = params.get("code");
  if (!code || !state || params.get("state") !== state) return back("?error=facebook");

  let profile;
  try {
    profile = await finishFacebookLogin(code);
  } catch (error) {
    console.error("[organizate] Falló el ingreso con Facebook:", error);
    return back("?error=facebook");
  }

  let neighborId = findNeighborByFacebook(profile.id);
  if (neighborId === null) {
    if (accepted !== "1") return back("?error=aceptar");
    if (!profile.email) return back("?error=facebook-email");
    if (isEmailInUse(profile.email)) return back("?error=facebook-existe");
    neighborId = createFacebookNeighbor({ ...profile, email: profile.email });
  }

  await startSession(neighborId);
  return back();
}
