import { db } from "./db";

const VISITS = "visits";

// Suma una visita y devuelve el total; el upsert es una sola sentencia, así no se pierden visitas
// simultáneas.
export function registerVisit() {
  const row = db
    .prepare(
      `INSERT INTO counters (name, value) VALUES (?, 1)
       ON CONFLICT(name) DO UPDATE SET value = value + 1
       RETURNING value`,
    )
    .get(VISITS) as { value: number };
  return row.value;
}

export function getVisits() {
  const row = db.prepare("SELECT value FROM counters WHERE name = ?").get(VISITS) as
    | { value: number }
    | undefined;
  return row?.value ?? 0;
}
