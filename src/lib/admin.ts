// Administración de los mensajes públicos. Se entra por /admin/<ADMIN_TOKEN>: el token se define en
// la variable de entorno ADMIN_TOKEN (en el VPS, en .env.local). Sin esa variable la administración
// queda desactivada y cualquier /admin/... responde 404.
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import type { Topic } from "./contact";

const MIN_TOKEN_LENGTH = 24;

const digest = (value: string) => createHash("sha256").update(value).digest();

export function isAdminToken(token: unknown) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < MIN_TOKEN_LENGTH || typeof token !== "string") return false;
  // Se comparan los hashes para que el tiempo de respuesta no revele cuántos caracteres coinciden.
  return timingSafeEqual(digest(token), digest(expected));
}

export type Filter = "todos" | "visibles" | "ocultos";

export type AdminMessage = {
  id: number;
  createdAt: string;
  topic: Topic;
  firstName: string;
  lastName: string;
  whatsapp: string;
  email: string;
  message: string;
  originalMessage: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  ip: string | null;
  userAgent: string | null;
  hidden: boolean;
};

const WHERE: Record<Filter, string> = {
  todos: "",
  visibles: "WHERE hidden = 0",
  ocultos: "WHERE hidden = 1",
};

export function listAdminMessages(filter: Filter, limit = 200): AdminMessage[] {
  const rows = db
    .prepare(
      `SELECT id, created_at, topic, first_name, last_name, whatsapp, email, message, original_message,
              latitude, longitude, accuracy, ip, user_agent, hidden
       FROM public_messages ${WHERE[filter]} ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: row.id as number,
    createdAt: row.created_at as string,
    topic: row.topic as Topic,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    whatsapp: row.whatsapp as string,
    email: row.email as string,
    message: row.message as string,
    originalMessage: row.original_message as string,
    latitude: row.latitude as number | null,
    longitude: row.longitude as number | null,
    accuracy: row.accuracy as number | null,
    ip: row.ip as string | null,
    userAgent: row.user_agent as string | null,
    hidden: row.hidden === 1,
  }));
}

export function countMessages() {
  return db
    .prepare(
      `SELECT COUNT(*) AS todos,
              COALESCE(SUM(hidden = 0), 0) AS visibles,
              COALESCE(SUM(hidden = 1), 0) AS ocultos
       FROM public_messages`,
    )
    .get() as Record<Filter, number>;
}

export function setMessageHidden(id: number, hidden: boolean) {
  db.prepare("UPDATE public_messages SET hidden = ? WHERE id = ?").run(hidden ? 1 : 0, id);
}

export function deleteMessage(id: number) {
  db.prepare("DELETE FROM public_messages WHERE id = ?").run(id);
}
