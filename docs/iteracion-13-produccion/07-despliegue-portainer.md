# 07 — Manual de despliegue en Portainer

Guía paso a paso para desplegar el **backend** (Spring Boot / Java 21) y la
**aplicación web** (Angular servida por NGINX) de Nexus Soft Time Clock usando
**Portainer** (Community o Business, edición standalone sobre Docker).

Complementa a [`02-guia-despliegue.md`](02-guia-despliegue.md). Para producción a
gran escala se recomienda Kubernetes; Portainer es ideal para entornos únicos,
demos, staging o instalaciones on-premise pequeñas/medianas.

---

## 1. Arquitectura del stack

Portainer levanta un **stack** (compose) con estos servicios en una red interna
privada. Solo NGINX expone un puerto al exterior:

```
                 ┌─────────── Portainer stack: nexus-time-clock ────────────┐
   Internet ──▶  │  nginx  ──▶  web (Angular/NGINX)   [ / ]                 │
   (puerto       │    │                                                     │
    HTTP_PORT)   │    ├──────▶  backend (Spring Boot)  [ /api /ws /actuator]│
                 │    │              │        │                             │
                 │    │              ▼        ▼                             │
                 │    │          postgres    redis                          │
                 │    │                                                     │
                 │    └──────▶  minio (evidencias)  [ /evidence/ ]          │
                 └──────────────────────────────────────────────────────────┘
```

- La web usa rutas **relativas** (`/api/v1`, `/ws`), por lo que **NGINX es
  obligatorio** como único punto de entrada: enruta `/` → web y
  `/api`, `/ws`, `/swagger-ui` → backend.
- De `/actuator` **solo sale `/actuator/health`**; el resto responde 404 desde NGINX.
  `/actuator/prometheus` exponía el volumen de marcaciones, la topología y la memoria del
  servidor sin credencial: ahora pide HTTP Basic (`SECURITY_METRICS_PASSWORD`) y se scrapea
  por la red interna, sin pasar por NGINX.
- NGINX sirve **HTTPS** en cuanto encuentra certificados montados (§3.1); si no los
  encuentra arranca en HTTP y lo dice en su log.
- `postgres` (PostGIS) y `redis` quedan **solo en la red interna** (sin puertos
  publicados). El backend se conecta por nombre de servicio (`postgres`, `redis`).
- **Flyway** aplica las migraciones (`db/migration`) automáticamente al arrancar
  el backend; no hay paso manual de esquema.
- `minio` guarda las **evidencias fotográficas** (RF-18) y tampoco publica puertos:
  se llega por NGINX en `/evidence/`, que es el mismo nombre del bucket. El cliente
  sube la foto **directo a MinIO** con una URL prefirmada que emite el backend, así
  que ese prefijo tiene que ser alcanzable desde el móvil y el portal.

> **SMTP (notificaciones)** no se incluye en el stack mínimo. Si tu iteración lo
> requiere, añádelo como servicio extra o apunta el backend a una instancia
> gestionada mediante variables de entorno.

---

## 2. Requisitos previos

1. **Portainer** operativo y conectado a un entorno Docker (local o Agent).
2. En el host Docker: acceso a Internet para descargar imágenes base
   (`postgis/postgis`, `redis`, `minio/minio`, `nginx`, `maven`, `node`).
3. **Repositorio Git accesible** desde Portainer (recomendado — método A), o un
   **registry de imágenes** donde publicar backend/web (método B).
4. Recursos sugeridos del host: **≥ 4 vCPU, 8 GB RAM, 20 GB disco** (el build de
   Maven + Node es intensivo; ver §7 si el host es pequeño).

Los ficheros clave ya viven en el repo:

| Fichero | Rol |
|---|---|
| `infra/portainer-stack.yml` | Compose del stack (este manual lo usa) |
| `infra/backend.Dockerfile` | Build multi-stage del backend (JRE 21) |
| `infra/web.Dockerfile` | Build Angular → NGINX |
| `infra/nginx/nginx.conf` | Reverse proxy: upstreams y ajustes globales |
| `infra/nginx/locations.conf` | Rutas (web/API/ws, `/evidence/` → MinIO), compartidas por HTTP y HTTPS |
| `infra/nginx/server-http.conf` · `server-tls.conf` | Los dos modos de servidor; el entrypoint elige |
| `infra/nginx/40-tls.sh` | Elige modo según haya certificados legibles |

---

## 3. Variables de entorno

Configúralas en Portainer (pestaña **Environment variables** del stack). Las
marcadas 🔴 son **obligatorias** y **sin valor por defecto** — el stack no
arranca sin ellas.

