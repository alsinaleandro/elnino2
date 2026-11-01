// Chat del barrio (Idea 1): mensajes públicos entre los vecinos del comité de un mismo barrio. De
// cada autor se muestra solo el nombre y la inicial del apellido: WhatsApp y e-mail nunca salen de la
// base. No hay mensajes privados.
import { ValidationError } from "./contact";
import { db } from "./db";
import { sanitize } from "./moderation";

// `delegate`: el autor es delegado del barrio (en el chat se marca con una etiqueta).
export type ChatMessage = {
  id: number;
  author: string;
  message: string;
  createdAt: string;
  mine: boolean;
  delegate: boolean;
};

export const MAX_MESSAGE_LENGTH = 500;
// Mensajes que se mandan al abrir el chat (los más recientes) y como mucho en cada consulta.
const PAGE_SIZE = 100;
// Como mucho 10 mensajes por minuto por vecino: frena el spam sin cortar una conversación.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;

type Row = {
  id: number;
  message: string;
  created_at: string;
  neighbor_id: number;
  first_name: string;
  last_name: string;
  delegate_since: string | null;
};

const toMessage = (row: Row, viewerId: number): ChatMessage => ({
  id: row.id,
  author: `${row.first_name} ${row.last_name[0] ?? ""}.`,
  message: row.message,
  createdAt: row.created_at,
  mine: row.neighbor_id === viewerId,
  delegate: row.delegate_since !== null,
});

// Conserva los saltos de línea (como mucho dos seguidos) y junta los espacios.
const cleanMessage = (value: unknown) =>
  typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
    : "";

// Los mensajes del barrio posteriores a `afterId`, del más viejo al más nuevo. Sin `afterId`, los
// últimos PAGE_SIZE.
export function listMessages(barrioId: number, viewerId: number, afterId = 0) {
  const rows = db
    .prepare(
      `SELECT * FROM (
         SELECT m.id, m.message, m.created_at, m.neighbor_id, n.first_name, n.last_name, n.delegate_since
           FROM chat_messages m
           JOIN neighbors n ON n.id = m.neighbor_id
          WHERE m.barrio_id = ? AND m.id > ?
          ORDER BY m.id DESC
          LIMIT ?
       ) ORDER BY id`,
    )
    .all(barrioId, afterId, PAGE_SIZE) as Row[];
  return rows.map((row) => toMessage(row, viewerId));
}

export function addMessage(neighborId: number, barrioId: number, value: unknown) {
  const original = cleanMessage(value);
  if (original.length === 0) throw new ValidationError("Escribí un mensaje.");
  if (original.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`El mensaje no puede pasar los ${MAX_MESSAGE_LENGTH} caracteres.`);
  }

  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count } = db
    .prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE neighbor_id = ? AND created_at > ?")
    .get(neighborId, since) as { count: number };
  if (count >= RATE_LIMIT) throw new ValidationError("Mandaste muchos mensajes seguidos. Esperá un minuto.");

  const result = db
    .prepare(
      "INSERT INTO chat_messages (barrio_id, neighbor_id, message, original_message, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(barrioId, neighborId, sanitize(original), original, new Date().toISOString());
  return Number(result.lastInsertRowid);
}

// Para el menú de Mi barrio: vecinos del comité, cantidad de mensajes y autor del último.
export function getBarrioSummary(barrioId: number) {
  const { neighbors } = db
    .prepare("SELECT COUNT(*) AS neighbors FROM neighbors WHERE barrio_id = ? AND whatsapp IS NOT NULL")
    .get(barrioId) as { neighbors: number };
  const { messages } = db
    .prepare("SELECT COUNT(*) AS messages FROM chat_messages WHERE barrio_id = ?")
    .get(barrioId) as { messages: number };
  const last = db
    .prepare(
      `SELECT n.first_name, n.last_name
         FROM chat_messages m
         JOIN neighbors n ON n.id = m.neighbor_id
        WHERE m.barrio_id = ?
        ORDER BY m.id DESC
        LIMIT 1`,
    )
    .get(barrioId) as { first_name: string; last_name: string } | undefined;
  return {
    neighbors,
    messages,
    lastAuthor: last ? `${last.first_name} ${last.last_name[0] ?? ""}.` : null,
  };
}
