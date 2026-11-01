// Base de datos SQLite de la app, con el módulo node:sqlite que trae Node (no hace falta instalar nada).
// El archivo vive en data/elnino2.db (fuera de git); DATABASE_PATH permite moverlo a otro lado.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "elnino2.db");

function open() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  // busy_timeout va primero: si otro proceso está escribiendo (por ejemplo, migrando durante el
  // build), las órdenes siguientes esperan hasta 10 s en lugar de fallar con "database is locked".
  db.exec(`
    PRAGMA busy_timeout = 10000;
    PRAGMA journal_mode = WAL;
  `);
  return db;
}

// Crea las tablas que falten y agrega las columnas nuevas a las que ya existían. Es idempotente y
// corre cada vez que se carga el módulo, así también se aplica en desarrollo sin reiniciar.
//
// Va entera en una transacción BEGIN IMMEDIATE: el build de Next carga este módulo en varios
// procesos a la vez (y en el VPS además está la app corriendo), y así cada uno espera su turno
// (busy_timeout) en lugar de chocar con "database is locked". Si algo falla, no queda nada a medias.
function migrate(db: DatabaseSync) {
  db.exec("BEGIN IMMEDIATE");
  try {
    applyMigrations(db);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function applyMigrations(db: DatabaseSync) {
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

    -- Una fila por visita en la que el visitante compartió su ubicación GPS. Se muestran como
    -- puntos en el panel (/ptpadmin/estadisticas).
    CREATE TABLE IF NOT EXISTS visit_locations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      latitude   REAL NOT NULL,
      longitude  REAL NOT NULL,
      accuracy   REAL,
      ip         TEXT
    );
    CREATE INDEX IF NOT EXISTS visit_locations_ip ON visit_locations (ip, created_at);
    CREATE INDEX IF NOT EXISTS visit_locations_created ON visit_locations (created_at);

    -- Visitas por día (fecha de Argentina, AAAA-MM-DD). Se cuenta desde que existe la tabla: el
    -- total histórico sigue en counters.
    CREATE TABLE IF NOT EXISTS daily_visits (
      date   TEXT PRIMARY KEY,
      visits INTEGER NOT NULL DEFAULT 0
    );

    -- Vecinos que se sumaron a los comités de barrio (Idea 1), con su cuenta de Google o con e-mail
    -- y contraseña ("google_sub" NULL si nunca entró con Google). "consent_at" es cuándo aceptaron
    -- la pantalla "Cómo usamos tus datos". WhatsApp y e-mail no los ve ningún otro vecino. Mientras
    -- "whatsapp" sea NULL, el vecino no completó sus datos.
    CREATE TABLE IF NOT EXISTS neighbors (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      google_sub TEXT UNIQUE,
      email      TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name  TEXT NOT NULL,
      whatsapp   TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      consent_at TEXT NOT NULL
    );

    -- Sesiones abiertas. Se guarda el hash del token, no el token: si se filtra la base, no
    -- sirve para entrar como otro vecino.
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash  TEXT PRIMARY KEY,
      neighbor_id INTEGER NOT NULL,
      created_at  TEXT NOT NULL,
      expires_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_neighbor ON sessions (neighbor_id);

    -- Barrios (Idea 1). Se cargan a demanda: los de OpenStreetMap se copian con su polígono
    -- (GeoJSON, licencia ODbL) la primera vez que un vecino cae adentro; los que no están en OSM los
    -- escribe un vecino y quedan sin polígono, ubicados por el punto de quien los cargó (o sin
    -- ubicación, si no compartió el GPS).
    -- "normalized_name" (minúsculas, sin acentos ni "barrio") sirve para no duplicar nombres.
    CREATE TABLE IF NOT EXISTS barrios (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      localidad       TEXT,
      source          TEXT NOT NULL CHECK (source IN ('osm', 'vecino')),
      osm_type        TEXT,
      osm_id          INTEGER,
      geometry        TEXT,
      min_lat         REAL,
      min_lon         REAL,
      max_lat         REAL,
      max_lon         REAL,
      center_lat      REAL,
      center_lon      REAL,
      created_at      TEXT NOT NULL,
      UNIQUE (osm_type, osm_id)
    );
    CREATE INDEX IF NOT EXISTS barrios_bbox ON barrios (min_lat, max_lat, min_lon, max_lon);
    CREATE INDEX IF NOT EXISTS barrios_center ON barrios (center_lat, center_lon);
    CREATE INDEX IF NOT EXISTS barrios_name ON barrios (normalized_name);

    -- Puntos GPS de los vecinos de barrios sin polígono, sin decir de quién son: a futuro sirven
    -- para dibujar un polígono aproximado.
    CREATE TABLE IF NOT EXISTS barrio_points (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      barrio_id  INTEGER NOT NULL,
      latitude   REAL NOT NULL,
      longitude  REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS barrio_points_barrio ON barrio_points (barrio_id);

    -- Chat del barrio: público para los vecinos del comité, sin mensajes privados. Se muestra el
    -- nombre y la inicial del apellido del autor (se leen de neighbors). "message" es el texto
    -- saneado y "original_message" lo que escribió el vecino. Al borrar un vecino se borran sus
    -- mensajes.
    CREATE TABLE IF NOT EXISTS chat_messages (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      barrio_id        INTEGER NOT NULL,
      neighbor_id      INTEGER NOT NULL,
      message          TEXT NOT NULL,
      original_message TEXT NOT NULL,
      created_at       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chat_messages_barrio ON chat_messages (barrio_id, id);
    CREATE INDEX IF NOT EXISTS chat_messages_neighbor ON chat_messages (neighbor_id, created_at);

    -- Ayuda mutua (Idea 6): publicaciones "Ofrezco" / "Necesito" del tablero de cada barrio.
    -- "allow_contact" = quien pide ayuda eligió mostrar su WhatsApp en esa publicación (se lee de
    -- neighbors, no se copia). "resolved_at" = la marcó como resuelta. Al borrar un vecino se
    -- borran sus publicaciones.
    CREATE TABLE IF NOT EXISTS help_posts (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      barrio_id        INTEGER NOT NULL,
      neighbor_id      INTEGER NOT NULL,
      kind             TEXT NOT NULL CHECK (kind IN ('ofrezco', 'necesito')),
      message          TEXT NOT NULL,
      original_message TEXT NOT NULL,
      allow_contact    INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT NOT NULL,
      resolved_at      TEXT
    );
    CREATE INDEX IF NOT EXISTS help_posts_barrio ON help_posts (barrio_id, created_at);
    CREATE INDEX IF NOT EXISTS help_posts_neighbor ON help_posts (neighbor_id);

    -- Novedades de cada barrio. Las publica el PTP Chaco (desde /ptpadmin; "barrio_id" NULL = para
    -- todos los barrios) o un delegado para su propio barrio ("neighbor_id"). Pueden anunciar una
    -- reunión o asamblea: "event_at" es la fecha (AAAA-MM-DD), o fecha y hora de Argentina
    -- (AAAA-MM-DDTHH:MM), y "place" el
    -- lugar. Las de un delegado se muestran mientras siga siendo delegado de ese barrio, y se borran
    -- al borrar sus datos.
    CREATE TABLE IF NOT EXISTS news_posts (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      barrio_id        INTEGER,
      author_kind      TEXT NOT NULL CHECK (author_kind IN ('ptp', 'delegado')),
      neighbor_id      INTEGER,
      title            TEXT NOT NULL,
      message          TEXT NOT NULL,
      original_message TEXT NOT NULL,
      event_at         TEXT,
      place            TEXT,
      created_at       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS news_posts_barrio ON news_posts (barrio_id, id);
    CREATE INDEX IF NOT EXISTS news_posts_neighbor ON news_posts (neighbor_id);

    -- Links por e-mail para entrar con contraseña: "alta" (crear la cuenta, después de aceptar
    -- "Cómo usamos tus datos") y "clave" (olvidé mi contraseña). Al abrir el link el vecino elige
    -- su contraseña; recién ahí se crea la cuenta, así que nadie puede usar un e-mail ajeno. Se
    -- guarda el hash del token y cada link sirve una sola vez.
    CREATE TABLE IF NOT EXISTS email_tokens (
      token_hash TEXT PRIMARY KEY,
      email      TEXT NOT NULL,
      purpose    TEXT NOT NULL CHECK (purpose IN ('alta', 'clave')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS email_tokens_email ON email_tokens (email, created_at);
  `);

  addColumn(db, "public_messages", "hidden", "INTEGER NOT NULL DEFAULT 0");
  // Los mensajes privados anteriores a estas columnas quedan con NULL.
  addColumn(db, "private_messages", "whatsapp", "TEXT");
  addColumn(db, "private_messages", "latitude", "REAL");
  addColumn(db, "private_messages", "longitude", "REAL");
  addColumn(db, "private_messages", "accuracy", "REAL");
  // Barrio donde vive el vecino (NULL mientras no lo eligió).
  addColumn(db, "neighbors", "barrio_id", "INTEGER");
  // Delegados (Idea 3): desde cuándo es delegado del barrio (NULL si no lo es) y a qué delegado
  // sigue (NULL si a ninguno; uno solo por vecino). Ninguna pantalla muestra a quién sigue cada
  // vecino, solo el total de seguidores de cada delegado.
  addColumn(db, "neighbors", "delegate_since", "TEXT");
  addColumn(db, "neighbors", "follows_id", "INTEGER");
  // Ingreso con e-mail y contraseña: hash scrypt de la contraseña (NULL si solo entra con Google).
  addColumn(db, "neighbors", "password_hash", "TEXT");
  allowNeighborsWithoutGoogle(db);
  // Ubicación GPS del vecino cuando eligió su barrio por primera vez (NULL si no dio permiso). No
  // se publica ni la ve ningún vecino. Van después de rehacer la tabla, que no las conoce.
  addColumn(db, "neighbors", "latitude", "REAL");
  addColumn(db, "neighbors", "longitude", "REAL");
  addColumn(db, "neighbors", "location_accuracy", "REAL");
  addColumn(db, "neighbors", "located_at", "TEXT");
  // Ingreso con Facebook: id del usuario para esta app (NULL si nunca entró con Facebook).
  addColumn(db, "neighbors", "facebook_id", "TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS neighbors_facebook ON neighbors (facebook_id)");
  db.exec("CREATE INDEX IF NOT EXISTS neighbors_follows ON neighbors (follows_id)");
  db.exec("CREATE INDEX IF NOT EXISTS neighbors_email ON neighbors (email)");
}

// Las bases creadas antes del ingreso con e-mail tienen "google_sub" NOT NULL. SQLite no deja
// cambiar una columna, así que se rehace la tabla una sola vez, copiando todo. Corre dentro de la
// transacción de migrate(): si algo falla, queda como estaba.
function allowNeighborsWithoutGoogle(db: DatabaseSync) {
  const columns = db.prepare("PRAGMA table_info(neighbors)").all() as Array<{ name: string; notnull: number }>;
  if (columns.find((column) => column.name === "google_sub")?.notnull !== 1) return;

  const names = columns.map((column) => column.name).join(", ");
  // El contador de ids (AUTOINCREMENT) se conserva: el id de un vecino borrado no se vuelve a usar.
  const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'neighbors'").get() as
    | { seq: number }
    | undefined;
  db.exec(`
    CREATE TABLE neighbors_new (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      google_sub     TEXT UNIQUE,
      email          TEXT NOT NULL,
      first_name     TEXT NOT NULL,
      last_name      TEXT NOT NULL,
      whatsapp       TEXT,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL,
      consent_at     TEXT NOT NULL,
      barrio_id      INTEGER,
      delegate_since TEXT,
      follows_id     INTEGER,
      password_hash  TEXT
    );
    INSERT INTO neighbors_new (${names}) SELECT ${names} FROM neighbors;
    DROP TABLE neighbors;
    ALTER TABLE neighbors_new RENAME TO neighbors;
  `);
  if (sequence) {
    db.prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'neighbors'").run(sequence.seq);
  }
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
