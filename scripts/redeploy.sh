#!/usr/bin/env bash
# =====================================================================
# redeploy.sh — Redespliegue del stack Nexus Soft Time Clock en Portainer
# (método Git). Autentica, dispara "git pull + redeploy" reenviando las
# env-vars, y verifica salud + login tras el arranque.
#
# Uso:
#   1) cp scripts/.env.example scripts/.env  &&  editar scripts/.env
#   2) bash scripts/redeploy.sh
#
# Los secretos se leen de scripts/.env o del entorno. NADA hardcodeado.
# Flags:
#   --pull-image     fuerza re-pull/reconstrucción total de imágenes
#   --no-verify      no ejecuta la verificación post-deploy
#   -h | --help      ayuda
# =====================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PULL_IMAGE=false
DO_VERIFY=true

for arg in "$@"; do
  case "$arg" in
    --pull-image) PULL_IMAGE=true ;;
    --no-verify)  DO_VERIFY=false ;;
    -h|--help)
      cat <<'HELP'
redeploy.sh — Redespliegue del stack Nexus Soft Time Clock en Portainer (método Git).
Autentica, dispara "git pull + redeploy" reenviando las env-vars, y verifica
salud + login tras el arranque.

Uso:
  1) cp scripts/.env.example scripts/.env   &&   editar scripts/.env
  2) bash scripts/redeploy.sh [flags]

Los secretos se leen de scripts/.env o del entorno. NADA hardcodeado.

Flags:
  --pull-image   fuerza re-pull/reconstrucción total de imágenes
  --no-verify    no ejecuta la verificación post-deploy
  -h | --help    esta ayuda
HELP
      exit 0 ;;
    *) echo "Argumento desconocido: $arg" >&2; exit 2 ;;
  esac
done

# --- Cargar config local si existe -----------------------------------
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

# --- Defaults --------------------------------------------------------
PORTAINER_URL="${PORTAINER_URL:-https://85.239.240.43:9443}"
PORTAINER_USER="${PORTAINER_USER:-Admon_dev}"
STACK_ID="${STACK_ID:-72}"
ENDPOINT_ID="${ENDPOINT_ID:-2}"
GH_USER="${GH_USER:-Dem0776}"
GIT_REF="${GIT_REF:-refs/heads/main}"
DB_NAME="${DB_NAME:-nexus}"
DB_USER="${DB_USER:-nexus}"
HTTP_PORT="${HTTP_PORT:-8088}"
SPRING_PROFILES_ACTIVE="${SPRING_PROFILES_ACTIVE:-prod}"
LOG_LEVEL_APP="${LOG_LEVEL_APP:-INFO}"
# Al activar TLS (ver docs/iteracion-13-produccion/07-despliegue-portainer.md §3.1) hay que
# apuntar APP_URL a https://<dominio>:<HTTPS_PORT>: el puerto HTTP pasa a redirigir, y la
# verificación por POST de abajo no sigue redirecciones (un 301 convertiría el POST en GET).
APP_URL="${APP_URL:-http://85.239.240.43:8088}"
VERIFY_EMAIL="${VERIFY_EMAIL:-admin@demo.com}"
VERIFY_PASSWORD="${VERIFY_PASSWORD:-Admin123!}"
MINIO_USER="${MINIO_USER:-minioadmin}"
STORAGE_MINIO_BUCKET="${STORAGE_MINIO_BUCKET:-evidence}"
MINIO_KMS_SECRET_KEY="${MINIO_KMS_SECRET_KEY:-}"
# Origen público del stack: con él se firman las URLs de subida de evidencias. Por defecto,
# el mismo que APP_URL, que es justo por donde entran el portal y la app.
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-$APP_URL}"

# Par RSA con el que se firma el JWT. Van aquí porque Portainer REEMPLAZA la configuración de
# entorno del stack con la que se envía en el redeploy (ver el array `env` más abajo): si no
# viajan en el payload se pierden, el backend regenera la llave en memoria y se invalidan
# TODAS las sesiones del móvil. Se copian de Portainer → Stacks → Environment variables.
SECURITY_JWT_PRIVATE_KEY="${SECURITY_JWT_PRIVATE_KEY:-}"
SECURITY_JWT_PUBLIC_KEY="${SECURITY_JWT_PUBLIC_KEY:-}"
SECURITY_JWT_KEY_ID="${SECURITY_JWT_KEY_ID:-nexus-rsa}"