| Variable | Oblig. | Por defecto | Descripción |
|---|:---:|---|---|
| `DB_PASSWORD` | 🔴 | — | Contraseña de PostgreSQL. **Usar valor fuerte.** |
| `SECURITY_QR_SECRET` | 🔴 | — | Secreto HMAC para el QR firmado. **Rotar y guardar seguro.** |
| `MINIO_PASSWORD` | 🔴 | — | Contraseña del storage de evidencias |
| `PUBLIC_BASE_URL` | 🔴 | — | Origen público del stack, p. ej. `http://mi-host:8088` (ver aviso abajo) |
| `SECURITY_JWT_PRIVATE_KEY` / `SECURITY_JWT_PUBLIC_KEY` | | — | Par RSA de firma del JWT, PEM en una línea con `\n` literales. **Sin ellas la llave se regenera en cada arranque y todas las sesiones caen.** |
| `SECURITY_JWT_KEY_ID` | | `nexus-rsa` | Identificador de la llave en el JWKS |
| `MINIO_USER` | | `minioadmin` | Usuario del storage de evidencias |
| `STORAGE_MINIO_BUCKET` | | `evidence` | Bucket de evidencias. **Debe coincidir** con el prefijo `/evidence/` de NGINX |
| `MINIO_KMS_SECRET_KEY` | | — | Llave del KMS embebido: activa el cifrado en reposo (SSE-S3, RNF-08). Sin ella el bucket queda **sin cifrar** y el backend lo avisa por log |
| `DB_NAME` | | `nexus` | Nombre de la base de datos |
| `DB_USER` | | `nexus` | Usuario de PostgreSQL |
| `SPRING_PROFILES_ACTIVE` | | `prod` | Perfil de Spring |
| `HTTP_PORT` | | `8081` | Puerto HTTP del host. Con TLS activo solo redirige a HTTPS |
| `HTTPS_PORT` | | `8443` | Puerto HTTPS del host. Alto por defecto para no chocar con lo que ya escuche en el 443 (NGINX no arrancaría y tumbaría el stack). **Al activar TLS de verdad, ponerlo en 443**: la redirección desde HTTP se construye con `$host`, que no lleva puerto |
| `TLS_CERTS_DIR` | | `/etc/nexus/tls-certs` | Directorio **del host** con los certificados, montado en `/etc/nginx/certs`. El defecto no existe a propósito: el stack se queda en HTTP salvo que se monten certificados a conciencia. Para que termine TLS: `/etc/letsencrypt/live/<dominio>` |
| `TLS_CERT_FILE` / `TLS_KEY_FILE` | | `/etc/nginx/certs/fullchain.pem` · `privkey.pem` | Rutas **dentro del contenedor**. Si ambas son legibles, NGINX levanta en HTTPS |
| `CERTBOT_WEBROOT` | | `/var/www/certbot` | Raíz del desafío HTTP-01 para renovar sin parar el stack |
| `SECURITY_METRICS_PASSWORD` | | — | Contraseña del scrape de `/actuator/prometheus`. **Sin ella el endpoint queda cerrado** (se pierde la métrica, no la privacidad) |
| `SECURITY_METRICS_USERNAME` | | `prometheus` | Usuario del scrape |
| `SECURITY_JWT_ACCESS_TTL_SECONDS` | | `900` | TTL del access token |
| `SECURITY_JWT_REFRESH_TTL_DAYS` | | `30` | TTL del refresh token |
| `MAIL_HOST` / `MAIL_PORT` | | `mailhog` / `1025` | SMTP de notificaciones |
| `LOG_LEVEL_APP` | | `INFO` | Nivel de log de la app |
| `REGISTRY` / `TAG` | | — | Solo método B (registry) |

> ⚠️ **Genera secretos fuertes**, por ejemplo:
> `openssl rand -base64 32` para `SECURITY_QR_SECRET`, `DB_PASSWORD` y
> `MINIO_PASSWORD`. Nunca los subas al repositorio.
> Para `MINIO_KMS_SECRET_KEY` el formato es `nombre:clave-base64` y la clave debe
> decodificar a 32 bytes exactos, p. ej.
> `nexus-evidence:$(openssl rand -base64 32)`.

> ⚠️ **`PUBLIC_BASE_URL` es el origen por el que el cliente entra al stack**
> (`esquema://host:HTTP_PORT`), **sin barra final y sin `/evidence`**. Con él se
> firman las URLs de subida: SigV4 firma la cabecera `Host`, así que si aquí va
> otro host, otro puerto u otro esquema que los reales, **toda subida de evidencia
> falla con `SignatureDoesNotMatch`**. Si más adelante pones un dominio con TLS
> delante, hay que actualizarla a `https://tu-dominio`.

