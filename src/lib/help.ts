// Ayuda mutua (Idea 6): tablero "Ofrezco / Necesito" de cada barrio, para los vecinos del comité.
// Como no hay mensajes privados, el contacto es por el chat del barrio o un delegado; la única
// excepción la elige quien pide ayuda: puede mostrar su WhatsApp en esa publicación.
import { ValidationError } from "./contact";
import { db } from "./db";
import { phoneLink, whatsappLink } from "./links";
import { sanitize } from "./moderation";

export type HelpKind = "ofrezco" | "necesito";

export type HelpPost = {
  id: number;
  kind: HelpKind;
  author: string;
  authorIsDelegate: boolean;
  message: string;
  createdAt: string;
  mine: boolean;
  // Solo si quien pide ayuda permitió el contacto directo en esta publicación.
  contact: { whatsapp: string; whatsappLink: string | null; phoneLink: string | null } | null;
};

// Una publicación se ve durante una semana, salvo que su autor la marque como resuelta o la borre.
export const VISIBLE_DAYS = 7;
const MIN_LENGTH = 5;
export const MAX_LENGTH = 300;
// Publicaciones abiertas a la vez por vecino: frena el spam y obliga a cerrar las resueltas.
const MAX_OPEN_POSTS = 5;

type Row = {
  id: number;
  kind: HelpKind;
  message: string;
  created_at: string;
  allow_contact: number;
  neighbor_id: number;
  first_name: string;
  last_name: string;
  whatsapp: string;
  delegate_since: string | null;
};

const visibleSince = () => new Date(Date.now() - VISIBLE_DAYS * 24 * 60 * 60 * 1000).toISOString();

// Mismo criterio que el chat: conserva los saltos de línea (como mucho dos seguidos).
const cleanMessage = (value: unknown) =>
  typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
    : "";

// Publicaciones vigentes del barrio, de la más nueva a la más vieja.
export function listHelpPosts(barrioId: number, viewerId: number, kind?: HelpKind): HelpPost[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.kind, p.message, p.created_at, p.allow_contact, p.neighbor_id,
              n.first_name, n.last_name, n.whatsapp, n.delegate_since
         FROM help_posts p
         JOIN neighbors n ON n.id = p.neighbor_id
        WHERE p.barrio_id = ? AND p.resolved_at IS NULL AND p.created_at > ? AND (? IS NULL OR p.kind = ?)
        ORDER BY p.id DESC`,
    )
    .all(barrioId, visibleSince(), kind ?? null, kind ?? null) as Row[];

  return rows.map((row) => toPost(row, viewerId));
}

// Lo que ve cualquier vecino del barrio: nombre e inicial del apellido, y el WhatsApp solo si quien
// pide ayuda lo permitió en esa publicación.
const toPost = (row: Row, viewerId: number | null): HelpPost => ({
  id: row.id,
  kind: row.kind,
  author: `${row.first_name} ${row.last_name[0] ?? ""}.`,
  authorIsDelegate: row.delegate_since !== null,
  message: row.message,
  createdAt: row.created_at,
  mine: viewerId !== null && row.neighbor_id === viewerId,
  contact:
    row.kind === "necesito" && row.allow_contact === 1
      ? { whatsapp: row.whatsapp, whatsappLink: whatsappLink(row.whatsapp), phoneLink: phoneLink(row.whatsapp) }
      : null,
});

// ---------- Panel del PTP ----------

export type BarrioHelp = {
  barrioId: number;
  barrio: string;
  localidad: string | null;
  necesito: number;
  ofrezco: number;
  posts: HelpPost[];
};

// Publicaciones vigentes de todos los barrios, agrupadas por barrio (primero los que más piden
// ayuda). El PTP ve lo mismo que ve cualquier vecino de cada barrio, nada más.
export function listHelpByBarrio(kind?: HelpKind): BarrioHelp[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.kind, p.message, p.created_at, p.allow_contact, p.neighbor_id, p.barrio_id,
              n.first_name, n.last_name, n.whatsapp, n.delegate_since,
              b.name AS barrio_name, b.localidad
         FROM help_posts p
         JOIN neighbors n ON n.id = p.neighbor_id
         JOIN barrios b ON b.id = p.barrio_id
        WHERE p.resolved_at IS NULL AND p.created_at > ?
        ORDER BY p.id DESC`,
    )
    .all(visibleSince()) as Array<Row & { barrio_id: number; barrio_name: string; localidad: string | null }>;

  const barrios = new Map<number, BarrioHelp>();
  for (const row of rows) {
    let barrio = barrios.get(row.barrio_id);
    if (!barrio) {
      barrio = { barrioId: row.barrio_id, barrio: row.barrio_name, localidad: row.localidad, necesito: 0, ofrezco: 0, posts: [] };
      barrios.set(row.barrio_id, barrio);
    }
    barrio[row.kind] += 1;
    if (!kind || row.kind === kind) barrio.posts.push(toPost(row, null));
  }

  return [...barrios.values()].sort(
    (a, b) => b.necesito - a.necesito || b.ofrezco - a.ofrezco || a.barrio.localeCompare(b.barrio, "es"),
  );
}

