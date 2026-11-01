// Ingreso con e-mail y contraseña, como alternativa a Google. Para crear la cuenta (o elegir una
// contraseña nueva) el vecino recibe un link por e-mail y al abrirlo elige su contraseña: recién ahí
// se crea la cuenta, así que nadie puede usar un e-mail que no es suyo. Si ya existe una cuenta con
// ese e-mail (por ejemplo, de Google), el link le agrega la contraseña a esa misma cuenta.
//
// Las contraseñas se guardan con scrypt (con sal al azar): en la base no queda la contraseña.
// Necesita el SMTP configurado (mailer.ts) y APP_URL para armar el link.
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { clientIp, createFailureLimiter } from "./clientIp";
import { requireEmail, ValidationError } from "./contact";
import { db } from "./db";
import { isMailerConfigured, sendPasswordLink } from "./mailer";

export type LinkPurpose = "alta" | "clave";

const LINK_HOURS: Record<LinkPurpose, number> = { alta: 24, clave: 1 };
// Links que se mandan como mucho a un mismo e-mail en una hora.
const LINKS_PER_HOUR = 3;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
// 10 intentos fallidos de ingreso desde una IP la bloquean 15 minutos.
const loginFailures = createFailureLimiter(10, 15 * 60 * 1000);

const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 32;

export const isEmailLoginConfigured = () => isMailerConfigured() && Boolean(process.env.APP_URL);

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// ---------- Contraseñas ----------

function derive(password: string, salt: Buffer, params = SCRYPT) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, params, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

// "scrypt$N$r$p$sal$hash": los parámetros quedan guardados para poder subirlos más adelante.
async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, N, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await derive(password, Buffer.from(salt, "base64"), { N: Number(N), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Para que una cuenta que no existe tarde lo mismo que una contraseña equivocada.
const DUMMY_HASH = hashPassword("contraseña de relleno");

export function requirePassword(value: unknown) {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    throw new ValidationError(`La contraseña no puede pasar los ${MAX_PASSWORD_LENGTH} caracteres.`);
  }
  return value;
}

// ---------- Links por e-mail ----------

// Las cuentas de Facebook quedan afuera: su e-mail no está comprobado, y agregarles una contraseña
// sería darle a otra persona una cuenta que puede abrir con su Facebook (ver neighbors.ts).
const findByEmail = (email: string) =>
  db.prepare("SELECT id FROM neighbors WHERE email = ? AND facebook_id IS NULL ORDER BY id LIMIT 1").get(email) as
    | { id: number }
    | undefined;

// "alta" se pide después de aceptar "Cómo usamos tus datos"; "clave", desde "¿Olvidaste tu
// contraseña?". La respuesta es la misma haya o no una cuenta con ese e-mail, para no revelar quién
// está registrado: con "clave" y sin cuenta, simplemente no se manda nada.
export async function requestPasswordLink(value: unknown, purpose: LinkPurpose) {
  if (!isEmailLoginConfigured()) throw new ValidationError("El ingreso con e-mail no está configurado en este servidor.");
  const email = requireEmail(value);

  const now = Date.now();
  db.prepare("DELETE FROM email_tokens WHERE expires_at < ?").run(new Date(now).toISOString());
  const { count } = db
    .prepare("SELECT COUNT(*) AS count FROM email_tokens WHERE email = ? AND created_at > ?")
    .get(email, new Date(now - 60 * 60 * 1000).toISOString()) as { count: number };
  if (count >= LINKS_PER_HOUR) {
    throw new ValidationError("Ya te mandamos varios links. Revisá tu correo (también la carpeta de spam) o probá en una hora.");
  }

  if (purpose === "clave" && !findByEmail(email)) return;

  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO email_tokens (token_hash, email, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)").run(
    hashToken(token),
    email,
    purpose,
    new Date(now).toISOString(),
    new Date(now + LINK_HOURS[purpose] * 60 * 60 * 1000).toISOString(),
  );

  const link = `${process.env.APP_URL}/organizate/clave?token=${token}`;
  if (!(await sendPasswordLink(email, link, purpose, LINK_HOURS[purpose]))) {
    throw new ValidationError("No pudimos mandarte el e-mail. Probá de nuevo más tarde.");
  }
}

type TokenRow = { email: string; purpose: LinkPurpose };

// Para la página del link: a qué e-mail corresponde, sin usarlo todavía.
export function checkPasswordLink(token: unknown) {
  if (typeof token !== "string" || token.length < 20) return null;
  return (
    (db
      .prepare("SELECT email, purpose FROM email_tokens WHERE token_hash = ? AND expires_at > ?")
      .get(hashToken(token), new Date().toISOString()) as TokenRow | undefined) ?? null
  );
}

// Usa el link: guarda la contraseña (creando la cuenta si es un "alta" y no existía) y devuelve el
// id del vecino. Al usarlo se borran todos los links pendientes de ese e-mail.
export async function redeemPasswordLink(token: unknown, password: unknown) {
  const newPassword = requirePassword(password);
  const link = checkPasswordLink(token);
  if (!link) throw new ValidationError("El link venció o ya se usó. Pedí uno nuevo.");

  const hash = await hashPassword(newPassword);
  // Se borra antes de seguir: si llegan dos pedidos con el mismo link, solo uno lo usa.
  const used = db.prepare("DELETE FROM email_tokens WHERE token_hash = ?").run(hashToken(token as string));
  if (used.changes !== 1) throw new ValidationError("El link venció o ya se usó. Pedí uno nuevo.");
  db.prepare("DELETE FROM email_tokens WHERE email = ?").run(link.email);

  const now = new Date().toISOString();
  const existing = findByEmail(link.email);
  if (existing) {
    db.prepare("UPDATE neighbors SET password_hash = ?, updated_at = ? WHERE id = ?").run(hash, now, existing.id);
    return existing.id;
  }
  if (link.purpose !== "alta") throw new ValidationError("No hay ninguna cuenta con ese e-mail.");

  // Nombre y apellido se completan en el paso siguiente ("Tus datos").
  const result = db
    .prepare(
      `INSERT INTO neighbors (email, first_name, last_name, password_hash, created_at, updated_at, consent_at)
       VALUES (?, '', '', ?, ?, ?, ?)`,
    )
    .run(link.email, hash, now, now, now);
  return Number(result.lastInsertRowid);
}

// ---------- Ingreso ----------

export type PasswordLoginResult = { ok: true; neighborId: number } | { ok: false; error: string };

export async function loginWithPassword(emailValue: unknown, password: unknown): Promise<PasswordLoginResult> {
  const ip = await clientIp();
  if (loginFailures.isBlocked(ip)) {
    return { ok: false, error: "Demasiados intentos fallidos. Probá de nuevo en 15 minutos." };
  }

  const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  const row = db
    .prepare("SELECT id, password_hash FROM neighbors WHERE email = ? AND password_hash IS NOT NULL ORDER BY id LIMIT 1")
    .get(email) as { id: number; password_hash: string } | undefined;
  const ok =
    typeof password === "string" &&
    password.length <= MAX_PASSWORD_LENGTH &&
    (await verifyPassword(password, row?.password_hash ?? (await DUMMY_HASH)));

  if (!row || !ok) {
    loginFailures.record(ip);
    return { ok: false, error: "El e-mail o la contraseña no son correctos." };
  }
  loginFailures.clear(ip);
  return { ok: true, neighborId: row.id };
}
