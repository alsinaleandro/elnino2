// Mensajes de la pestaña Contactanos: validación, guardado y listado de los públicos.
import { db } from "./db";
import { hasLink, sanitize } from "./moderation";

export type Topic = "zona" | "sugerencia";

// Lo único que se publica de cada mensaje: nombre e inicial del apellido, tema, texto y fecha.
export type PublicMessage = { id: number; author: string; topic: Topic; message: string; createdAt: string };

// Máximo de mensajes (públicos + privados) por IP en una hora.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

export class ValidationError extends Error {}

const clean = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

// El texto del mensaje conserva los saltos de línea (como mucho dos seguidos).
const cleanMessage = (value: unknown) =>
  typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
    : "";

function requireName(value: unknown, label: string) {
  const name = clean(value);
  if (name.length < 2 || name.length > 40 || !/^[\p{L}' .-]+$/u.test(name)) {
    throw new ValidationError(`Revisá el ${label}: solo letras, entre 2 y 40.`);
  }
  return name;
}

function requireEmail(value: unknown) {
  const email = clean(value).toLowerCase();
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new ValidationError("Revisá el e-mail.");
  }
  return email;
}

function requireWhatsapp(value: unknown) {
  const whatsapp = clean(value).replace(/[\s().-]/g, "");
  if (!/^\+?\d{8,15}$/.test(whatsapp)) {
    throw new ValidationError("Revisá el WhatsApp: con característica, por ejemplo 362 4123456.");
  }
  return whatsapp;
}

function requireMessage(value: unknown, max: number) {
  const message = cleanMessage(value);
  if (message.length < 10) throw new ValidationError("El mensaje es muy corto.");
  if (message.length > max) throw new ValidationError(`El mensaje no puede pasar los ${max} caracteres.`);
  return message;
}

// Coordenadas GPS que manda la página, si el visitante compartió su ubicación.
function optionalLocation(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const { latitude, longitude, accuracy } = value as Record<string, unknown>;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude, accuracy: typeof accuracy === "number" && accuracy >= 0 ? accuracy : null };
}

export type Requester = { ip: string | null; userAgent: string | null };

export function getRequester(request: Request): Requester {
  // Detrás de nginx la IP real llega en X-Forwarded-For (la primera de la lista).
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || request.headers.get("x-real-ip") || null,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  };
}

export function isRateLimited(ip: string | null) {
  if (!ip) return false;
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const row = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM public_messages WHERE ip = ? AND created_at > ?)
            + (SELECT COUNT(*) FROM private_messages WHERE ip = ? AND created_at > ?) AS total`,
    )
    .get(ip, since, ip, since) as { total: number };
  return row.total >= RATE_LIMIT;
}

export function parsePublicMessage(body: Record<string, unknown>) {
  const topic: Topic = body.topic === "sugerencia" ? "sugerencia" : "zona";
  const message = requireMessage(body.message, 1000);
  if (hasLink(message)) throw new ValidationError("Los mensajes públicos no pueden tener enlaces.");

  return {
    topic,
    firstName: requireName(body.firstName, "nombre"),
    lastName: requireName(body.lastName, "apellido"),
    whatsapp: requireWhatsapp(body.whatsapp),
    email: requireEmail(body.email),
    message,
    location: optionalLocation(body.location),
  };
}

export function parsePrivateMessage(body: Record<string, unknown>) {
  return {
    firstName: requireName(body.firstName, "nombre"),
    lastName: requireName(body.lastName, "apellido"),
    whatsapp: requireWhatsapp(body.whatsapp),
    email: requireEmail(body.email),
    message: requireMessage(body.message, 2000),
    location: optionalLocation(body.location),
  };
}

export function savePublicMessage(input: ReturnType<typeof parsePublicMessage>, requester: Requester) {
  db.prepare(
    `INSERT INTO public_messages
       (created_at, topic, first_name, last_name, whatsapp, email, message, original_message,
        latitude, longitude, accuracy, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    new Date().toISOString(),
    input.topic,
    input.firstName,
    input.lastName,
    input.whatsapp,
    input.email,
    sanitize(input.message),
    input.message,
    input.location?.latitude ?? null,
    input.location?.longitude ?? null,
    input.location?.accuracy ?? null,
    requester.ip,
    requester.userAgent,
  );
}

export function savePrivateMessage(input: ReturnType<typeof parsePrivateMessage>, requester: Requester) {
  const result = db
    .prepare(
      `INSERT INTO private_messages
         (created_at, first_name, last_name, whatsapp, email, message, latitude, longitude, accuracy, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      new Date().toISOString(),
      input.firstName,
      input.lastName,
      input.whatsapp,
      input.email,
      input.message,
      input.location?.latitude ?? null,
      input.location?.longitude ?? null,
      input.location?.accuracy ?? null,
      requester.ip,
      requester.userAgent,
    );
  return Number(result.lastInsertRowid);
}

export function markEmailed(id: number) {
  db.prepare("UPDATE private_messages SET emailed = 1 WHERE id = ?").run(id);
}

export function listPublicMessages(limit = 50): PublicMessage[] {
  const rows = db
    .prepare(
      `SELECT id, created_at, topic, first_name, last_name, message
       FROM public_messages WHERE hidden = 0 ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as Array<{
    id: number;
    created_at: string;
    topic: Topic;
    first_name: string;
    last_name: string;
    message: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    author: sanitize(`${row.first_name} ${row.last_name[0].toUpperCase()}.`),
    topic: row.topic,
    message: row.message,
    createdAt: row.created_at,
  }));
}
