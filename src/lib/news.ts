// Novedades de cada barrio. Publican el PTP Chaco (para todos los barrios o para uno) y los
// delegados de cada barrio (solo para el suyo), por ejemplo para anunciar reuniones o asambleas. No
// son comunicados oficiales: la página lo aclara.
import { ValidationError } from "./contact";
import { db } from "./db";
import { sanitize } from "./moderation";

export type NewsPost = {
  id: number;
  // "PTP Chaco" o el nombre completo del delegado (ya es público por ser delegado).
  author: string;
  fromPtp: boolean;
  title: string;
  message: string;
  // Reunión o asamblea: fecha (AAAA-MM-DD) u hora y fecha de Argentina (AAAA-MM-DDTHH:MM), y lugar.
  eventAt: string | null;
  place: string | null;
  createdAt: string;
  mine: boolean;
  // Solo para el panel del PTP.
  barrio: string | null;
};

export const TITLE_MAX = 80;
export const MESSAGE_MAX = 1000;
export const PLACE_MAX = 100;
// Novedades por delegado en un día: frena el spam.
const DELEGATE_DAILY_LIMIT = 5;
const PAGE_SIZE = 50;

type Row = {
  id: number;
  author_kind: "ptp" | "delegado";
  neighbor_id: number | null;
  title: string;
  message: string;
  event_at: string | null;
  place: string | null;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  barrio_name: string | null;
};

const toPost = (row: Row, viewerId: number | null): NewsPost => ({
  id: row.id,
  author: row.author_kind === "ptp" ? "PTP Chaco" : `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
  fromPtp: row.author_kind === "ptp",
  title: row.title,
  message: row.message,
  eventAt: row.event_at,
  place: row.place,
  createdAt: row.created_at,
  mine: viewerId !== null && row.neighbor_id === viewerId,
  barrio: row.barrio_name,
});

const cleanLine = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

// Como en el chat: conserva los saltos de línea (como mucho dos seguidos).
const cleanMessage = (value: unknown) =>
  typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
    : "";

// Las de un delegado se ven solo mientras siga siendo delegado del barrio donde publicó.
const VISIBLE = `(p.author_kind = 'ptp' OR (n.delegate_since IS NOT NULL AND n.barrio_id = p.barrio_id))`;

// Novedades de un barrio: las del PTP para ese barrio o para todos, y las de sus delegados.
export function listNews(barrioId: number, viewerId: number): NewsPost[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.author_kind, p.neighbor_id, p.title, p.message, p.event_at, p.place, p.created_at,
              n.first_name, n.last_name, NULL AS barrio_name
         FROM news_posts p
         LEFT JOIN neighbors n ON n.id = p.neighbor_id
        WHERE (p.barrio_id = ? OR (p.barrio_id IS NULL AND p.author_kind = 'ptp')) AND ${VISIBLE}
        ORDER BY p.id DESC
        LIMIT ?`,
    )
    .all(barrioId, PAGE_SIZE) as Row[];
  return rows.map((row) => toPost(row, viewerId));
}

// Para el menú de Mi barrio: cuántas hay y cuándo se publicó la última.
export function newsSummary(barrioId: number) {
  return db
    .prepare(
      `SELECT COUNT(*) AS count, MAX(p.created_at) AS lastAt
         FROM news_posts p
         LEFT JOIN neighbors n ON n.id = p.neighbor_id
        WHERE (p.barrio_id = ? OR (p.barrio_id IS NULL AND p.author_kind = 'ptp')) AND ${VISIBLE}`,
    )
    .get(barrioId) as { count: number; lastAt: string | null };
}

