// Vecinos de los comités de barrio (Idea 1) y sus sesiones. Se entra con Google (ver google.ts);
// la sesión es un token al azar que vive en una cookie httpOnly, y en la base se guarda su hash.
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireName, requireWhatsapp } from "./contact";
import { db } from "./db";

export { ValidationError } from "./contact";

const SESSION_COOKIE = "sesion";
const SESSION_DAYS = 180;

export type Neighbor = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  whatsapp: string | null;
  createdAt: string;
  barrio: { id: number; name: string; localidad: string | null } | null;
};

type NeighborRow = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  whatsapp: string | null;
  created_at: string;
  barrio_id: number | null;
  barrio_name: string | null;
  barrio_localidad: string | null;
};

const toNeighbor = (row: NeighborRow): Neighbor => ({
  id: row.id,
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  whatsapp: row.whatsapp,
  createdAt: row.created_at,
  barrio:
    row.barrio_id !== null && row.barrio_name !== null
      ? { id: row.barrio_id, name: row.barrio_name, localidad: row.barrio_localidad }
      : null,
});

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// La cookie solo viaja por HTTPS cuando la app se publica con HTTPS (en desarrollo es http).
export const secureCookies = () => (process.env.APP_URL ?? "").startsWith("https://");

export function findNeighborByGoogle(sub: string) {
  const row = db.prepare("SELECT id FROM neighbors WHERE google_sub = ?").get(sub) as { id: number } | undefined;
  return row?.id ?? null;
}

// Alta de un vecino que acaba de aceptar la pantalla de datos. Nombre y apellido vienen de Google
// y el vecino los corrige al completar sus datos.
export function createNeighbor(input: { sub: string; email: string; firstName: string; lastName: string }) {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO neighbors (google_sub, email, first_name, last_name, created_at, updated_at, consent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.sub, input.email, input.firstName, input.lastName, now, now, now);
  return Number(result.lastInsertRowid);
}

// Si el vecino cambió el e-mail de su cuenta de Google, se actualiza al volver a entrar.
export function updateNeighborEmail(id: number, email: string) {
  db.prepare("UPDATE neighbors SET email = ? WHERE id = ? AND email <> ?").run(email, id, email);
}

export function parseProfile(formData: FormData) {
  return {
    firstName: requireName(formData.get("firstName"), "nombre"),
    lastName: requireName(formData.get("lastName"), "apellido"),
    whatsapp: requireWhatsapp(formData.get("whatsapp")),
  };
}

export function updateProfile(id: number, profile: ReturnType<typeof parseProfile>) {
  db.prepare("UPDATE neighbors SET first_name = ?, last_name = ?, whatsapp = ?, updated_at = ? WHERE id = ?").run(
    profile.firstName,
    profile.lastName,
    profile.whatsapp,
    new Date().toISOString(),
    id,
  );
}

// "Borrar mis datos" (Ley 25.326): se borra el vecino, sus sesiones y sus mensajes del chat del
// barrio, no queda copia.
export function deleteNeighbor(id: number) {
  db.prepare("DELETE FROM chat_messages WHERE neighbor_id = ?").run(id);
  db.prepare("DELETE FROM sessions WHERE neighbor_id = ?").run(id);
  db.prepare("DELETE FROM neighbors WHERE id = ?").run(id);
}

// ---------- Sesiones ----------

// Solo se puede llamar desde un Route Handler o una Server Action (es lo que escribe la cookie).
export async function startSession(neighborId: number) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const expires = new Date(now + SESSION_DAYS * 24 * 60 * 60 * 1000);

  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date(now).toISOString());
  db.prepare("INSERT INTO sessions (token_hash, neighbor_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    hashToken(token),
    neighborId,
    new Date(now).toISOString(),
    expires.toISOString(),
  );

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  store.delete(SESSION_COOKIE);
}

// El vecino de la sesión actual, o null si no entró (o si la sesión venció).
export async function getCurrentNeighbor() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT n.id, n.email, n.first_name, n.last_name, n.whatsapp, n.created_at,
              b.id AS barrio_id, b.name AS barrio_name, b.localidad AS barrio_localidad
         FROM sessions s
         JOIN neighbors n ON n.id = s.neighbor_id
         LEFT JOIN barrios b ON b.id = n.barrio_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), new Date().toISOString()) as NeighborRow | undefined;
  return row ? toNeighbor(row) : null;
}
