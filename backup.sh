#!/usr/bin/env bash
# Copia de seguridad diaria de la base SQLite de elnino2 a Google Drive, con rclone.
# Uso (en el VPS):  bash backup.sh
# Las copias quedan también en data/backups/ durante unos días, por si falla la subida.
#
# Configuración (una sola vez, en el VPS):
#
# 1. Instalar rclone:  curl https://rclone.org/install.sh | sudo bash
#
# 2. Conectar Google Drive (usar una cuenta de la organización, no una personal):
#      rclone config
#    - n (nuevo remoto) · nombre: gdrive · tipo: drive
#    - client_id y client_secret: vacíos
#    - scope: "drive.file" (rclone solo ve los archivos que él mismo sube, no el resto del Drive)
#    - "Use web browser to automatically authenticate?": n
#    El VPS no tiene navegador: rclone muestra un comando `rclone authorize "drive" ...` para
#    correr en una computadora con navegador (con rclone instalado), y se pega en el VPS el token
#    que devuelve.
#
# 3. Probar:  bash backup.sh   → tiene que aparecer la carpeta elnino2-backups en el Drive.
#
# 4. Programarlo todos los días a las 3:30 (crontab -e). cron no carga el PATH de la sesión: hay
#    que indicar dónde está node (ver `dirname "$(which node)"`):
#      30 3 * * * PATH=/ruta/de/node/bin:/usr/local/bin:/usr/bin:/bin bash /ruta/elnino2/backup.sh >> /ruta/elnino2/data/backups/backup.log 2>&1
#
# Para restaurar una copia: bajarla del Drive, descomprimirla (gunzip), detener la app
# (pm2 stop elnino2), reemplazar data/elnino2.db, borrar data/elnino2.db-wal y data/elnino2.db-shm
# si existen, y volver a arrancarla (pm2 start elnino2).

set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

DB_PATH="${DATABASE_PATH:-$PWD/data/elnino2.db}"
REMOTE="${BACKUP_REMOTE:-gdrive:elnino2-backups}"
LOCAL_DIR="$PWD/data/backups"
KEEP_LOCAL_DAYS=7
KEEP_REMOTE_DAYS=60

fail() { printf '%s ✗ %s\n' "$(date '+%F %T')" "$*" >&2; exit 1; }

[[ -f "$DB_PATH" ]] || fail "No existe la base de datos en $DB_PATH."
command -v rclone > /dev/null || fail "rclone no está instalado."

mkdir -p "$LOCAL_DIR"
FILE="$LOCAL_DIR/elnino2_$(date +%F_%H%M).db"

# VACUUM INTO arma una copia consistente aunque la app esté escribiendo (no alcanza con copiar el
# archivo: con WAL, parte de los datos está en elnino2.db-wal). Se abre la base solo para lectura.
node -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(process.argv[1], { readOnly: true });
  db.prepare("VACUUM INTO ?").run(process.argv[2]);
  db.close();
' "$DB_PATH" "$FILE" 2> >(grep -v "ExperimentalWarning\|trace-warnings" >&2) || fail "No se pudo copiar la base."

gzip "$FILE"
rclone copy "$FILE.gz" "$REMOTE" || fail "No se pudo subir $FILE.gz a $REMOTE (la copia quedó en $LOCAL_DIR)."

find "$LOCAL_DIR" -name 'elnino2_*.db.gz' -mtime +"$KEEP_LOCAL_DAYS" -delete
rclone delete "$REMOTE" --min-age "${KEEP_REMOTE_DAYS}d" --include 'elnino2_*.db.gz'

printf '%s ✓ Copia subida: %s (%s)\n' "$(date '+%F %T')" "$(basename "$FILE.gz")" "$(du -h "$FILE.gz" | cut -f1)"
