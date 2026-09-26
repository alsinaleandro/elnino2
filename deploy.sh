#!/usr/bin/env bash
# Actualiza elnino2 en el VPS: baja los cambios de GitHub, compila y reinicia PM2.
# Uso (en el VPS):  ./deploy.sh
# Si el build falla, vuelve al commit anterior para no dejar la app caída.

set -euo pipefail

APP_NAME="elnino2"
PORT=3001
HEALTH_URL="http://127.0.0.1:${PORT}/"

cd "$(dirname "$(readlink -f "$0")")"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# Se llama dentro de un `if`, donde bash ignora `set -e`: cada paso corta con `|| return 1`.
build_and_restart() {
  npm run build || return 1
  if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env || return 1
  else
    pm2 start npm --name "$APP_NAME" -- start -- -p "$PORT" -H 127.0.0.1 || return 1
    pm2 save
  fi
}

step "Verificando el repositorio"
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  git status --short
  fail "Hay cambios locales sin commitear en el servidor. Revisalos antes de actualizar."
fi

PREVIOUS=$(git rev-parse HEAD)

step "Bajando cambios de GitHub"
git pull --ff-only
CURRENT=$(git rev-parse HEAD)

if [[ "$PREVIOUS" == "$CURRENT" ]]; then
  echo "No hay cambios nuevos (${CURRENT:0:7})."
  read -r -p "¿Recompilar y reiniciar igual? [s/N] " answer
  [[ "$answer" =~ ^[sS]$ ]] || exit 0
else
  git log --oneline "${PREVIOUS}..${CURRENT}"
fi

if [[ ! -d node_modules ]] || ! git diff --quiet "$PREVIOUS" "$CURRENT" -- package.json package-lock.json; then
  step "Instalando dependencias"
  npm ci
else
  step "Dependencias sin cambios, se saltea npm ci"
fi

step "Compilando y reiniciando"
if ! build_and_restart; then
  if [[ "$PREVIOUS" == "$CURRENT" ]]; then
    fail "Falló el build. Revisá el error de arriba."
  fi

  printf '\n\033[1;33m! Falló el build. Volviendo a %s...\033[0m\n' "${PREVIOUS:0:7}"
  git reset --hard "$PREVIOUS"
  npm ci
  build_and_restart
  fail "El build de ${CURRENT:0:7} falló; quedó corriendo la versión anterior (${PREVIOUS:0:7}). Corregí el error y subí de nuevo."
fi

step "Comprobando que la app responda"
# Next tarda unos segundos en arrancar después del restart: los intentos fallidos no se muestran.
for _ in $(seq 1 15); do
  if curl -fs -o /dev/null "$HEALTH_URL"; then
    printf '\n\033[1;32m✓ %s actualizado a %s y funcionando.\033[0m\n' "$APP_NAME" "$(git log -1 --format='%h %s')"
    exit 0
  fi
  sleep 1
done

pm2 logs "$APP_NAME" --lines 30 --nostream
fail "La app no responde en ${HEALTH_URL}. Revisá los logs de arriba."