---

### 3.1 TLS (RNF-05, RN-42)

El NGINX del stack sirve HTTPS **en cuanto encuentra certificados legibles**; mientras no los
haya arranca en HTTP y lo avisa por log (`[nginx] Sin certificados legibles en …`). Al
activarse, el puerto HTTP pasa a responder `301` hacia HTTPS y se añade HSTS de un año.

Con Let's Encrypt en el host:

```bash
# 1) Primera emisión. El stack ya sirve /.well-known/acme-challenge/ en HTTP, que es
#    justamente el modo en el que está antes de tener certificado.
sudo certbot certonly --webroot -w /var/www/certbot -d asistencia.tudominio.com

# 2) Comprueba que el 443 del host está libre ANTES de reclamarlo: si está ocupado,
#    NGINX no arranca y se lleva por delante el stack entero.
sudo ss -lntp | grep ':443' || echo "443 libre"

# 3) Variables del stack en Portainer
TLS_CERTS_DIR=/etc/letsencrypt/live/asistencia.tudominio.com
HTTPS_PORT=443
PUBLIC_BASE_URL=https://asistencia.tudominio.com

# 4) Redespliega el stack y comprueba el modo en el log de nginx
curl -I https://asistencia.tudominio.com/actuator/health
```

> ⚠️ **`PUBLIC_BASE_URL` tiene que pasar a `https://`** al activar TLS. Con él se firman las
> URLs prefirmadas de MinIO, y SigV4 firma el host y el esquema: una firma emitida contra
> `http://` falla al servirse por `https://` con el opaco `SignatureDoesNotMatch`.

> La renovación no reinicia NGINX por su cuenta. Añade al cron de certbot un
> `docker exec <contenedor-nginx> nginx -s reload` en el hook `--deploy-hook`, o el
> certificado nuevo no se usará hasta el siguiente redespliegue.

