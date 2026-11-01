// Delegados barriales (Idea 3). Cualquier vecino del comité puede postularse y es delegado desde ese
// momento, aunque nadie lo siga. Cada vecino sigue a un solo delegado de su barrio, o a ninguno, y
// puede cambiarlo cuando quiera. De cada delegado se publica, para su barrio, el nombre, el WhatsApp
// y cuántos lo siguen; a quién sigue cada vecino no se muestra en ninguna pantalla.
import { ValidationError } from "./contact";
import { db } from "./db";
import { whatsappLink } from "./links";

export type Delegate = {
  id: number;
  name: string;
  whatsapp: string;
  whatsappLink: string | null;
  followers: number;
  since: string;
  isMe: boolean;
  followedByMe: boolean;
};

type Row = {
  id: number;
  first_name: string;
  last_name: string;
  whatsapp: string;
  delegate_since: string;
  followers: number;
};

// Los seguidores se cuentan solo entre los vecinos del mismo barrio del delegado.
export function listDelegates(barrioId: number, viewer: { id: number; followsId: number | null }): Delegate[] {
  const rows = db
    .prepare(
      `SELECT d.id, d.first_name, d.last_name, d.whatsapp, d.delegate_since,
              (SELECT COUNT(*) FROM neighbors f WHERE f.follows_id = d.id AND f.barrio_id = d.barrio_id) AS followers
         FROM neighbors d
        WHERE d.barrio_id = ? AND d.delegate_since IS NOT NULL AND d.whatsapp IS NOT NULL
        ORDER BY followers DESC, d.delegate_since`,
    )
    .all(barrioId) as Row[];

  return rows.map((row) => ({
    id: row.id,
    name: `${row.first_name} ${row.last_name}`,
    whatsapp: row.whatsapp,
    whatsappLink: whatsappLink(row.whatsapp),
    followers: row.followers,
    since: row.delegate_since,
    isMe: row.id === viewer.id,
    followedByMe: row.id === viewer.followsId,
  }));
}

export function becomeDelegate(neighborId: number) {
  db.prepare(
    "UPDATE neighbors SET delegate_since = ?, updated_at = ? WHERE id = ? AND delegate_since IS NULL AND whatsapp IS NOT NULL",
  ).run(new Date().toISOString(), new Date().toISOString(), neighborId);
}

// Al renunciar, el delegado deja de aparecer (sus datos dejan de ser públicos) y quienes lo seguían
// quedan sin delegado elegido. También se usa al cambiar de barrio y al borrar los datos.
export function resignDelegate(neighborId: number) {
  db.prepare("UPDATE neighbors SET delegate_since = NULL, updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    neighborId,
  );
  db.prepare("UPDATE neighbors SET follows_id = NULL WHERE follows_id = ?").run(neighborId);
}

// Solo se puede seguir a un delegado del propio barrio, y no a uno mismo.
export function followDelegate(neighborId: number, delegateId: number) {
  const delegate = db
    .prepare(
      `SELECT d.id
         FROM neighbors d
         JOIN neighbors me ON me.id = ?
        WHERE d.id = ? AND d.id <> me.id AND d.delegate_since IS NOT NULL AND d.barrio_id = me.barrio_id`,
    )
    .get(neighborId, delegateId);
  if (!delegate) throw new ValidationError("Ese delegado ya no está en tu barrio.");
  db.prepare("UPDATE neighbors SET follows_id = ? WHERE id = ?").run(delegateId, neighborId);
}

export function unfollowDelegate(neighborId: number) {
  db.prepare("UPDATE neighbors SET follows_id = NULL WHERE id = ?").run(neighborId);
}

// Al mudarse de barrio el vecino deja de ser delegado del anterior y deja de seguir al que seguía.
export function leaveBarrioRoles(neighborId: number) {
  resignDelegate(neighborId);
  unfollowDelegate(neighborId);
}