// Para el menú de Mi barrio.
export function countHelpPosts(barrioId: number) {
  const rows = db
    .prepare(
      `SELECT kind, COUNT(*) AS count FROM help_posts
        WHERE barrio_id = ? AND resolved_at IS NULL AND created_at > ?
        GROUP BY kind`,
    )
    .all(barrioId, visibleSince()) as Array<{ kind: HelpKind; count: number }>;
  const count = (kind: HelpKind) => rows.find((row) => row.kind === kind)?.count ?? 0;
  return { ofrezco: count("ofrezco"), necesito: count("necesito") };
}

export function addHelpPost(
  neighborId: number,
  barrioId: number,
  input: { kind: unknown; message: unknown; allowContact: unknown },
) {
  if (input.kind !== "ofrezco" && input.kind !== "necesito") {
    throw new ValidationError("Elegí si ofrecés o necesitás algo.");
  }
  const original = cleanMessage(input.message);
  if (original.length < MIN_LENGTH) throw new ValidationError("Contá un poco más qué ofrecés o necesitás.");
  if (original.length > MAX_LENGTH) throw new ValidationError(`El texto no puede pasar los ${MAX_LENGTH} caracteres.`);

  const { open } = db
    .prepare(
      "SELECT COUNT(*) AS open FROM help_posts WHERE neighbor_id = ? AND resolved_at IS NULL AND created_at > ?",
    )
    .get(neighborId, visibleSince()) as { open: number };
  if (open >= MAX_OPEN_POSTS) {
    throw new ValidationError(
      `Ya tenés ${MAX_OPEN_POSTS} publicaciones abiertas. Marcá como resueltas las que ya no hagan falta.`,
    );
  }

  // El contacto directo es solo para quien pide ayuda.
  const allowContact = input.kind === "necesito" && input.allowContact === true ? 1 : 0;
  db.prepare(
    `INSERT INTO help_posts (barrio_id, neighbor_id, kind, message, original_message, allow_contact, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(barrioId, neighborId, input.kind, sanitize(original), original, allowContact, new Date().toISOString());
}

// Solo el autor puede cerrar o borrar su publicación.
export function resolveHelpPost(neighborId: number, postId: number) {
  db.prepare("UPDATE help_posts SET resolved_at = ? WHERE id = ? AND neighbor_id = ? AND resolved_at IS NULL").run(
    new Date().toISOString(),
    postId,
    neighborId,
  );
}

export function deleteHelpPost(neighborId: number, postId: number) {
  db.prepare("DELETE FROM help_posts WHERE id = ? AND neighbor_id = ?").run(postId, neighborId);
}

// Al mudarse de barrio, sus publicaciones abiertas en el barrio anterior se cierran.
export function closeHelpPostsOf(neighborId: number) {
  db.prepare("UPDATE help_posts SET resolved_at = ? WHERE neighbor_id = ? AND resolved_at IS NULL").run(
    new Date().toISOString(),
    neighborId,
  );
}