> ⚠️ **Las variables del stack se fijan en el repositorio, no a mano en la UI.** El
> redespliegue **reemplaza** la configuración de entorno completa (`stack.Env = payload.Env`),
> así que cualquier variable escrita solo en Portainer desaparece en el siguiente deploy. El
> sitio correcto es `scripts/.env` (o los *secrets*/*variables* del repo para el workflow), que
> es lo que `scripts/redeploy.sh` envía.

> **Si ya hay un proxy delante terminando TLS** (Traefik, Caddy, openresty, el NGINX del host),
> que es el caso del despliegue actual: **no** definas `TLS_CERTS_DIR` ni `HTTPS_PORT`. El stack
> se queda en HTTP detrás del proxy, que es quien pone el `X-Forwarded-Proto` que estas rutas ya
> propagan. Montar los certificados ahí sería contraproducente por partida doble: el contenedor
> pelearía por el 443 que el proxy ya ocupa —y sin ese puerto no arranca, tumbando la entrada del
> stack— y su puerto HTTP pasaría a devolver solo redirecciones, dejando al proxy en bucle.
>
> `PUBLIC_BASE_URL` **sí** lleva `https://` en ese caso: es el origen que ve el cliente, no el
> esquema con el que hablan los contenedores entre ellos.

## 4. Método A — Desplegar desde el repositorio Git (recomendado)

Portainer clona el repo y **construye las imágenes** con los Dockerfiles. No
necesitas registry.

1. En Portainer: **Stacks → + Add stack**.
2. **Name**: `nexus-time-clock`.
3. **Build method**: selecciona **Repository**.
4. Rellena:
   - **Repository URL**: la URL de tu repositorio Git.
   - **Repository reference**: rama a desplegar (p. ej. `refs/heads/main`).
   - **Compose path**: `infra/portainer-stack.yml`.
   - **Authentication**: actívala si el repo es privado (usuario + token).
5. En **Environment variables**, añade al menos `DB_PASSWORD`,
   `SECURITY_QR_SECRET`, `MINIO_PASSWORD` y `PUBLIC_BASE_URL` (§3): sin las cuatro
   el stack ni siquiera arranca. Añade el resto según necesites.
6. (Opcional) Activa **GitOps updates / polling** para redesplegar
   automáticamente cuando cambie la rama.
7. Pulsa **Deploy the stack**.

Portainer ejecutará el build (Maven + Node → primera vez tarda varios minutos) y
levantará los contenedores. Sigue el progreso en **Stacks → nexus-time-clock**.

---

## 5. Método B — Imágenes pre-construidas en un registry

Recomendado para producción (builds reproducibles, arranque rápido, el host de
Portainer no compila).

### 5.1 Construir y publicar las imágenes

Desde una máquina con Docker y el repo clonado (o en tu CI):

```bash
# En la raíz del repositorio
REGISTRY=registry.midominio.com
TAG=1.0.0

docker build -f infra/backend.Dockerfile -t $REGISTRY/nexus/backend:$TAG .
docker build -f infra/web.Dockerfile     -t $REGISTRY/nexus/web:$TAG .

docker push $REGISTRY/nexus/backend:$TAG
docker push $REGISTRY/nexus/web:$TAG
```

> Tip: en `.github/workflows/ci.yml` puedes añadir un job que haga build+push en
> cada tag de release.

### 5.2 Ajustar el compose

En `infra/portainer-stack.yml`, en los servicios `backend` y `web`:
**comenta el bloque `build:`** y **descomenta la línea `image:`**.

### 5.3 Desplegar

1. **Stacks → + Add stack → Name**: `nexus-time-clock`.
2. **Build method**: **Web editor** y pega el contenido de
   `infra/portainer-stack.yml`, **o** usa **Repository** apuntando al compose.
3. En **Environment variables** añade además `REGISTRY` y `TAG`, y los secretos de §3.
4. Si el registry es privado: **Registries** en Portainer → añade credenciales
   antes de desplegar.
5. **Deploy the stack**.

> ⚠️ **NGINX y su config.** El servicio `nginx` monta `./nginx/nginx.conf`
> (bind-mount relativo al compose). Esto funciona con el método **Repository**
> (el repo está en el host). Con **Web editor puro** ese fichero no existe en el
> host: usa el método Repository, o baja `infra/nginx/nginx.conf` al host y ajusta
> la ruta del volumen, o hornea la config en una imagen NGINX propia.

---

## 6. Verificación post-despliegue

Con el stack **running** (6 contenedores en verde):

1. **Estado del backend** — desde el host o un contenedor de la red:
   ```bash
   curl http://localhost:${HTTP_PORT:-8081}/actuator/health
   # → {"status":"UP", ...}
   ```
2. **Portal web**: abre `http://<host>:<HTTP_PORT>/` en el navegador → carga la
   SPA de Angular.
3. **API vía proxy**: `http://<host>:<HTTP_PORT>/swagger-ui.html` muestra la
   documentación OpenAPI.
4. **Migraciones Flyway**: en los **logs del contenedor `backend`** debe verse
   `Successfully applied N migrations` sin errores.
5. **Base de datos**: en logs de `postgres`, `database system is ready to accept
   connections`.
6. **Evidencias — bucket listo**: en los logs de `backend`, las líneas del
   `StorageBucketInitializer`:
   ```
   Bucket de evidencias 'evidence' creado.                      ← solo el 1er arranque
   Cifrado en reposo SSE-S3 activo en el bucket 'evidence'.
   Retención de evidencias fijada en 400 días para 'evidence'.
   ```
   Si en vez de la segunda aparece `NO se pudo activar SSE-S3`, falta
   `MINIO_KMS_SECRET_KEY` en el contenedor `minio` y las fotos quedarán sin cifrar.
7. **Evidencias — ruta pública**: `curl -i http://<host>:<HTTP_PORT>/evidence/`
   debe devolver un **XML de MinIO** (`AccessDenied` / `NoSuchKey`). Si responde el
   HTML del portal o un 404 de NGINX, la `location /evidence/` no enruta y ninguna
   foto podrá subirse.
8. **Ciclo completo de subida** (lo único que valida `PUBLIC_BASE_URL`): registra
   una marcación con evidencia desde el móvil o el portal. Un
   `SignatureDoesNotMatch` en la respuesta del `PUT` apunta siempre a esa variable.

Si algo falla, revisa **Logs** de cada contenedor desde Portainer
(Stacks → contenedor → Logs) y la §8.

---

## 7. Producción — recomendaciones

- **TLS obligatorio.** NGINX de este stack sirve HTTP en `HTTP_PORT`. Coloca
  delante un terminador TLS: un reverse proxy del host (Traefik, Caddy, NGINX del
  sistema con Let's Encrypt) o el balanceador de tu infraestructura. La app ya
  respeta `X-Forwarded-*` (`forward-headers-strategy: framework`).
- **Persistencia.** Los volúmenes `pgdata`, `redisdata` y `miniodata` conservan los
  datos. En Portainer no marques *"prune"* al actualizar. Haz **backups** de
  `pgdata` (`pg_dump`) periódicamente, y de `miniodata` si las evidencias son
  prueba legal: crecen con cada marcación y solo expiran a los
  `STORAGE_MINIO_RETENTION_DAYS` (400 días por defecto).
- **Secretos.** Prefiere **Portainer Secrets** / gestor externo antes que texto
  plano en variables del stack para `DB_PASSWORD`, `SECURITY_QR_SECRET`,
  `MINIO_PASSWORD`, `MINIO_KMS_SECRET_KEY` y el par `SECURITY_JWT_*`.
- **Host pequeño.** El build de Maven+Node consume RAM. Si el host de Portainer es
  modesto, usa el **método B** (imágenes ya construidas en CI) para no compilar en
  el servidor.
- **SPA deep-linking.** Si al recargar una ruta profunda (p. ej. `/dashboard`)
  aparece un 404, la imagen `web` necesita fallback SPA
  (`try_files $uri /index.html`). Añádelo en `infra/web.Dockerfile` con una
  `nginx.conf` propia. La navegación normal dentro de la app no se ve afectada.
- **Actualizar el stack.** Método A: haz push a la rama y **Update the stack**
  (con *re-pull / re-build*). Método B: sube el `TAG`, y **Update** con *re-pull*.
  Flyway aplicará solo las migraciones nuevas (compatibles hacia atrás).

---

## 8. Solución de problemas

| Síntoma | Causa probable | Acción |
|---|---|---|
| Stack no arranca, error `falta DB_PASSWORD` | Variable obligatoria sin definir | Añade `DB_PASSWORD` y `SECURITY_QR_SECRET` en Environment variables |
| `backend` reinicia en bucle | Postgres/Redis aún no sanos, o credenciales BD mal | Revisa logs de `postgres`; verifica `DB_*`; espera al healthcheck |
| Web carga pero la API da 404/502 | NGINX no enruta o backend caído | Revisa logs de `nginx` y `backend`; confirma `/actuator/health` UP |
| 404 al recargar rutas del portal | Falta fallback SPA | Ver §7 (deep-linking) |
| `nginx` no arranca: no such file `nginx.conf` | Bind-mount sin fichero (web editor puro) | Usa método Repository o baja `nginx.conf` al host (ver §5.3) |
| Build falla por memoria | Host sin RAM para Maven/Node | Usa método B (registry) |
| Puerto en uso | `HTTP_PORT` ocupado en el host | Cambia `HTTP_PORT` a otro valor libre |
| Stack no arranca: `falta MINIO_PASSWORD` / `falta PUBLIC_BASE_URL` | Variables del storage sin definir | Añádelas en Environment variables (§3) |
| `minio` nunca llega a *healthy* y `backend` no arranca | `backend` espera a `minio` sano (`depends_on`) | Revisa logs de `minio`: un `FATAL ... KMS` señala una `MINIO_KMS_SECRET_KEY` mal formada (falta el prefijo `nombre:` o no decodifica a 32 bytes). `scripts/redeploy.sh` valida el formato antes de desplegar |
| Al subir la foto: `SignatureDoesNotMatch` | `PUBLIC_BASE_URL` no coincide con el origen real del cliente | Ponle el mismo esquema/host/puerto por el que se entra (§3) |
| Al subir la foto: `413 Request Entity Too Large` | Límite del proxy | `client_max_body_size` de `/evidence/` en `infra/nginx/nginx.conf` (3m); súbelo si aumentas `STORAGE_MINIO_MAX_BYTES` |
| Las sesiones del móvil caen tras cada despliegue | El stack perdió el par `SECURITY_JWT_*` y el backend regenera la llave | Vuelve a definirlo (§3); si redespliegas con `scripts/redeploy.sh`, debe viajar en su payload porque Portainer **reemplaza** la env del stack |

---

## Referencias

- Compose del stack: `infra/portainer-stack.yml`
- Dockerfiles: `infra/backend.Dockerfile`, `infra/web.Dockerfile`
- Reverse proxy: `infra/nginx/nginx.conf`
- Evidencia fotográfica (RF-18): [`../iteracion-08-registro-asistencia/01-evidencia-fotografica.md`](../iteracion-08-registro-asistencia/01-evidencia-fotografica.md)
- Guía general de despliegue: [`02-guia-despliegue.md`](02-guia-despliegue.md)
- Topología de producción (K8s): [`../iteracion-02-arquitectura/08-despliegue.md`](../iteracion-02-arquitectura/08-despliegue.md)
