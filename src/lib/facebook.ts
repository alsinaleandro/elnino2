// Ingreso con Facebook (OAuth 2.0, flujo "authorization code" del lado del servidor), sin
// librerías. Variables de entorno (en el VPS, en .env.local de cada instalación):
//   FACEBOOK_APP_ID, FACEBOOK_APP_SECRET  de la app en developers.facebook.com
//   FACEBOOK_GRAPH_VERSION  versión de la Graph API (opcional; por defecto la de abajo)
//   APP_URL  dirección pública de la app (la misma que usa Google)
// En la configuración de "Inicio de sesión con Facebook", cada instalación registra su URI de
// redirección: <APP_URL>/api/auth/facebook/callback
import { createHmac, randomBytes } from "node:crypto";

// Meta retira cada versión unos dos años después de publicarla: si deja de andar, subirla con
// FACEBOOK_GRAPH_VERSION sin tocar el código.
const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION ?? "v23.0";

export const isFacebookConfigured = () =>
  Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET && process.env.APP_URL);

const redirectUri = () => `${process.env.APP_URL}/api/auth/facebook/callback`;

// "state" protege contra que otro sitio nos haga terminar un ingreso que no empezamos: viaja en una
// cookie httpOnly hasta que Facebook vuelve.
export function startFacebookLogin() {
  const state = randomBytes(16).toString("base64url");
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.search = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "public_profile,email",
    state,
  }).toString();
  return { url: url.toString(), state };
}

// Facebook no dice si el e-mail está verificado: por eso estas cuentas no se unen con otras por
// e-mail (ver neighbors.ts). `email` es null si la persona no lo compartió o no tiene.
export type FacebookProfile = { id: string; email: string | null; firstName: string; lastName: string };

async function graph<T>(path: string, params: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Facebook respondió ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

// Cambia el código por un token de acceso y pide el perfil. El token llega directo de Facebook por
// HTTPS. appsecret_proof prueba que el pedido sale de nuestro servidor.
export async function finishFacebookLogin(code: string): Promise<FacebookProfile> {
  const { access_token: token } = await graph<{ access_token?: string }>("oauth/access_token", {
    client_id: process.env.FACEBOOK_APP_ID ?? "",
    client_secret: process.env.FACEBOOK_APP_SECRET ?? "",
    redirect_uri: redirectUri(),
    code,
  });
  if (!token) throw new Error("Facebook no devolvió el token de acceso.");

  const proof = createHmac("sha256", process.env.FACEBOOK_APP_SECRET ?? "").update(token).digest("hex");
  const profile = await graph<{ id?: string; email?: string; first_name?: string; last_name?: string }>("me", {
    fields: "id,email,first_name,last_name",
    access_token: token,
    appsecret_proof: proof,
  });
  if (typeof profile.id !== "string") throw new Error("Perfil de Facebook incompleto.");

  return {
    id: profile.id,
    email: typeof profile.email === "string" ? profile.email.toLowerCase() : null,
    firstName: typeof profile.first_name === "string" ? profile.first_name.slice(0, 40) : "",
    lastName: typeof profile.last_name === "string" ? profile.last_name.slice(0, 40) : "",
  };
}
