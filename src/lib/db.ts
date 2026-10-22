// Base de datos SQLite de la app, con el módulo node:sqlite que trae Node (no hace falta instalar nada).
// El archivo vive en data/elnino2.db (fuera de git); DATABASE_PATH permite moverlo a otro lado.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "elnino2.db");

function open() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
  `);
  return db;
}

// Crea las tablas que falten y agrega las columnas nuevas a las que ya existían. Es idempotente y
// corre cada vez que se carga el módulo, así también se aplica en desarrollo sin reiniciar.
function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS counters (
      name  TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );

    -- Captchas pendientes: se borran al usarlos o cuando vencen.
    CREATE TABLE IF NOT EXISTS captchas (
      id         TEXT PRIMARY KEY,
      answer     INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    -- Mensajes públicos de la pestaña Contactanos. "message" es el texto saneado que se muestra;
    -- "original_message" guarda lo que escribió el visitante. WhatsApp, e-mail, ubicación e IP
    -- nunca se publican.
    CREATE TABLE IF NOT EXISTS public_messages (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at       TEXT NOT NULL,
      topic            TEXT NOT NULL CHECK (topic IN ('zona', 'sugerencia')),
      first_name       TEXT NOT NULL,
      last_name        TEXT NOT NULL,
      whatsapp         TEXT NOT NULL,
      email            TEXT NOT NULL,
      message          TEXT NOT NULL,
      original_message TEXT NOT NULL,
      latitude         REAL,
      longitude        REAL,
      accuracy         REAL,
      ip               TEXT,
      user_agent       TEXT
    );
    CREATE INDEX IF NOT EXISTS public_messages_created ON public_messages (created_at);

    -- Mensajes privados: se envían por e-mail y quedan guardados por si el envío falla.
    CREATE TABLE IF NOT EXISTS private_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name  TEXT NOT NULL,
      email      TEXT NOT NULL,
      message    TEXT NOT NULL,
      ip         TEXT,
      user_agent TEXT,
      emailed    INTEGER NOT NULL DEFAULT 0
    );
  `);

  addColumn(db, "public_messages", "hidden", "INTEGER NOT NULL DEFAULT 0");
  // Los mensajes privados anteriores a estas columnas quedan con NULL.
  addColumn(db, "private_messages", "whatsapp", "TEXT");
  addColumn(db, "private_messages", "latitude", "REAL");
  addColumn(db, "private_messages", "longitude", "REAL");
  addColumn(db, "private_messages", "accuracy", "REAL");
}

function addColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// En desarrollo Next recarga los módulos en cada cambio: se guarda la conexión en globalThis
// para no abrir una nueva cada vez.
const globalForDb = globalThis as typeof globalThis & { elninoDb?: DatabaseSync };

export const db = globalForDb.elninoDb ?? open();
globalForDb.elninoDb = db;
migrate(db);