# --- Validar secretos obligatorios -----------------------------------
missing=()
[[ -z "${PORTAINER_PASS:-}" ]]      && missing+=("PORTAINER_PASS")
[[ -z "${GH_PAT:-}" ]]              && missing+=("GH_PAT")
[[ -z "${DB_PASSWORD:-}" ]]         && missing+=("DB_PASSWORD")
[[ -z "${SECURITY_QR_SECRET:-}" ]] && missing+=("SECURITY_QR_SECRET")
[[ -z "${MINIO_PASSWORD:-}" ]]      && missing+=("MINIO_PASSWORD")
[[ -z "${SECURITY_JWT_PRIVATE_KEY:-}" ]] && missing+=("SECURITY_JWT_PRIVATE_KEY")
[[ -z "${SECURITY_JWT_PUBLIC_KEY:-}" ]]  && missing+=("SECURITY_JWT_PUBLIC_KEY")
if (( ${#missing[@]} )); then
  echo "ERROR: faltan variables obligatorias: ${missing[*]}" >&2
  echo "       Defínelas en $SCRIPT_DIR/.env (ver .env.example) o expórtalas." >&2
  if [[ "${missing[*]}" == *SECURITY_JWT_* ]]; then
    echo "       El par SECURITY_JWT_* se copia de Portainer → Stacks → nexus-time-clock →" >&2
    echo "       Environment variables (el PEM en UNA línea con \n literales). Es obligatorio" >&2
    echo "       porque el redeploy REEMPLAZA la env del stack: sin enviarlo se borraría y" >&2
    echo "       todas las sesiones del móvil se invalidarían." >&2
  fi
  exit 1
fi

# --- Validar el formato de la llave del KMS ---------------------------
# Vacía es válida: MinIO arranca y el bucket queda sin cifrar (el backend lo avisa por log).
# Con valor tiene que ser "nombre:base64-de-32-bytes"; cualquier otra cosa hace que MinIO
# muera al arrancar con un FATAL. El contenedor queda entonces unhealthy y Portainer aborta
# el stack ENTERO tras varios minutos con un opaco "dependency failed to start", sin decir
# nunca que el problema era esta variable. Mejor cazarlo aquí, en un segundo.
if [[ -n "$MINIO_KMS_SECRET_KEY" ]]; then
  kms_err=""
  kms_key=${MINIO_KMS_SECRET_KEY#*:}
  if [[ "$MINIO_KMS_SECRET_KEY" != *:* ]]; then
    kms_err="le falta el prefijo 'nombre:' (MinIO: invalid secret key format)"
  elif [[ -z "${MINIO_KMS_SECRET_KEY%%:*}" ]]; then
    kms_err="el nombre de la llave, antes de ':', está vacío"
  elif [[ -z "$kms_key" ]]; then
    kms_err="no hay clave después de ':' (MinIO: invalid key length 0)"
  elif [[ ! "$kms_key" =~ ^[A-Za-z0-9+/]{43}=$ ]]; then
    kms_err="la clave no es base64 de 32 bytes exactos (MinIO: illegal base64 data)"
  fi
  if [[ -n "$kms_err" ]]; then
    echo "ERROR: MINIO_KMS_SECRET_KEY con formato inválido: $kms_err" >&2
    echo "       Formato esperado:  nombre:clave-base64" >&2
    echo '       Genérala con:      echo "nexus-evidence:$(openssl rand -base64 32)"' >&2
    echo "       Si no quieres cifrado en reposo, déjala vacía: MinIO arranca igual y el" >&2
    echo "       bucket queda SIN cifrar (RNF-08 pide cifrarlo)." >&2
    exit 1
  fi
fi

need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: falta '$1' en el PATH" >&2; exit 1; }; }
need curl

# JSON-escape de un string (para valores con caracteres especiales).
# Los patrones van entrecomillados a propósito: sin comillas bash reinterpreta las barras del
# reemplazo y la sustitución de la barra invertida quedaba en un no-op, dejándola sin escapar.
# Importa para el PEM de las llaves JWT, que es justo una ristra de "\n".
# El salto de línea real se traduce a un "\n" LITERAL (no al escape JSON, que volvería a ser
# un salto real): la env de un stack de Portainer es de una línea por variable, y de paso vale
# tanto el PEM pegado en una sola línea como en varias, que es como lo guarda un secret de CI.
json_escape() {
  local s=$1
  s=${s//'\'/'\\'}
  s=${s//'"'/'\"'}
  s=${s//$'\r'/}
  s=${s//$'\n'/'\\n'}
  s=${s//$'\t'/'\t'}
  printf '%s' "$s"
}

log() { printf '\033[1;34m›\033[0m %s\n' "$*"; }
ok()  { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m✖\033[0m %s\n' "$*" >&2; }

# --- 1) Autenticación ------------------------------------------------
log "Autenticando en Portainer ($PORTAINER_URL) como $PORTAINER_USER…"
JWT=$(curl -sk --fail -m 20 -X POST "$PORTAINER_URL/api/auth" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$(json_escape "$PORTAINER_USER")\",\"password\":\"$(json_escape "$PORTAINER_PASS")\"}" \
  | sed -E 's/.*"jwt":"([^"]+)".*/\1/') || { err "Fallo de autenticación (¿usuario/contraseña?)."; exit 1; }
[[ -n "$JWT" && "$JWT" != *"{"* ]] || { err "No se obtuvo JWT."; exit 1; }
ok "Autenticado."

# --- 2) Redespliegue -------------------------------------------------
log "Redesplegando stack Id $STACK_ID (ref $GIT_REF, pullImage=$PULL_IMAGE)…"
# OJO: Portainer REEMPLAZA la configuración de entorno del stack por este array (hace
# `stack.Env = payload.Env`), no la fusiona con la existente. Cualquier variable fijada a mano
# en la UI que no esté aquí desaparece en el redespliegue, así que al añadir una env nueva al
# stack hay que añadirla también a esta lista.
PAYLOAD=$(cat <<JSON
{
  "repositoryAuthentication": true,
  "repositoryUsername": "$(json_escape "$GH_USER")",
  "repositoryPassword": "$(json_escape "$GH_PAT")",
  "repositoryReferenceName": "$(json_escape "$GIT_REF")",
  "pullImage": $PULL_IMAGE,
  "prune": false,
  "env": [
    {"name":"SPRING_PROFILES_ACTIVE","value":"$(json_escape "$SPRING_PROFILES_ACTIVE")"},
    {"name":"DB_NAME","value":"$(json_escape "$DB_NAME")"},
    {"name":"DB_USER","value":"$(json_escape "$DB_USER")"},
    {"name":"DB_PASSWORD","value":"$(json_escape "$DB_PASSWORD")"},
    {"name":"SECURITY_QR_SECRET","value":"$(json_escape "$SECURITY_QR_SECRET")"},
    {"name":"SECURITY_JWT_PRIVATE_KEY","value":"$(json_escape "$SECURITY_JWT_PRIVATE_KEY")"},
    {"name":"SECURITY_JWT_PUBLIC_KEY","value":"$(json_escape "$SECURITY_JWT_PUBLIC_KEY")"},
    {"name":"SECURITY_JWT_KEY_ID","value":"$(json_escape "$SECURITY_JWT_KEY_ID")"},
    {"name":"HTTP_PORT","value":"$(json_escape "$HTTP_PORT")"},
    {"name":"MINIO_USER","value":"$(json_escape "$MINIO_USER")"},
    {"name":"MINIO_PASSWORD","value":"$(json_escape "$MINIO_PASSWORD")"},
    {"name":"MINIO_KMS_SECRET_KEY","value":"$(json_escape "$MINIO_KMS_SECRET_KEY")"},
    {"name":"PUBLIC_BASE_URL","value":"$(json_escape "$PUBLIC_BASE_URL")"},
    {"name":"STORAGE_MINIO_BUCKET","value":"$(json_escape "$STORAGE_MINIO_BUCKET")"},
    {"name":"LOG_LEVEL_APP","value":"$(json_escape "$LOG_LEVEL_APP")"}
  ]
}
JSON
)
HTTP=$(curl -sk -m 900 -o /tmp/redeploy_resp.$$ -w '%{http_code}' \
  -X PUT "$PORTAINER_URL/api/stacks/$STACK_ID/git/redeploy?endpointId=$ENDPOINT_ID" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d "$PAYLOAD") || true
if [[ "$HTTP" != "200" ]]; then
  err "Redeploy falló (HTTP $HTTP):"; cat "/tmp/redeploy_resp.$$" >&2; echo >&2
  rm -f "/tmp/redeploy_resp.$$"; exit 1
fi
rm -f "/tmp/redeploy_resp.$$"
ok "Redeploy aceptado (HTTP 200). Portainer está reconstruyendo/levantando."

# --- 3) Verificación -------------------------------------------------
if [[ "$DO_VERIFY" != true ]]; then
  ok "Listo (verificación omitida por --no-verify)."
  exit 0
fi

log "Esperando a que el backend arranque (health UP)… hasta ~120 s"
UP=false
for i in $(seq 1 20); do
  # -L por si APP_URL apunta al puerto HTTP de un stack que ya sirve TLS y redirige.
  H=$(curl -sL -m 8 "$APP_URL/actuator/health" 2>/dev/null || true)
  if printf '%s' "$H" | grep -q '"status":"UP"'; then UP=true; ok "Health UP (~$((i*6)) s)."; break; fi
  sleep 6
done
if [[ "$UP" != true ]]; then
  err "El backend no reportó UP a tiempo. Revisa los logs del contenedor 'backend' en Portainer."
  exit 1
fi

log "Probando login de $VERIFY_EMAIL…"
CODE=$(curl -s -m 12 -o /dev/null -w '%{http_code}' -X POST "$APP_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$(json_escape "$VERIFY_EMAIL")\",\"password\":\"$(json_escape "$VERIFY_PASSWORD")\"}")
[[ "$CODE" == "200" ]] && ok "Login OK (200)." || err "Login devolvió HTTP $CODE (¿usuario sembrado?)."

log "Probando enlace directo del portal (/login)…"
CODE=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$APP_URL/login")
[[ "$CODE" == "200" ]] && ok "Portal/deep-link OK (200)." || err "/login devolvió HTTP $CODE."

echo
ok "Redespliegue completado. App: $APP_URL/login"
