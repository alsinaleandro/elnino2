// Ingreso con Google (OAuth 2.0 / OpenID Connect, flujo "authorization code" con PKCE), sin
// librerías. Variables de entorno (en el VPS, en .env.local de cada instalación):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  credenciales OAuth de Google Cloud Console
//   APP_URL  dirección pública de la app, ej. https://test.ptpchaco.org.ar (sin barra final)
// En Google Cloud Console, cada instalación registra su URI de redirección:
//   <APP_URL>/api/auth/google/callback
import { createHash, randomBytes } from "node:crypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export const isGoogleConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_URL);

const redirectUri = () => `${process.env.APP_URL}/api/auth/google/callback`;

// "state" protege contra que otro sitio nos haga terminar un ingreso que no empezamos; "verifier"
// es el secreto de PKCE. Los dos viajan en una cookie httpOnly hasta que Google vuelve.
export function startLogin() {
  const state = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  return { url: url.toString(), state, verifier };
}

export type GoogleProfile = { sub: string; email: string; firstName: string; lastName: string };

// Cambia el código que devolvió Google por el id_token y lo lee. El id_token llega directo de
// Google por HTTPS, así que no hace falta verificar su firma (OpenID Connect, sección 3.1.3.7);
// sí se comprueba que sea para esta app y que no esté vencido.
export async function finishLogin(code: string, verifier: string): Promise<GoogleProfile> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Google respondió ${response.status}: ${await response.text()}`);

  const { id_token: idToken } = (await response.json()) as { id_token?: string };
  const payload = JSON.parse(Buffer.from(idToken?.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;

  if (!ISSUERS.includes(String(payload.iss))) throw new Error("id_token con emisor desconocido.");
  if (payload.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error("id_token para otra aplicación.");
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) throw new Error("id_token vencido.");
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") throw new Error("id_token incompleto.");
  if (payload.email_verified !== true) throw new Error("E-mail de Google sin verificar.");

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    firstName: typeof payload.given_name === "string" ? payload.given_name.slice(0, 40) : "",
    lastName: typeof payload.family_name === "string" ? payload.family_name.slice(0, 40) : "",
  };
}