// Todas, para el panel del PTP (incluidas las de delegados que ya no lo son, para poder borrarlas).
export function listAllNews(): NewsPost[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.author_kind, p.neighbor_id, p.title, p.message, p.event_at, p.place, p.created_at,
              n.first_name, n.last_name, b.name AS barrio_name
         FROM news_posts p
         LEFT JOIN neighbors n ON n.id = p.neighbor_id
         LEFT JOIN barrios b ON b.id = p.barrio_id
        ORDER BY p.id DESC
        LIMIT 200`,
    )
    .all() as Row[];
  return rows.map((row) => toPost(row, null));
}

type NewsInput = { title: unknown; message: unknown; eventDate: unknown; eventTime: unknown; place: unknown };

function parseNews(input: NewsInput) {
  const title = cleanLine(input.title);
  if (title.length < 3) throw new ValidationError("Escribí un título.");
  if (title.length > TITLE_MAX) throw new ValidationError(`El título no puede pasar los ${TITLE_MAX} caracteres.`);

  const message = cleanMessage(input.message);
  if (message.length < 10) throw new ValidationError("Contá un poco más en el texto de la novedad.");
  if (message.length > MESSAGE_MAX) {
    throw new ValidationError(`El texto no puede pasar los ${MESSAGE_MAX} caracteres.`);
  }

  // Fecha y hora son opcionales, pero la hora sola no sirve.
  const date = cleanLine(input.eventDate);
  const time = cleanLine(input.eventTime);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError("Revisá la fecha de la reunión.");
  if (time && !/^\d{2}:\d{2}$/.test(time)) throw new ValidationError("Revisá la hora de la reunión.");
  if (time && !date) throw new ValidationError("Si ponés la hora, poné también la fecha.");
  // Sin hora se guarda solo la fecha (AAAA-MM-DD), para no mostrar una reunión a las 00:00.
  const eventAt = date ? (time ? `${date}T${time}` : date) : null;

  const place = cleanLine(input.place);
  if (place.length > PLACE_MAX) throw new ValidationError(`El lugar no puede pasar los ${PLACE_MAX} caracteres.`);

  return { title, message, eventAt, place: place || null };
}

function insertNews(
  post: ReturnType<typeof parseNews>,
  author: { kind: "ptp"; barrioId: number | null } | { kind: "delegado"; barrioId: number; neighborId: number },
) {
  db.prepare(
    `INSERT INTO news_posts
       (barrio_id, author_kind, neighbor_id, title, message, original_message, event_at, place, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    author.barrioId,
    author.kind,
    author.kind === "delegado" ? author.neighborId : null,
    sanitize(post.title),
    sanitize(post.message),
    post.message,
    post.eventAt,
    post.place ? sanitize(post.place) : null,
    new Date().toISOString(),
  );
}

// Un delegado publica para su barrio. Se vuelve a comprobar que sea delegado.
export function addDelegateNews(neighborId: number, input: NewsInput) {
  const me = db
    .prepare("SELECT barrio_id, delegate_since FROM neighbors WHERE id = ?")
    .get(neighborId) as { barrio_id: number | null; delegate_since: string | null } | undefined;
  if (!me?.barrio_id || !me.delegate_since) {
    throw new ValidationError("Solo los delegados del barrio pueden publicar novedades.");
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = db
    .prepare("SELECT COUNT(*) AS count FROM news_posts WHERE neighbor_id = ? AND created_at > ?")
    .get(neighborId, since) as { count: number };
  if (count >= DELEGATE_DAILY_LIMIT) {
    throw new ValidationError(`Ya publicaste ${DELEGATE_DAILY_LIMIT} novedades hoy. Probá mañana.`);
  }

  insertNews(parseNews(input), { kind: "delegado", barrioId: me.barrio_id, neighborId });
}

// El PTP publica para un barrio o, con barrioId null, para todos.
export function addPtpNews(barrioId: number | null, input: NewsInput) {
  if (barrioId !== null && !db.prepare("SELECT id FROM barrios WHERE id = ?").get(barrioId)) {
    throw new ValidationError("Ese barrio no existe.");
  }
  insertNews(parseNews(input), { kind: "ptp", barrioId });
}

// El delegado borra solo las suyas; el PTP, cualquiera.
export function deleteOwnNews(neighborId: number, postId: number) {
  db.prepare("DELETE FROM news_posts WHERE id = ? AND neighbor_id = ?").run(postId, neighborId);
}

export function deleteNews(postId: number) {
  db.prepare("DELETE FROM news_posts WHERE id = ?").run(postId);
}

// Barrios con vecinos en el comité, para elegir a cuál va una novedad del PTP.
export function listBarriosWithMembers() {
  return db
    .prepare(
      `SELECT b.id, b.name, b.localidad, COUNT(n.id) AS neighbors
         FROM barrios b
         JOIN neighbors n ON n.barrio_id = b.id AND n.whatsapp IS NOT NULL
        GROUP BY b.id
        ORDER BY b.name`,
    )
    .all() as Array<{ id: number; name: string; localidad: string | null; neighbors: number }>;
}
