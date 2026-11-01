// Ingreso al panel de administración (/ptpadmin) con una contraseña. La contraseña se define en la
// variable de entorno ADMIN_PASSWORD (en el VPS, en .env.local), con al menos 12 caracteres; sin ella
// el panel queda desactivado.
//
// La sesión es una cookie firmada con una clave que sale de la contraseña: dura SESSION_HOURS y, si
// se cambia la contraseña, todas las sesiones abiertas dejan de valer. Después de varios intentos
// fallidos desde la misma IP, el ingreso se bloquea un rato.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp, createFailureLimiter } from "./clientIp";
import { secureCookies } from "./neighbors";

const COOKIE = "admin_sesion";
const SESSION_HOURS = 12;
const MIN_PASSWORD_LENGTH = 12;
// 5 intentos fallidos desde una IP bloquean el ingreso 15 minutos.
const failures = createFailureLimiter(5, 15 * 60 * 1000);

const digest = (value: string) => createHash("sha256").update(value).digest();

function configuredPassword() {
  const password = process.env.ADMIN_PASSWORD;
  return password && password.length >= MIN_PASSWORD_LENGTH ? password : null;
}

export const isAdminConfigured = () => configuredPassword() !== null;

const sign = (password: string, value: string) =>
  createHmac("sha256", digest(`admin-session:${password}`)).update(value).digest("base64url");

// Se comparan hashes para que el tiempo de respuesta no revele cuántos caracteres coinciden.
function checkPassword(input: unknown) {
  const password = configuredPassword();
  if (!password || typeof input !== "string") return false;
  return timingSafeEqual(digest(input), digest(password));
}

// ---------- Sesión ----------

export type LoginResult = "ok" | "wrong" | "blocked" | "disabled";

// Solo se puede llamar desde una Server Action (escribe la cookie).
export async function login(input: unknown): Promise<LoginResult> {
  const password = configuredPassword();
  if (!password) return "disabled";

  const ip = await clientIp();
  if (failures.isBlocked(ip)) return "blocked";
  if (!checkPassword(input)) {
    failures.record(ip);
    return failures.isBlocked(ip) ? "blocked" : "wrong";
  }
  failures.clear(ip);

  const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  (await cookies()).set(COOKIE, `${expires}.${sign(password, String(expires))}`, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "strict",
    path: "/ptpadmin",
    expires: new Date(expires),
  });
  return "ok";
}

export async function logout() {
  (await cookies()).delete({ name: COOKIE, path: "/ptpadmin" });
}

export async function isAdmin() {
  const password = configuredPassword();
  const value = (await cookies()).get(COOKIE)?.value;
  if (!password || !value) return false;

  const [expires, signature] = value.split(".");
  if (!expires || !signature || !(Number(expires) > Date.now())) return false;
  return timingSafeEqual(digest(signature), digest(sign(password, expires)));
}

// Para cada página y cada Server Action del panel: sin sesión, vuelve a la pantalla de ingreso.
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/ptpadmin");
}
