# Manual de Redespliegue Continuo — Nexus Soft Time Clock

> Procedimiento a seguir **cada vez que se realiza un cambio** (backend, portal web,
> infraestructura o base de datos) para publicarlo en el entorno de Portainer.
> Complementa a [`07-despliegue-portainer.md`](07-despliegue-portainer.md) (despliegue inicial).

---

## 1. Ficha del despliegue actual

| Dato | Valor |
|---|---|
| Portainer | `https://85.239.240.43:9443` (usuario `Admon_dev`, rol admin) |
| Entorno Docker (endpoint) | `local` — **Id 2** |
| Stack | `nexus-time-clock` — **Id 72** |
| Método | **Repository (git)** — Portainer clona y **construye** las imágenes en el host |
| Repositorio | `https://github.com/Dem0776/nexus-soft-time-clock.git` (**privado**, auth con PAT de GitHub) |
| Rama / Compose | `refs/heads/main` · `infra/portainer-stack.yml` |
| URL de la app | `http://85.239.240.43:8088` (login en `/login`) |
| Servicios | `postgres` · `redis` · `backend` · `web` · `nginx` |
| Datos persistentes | volúmenes `nexus-time-clock_pgdata` y `nexus-time-clock_redisdata` |

> **Regla de oro:** el flujo es siempre **`commit → push → pull & redeploy en Portainer`**.
> Portainer solo despliega lo que está en `origin/main`; los cambios locales sin *push* **no** se publican.

---

## 2. Flujo estándar (resumen)

```
1. Cambio local  ──►  2. Verificar build local  ──►  3. git commit
        ──►  4. git push origin main  ──►  5. Redeploy en Portainer
        ──►  6. Esperar arranque (~45 s el backend)  ──►  7. Verificar
```

### Paso 2 — Verificar antes de subir (evita romper el despliegue)
Según lo que tocaste:

```bash
# Backend (Java) — compila el reactor completo
cd backend && mvn -q -Dmaven.compiler.release=17 compile
#   y si cambiaste lógica, corre los tests del módulo afectado:
#   mvn -q -Dmaven.compiler.release=17 -pl modules/<modulo> test

# Portal web (Angular)
cd web && npm run build
```

> El entorno local tiene **JDK 17**; por eso el `-Dmaven.compiler.release=17`.
> Dentro de Docker el build usa **JDK 21** (definido en `infra/backend.Dockerfile`), así que
> **no** hace falta cambiar el `pom` — solo es para la verificación local.

### Pasos 3-4 — Commit y push
```bash
git add -A
git commit -m "feat|fix|infra(scope): descripción del cambio"
git push origin main
```

---

## 3. Redespliegue — Método A: Portainer (UI)  ✅ recomendado

1. Entra a `https://85.239.240.43:9443` → **Stacks** → **nexus-time-clock**.
2. Botón **"Pull and redeploy"** (o **Git pull** + **Update**).
   - Deja marcado **"Re-pull image"** solo si quieres forzar reconstrucción total;
     normalmente **no** hace falta (Docker reutiliza capas cacheadas).
   - Las **variables de entorno** ya están guardadas en el stack; **no** las borres.
3. Confirma. Portainer hace `git pull` + `docker compose up -d --build` y recrea
   únicamente los contenedores cuya imagen o config cambió.
4. Ve a **Containers** y espera a que `backend` quede estable (~45 s; ver §5).

> La autenticación git (PAT) y todas las env-vars quedaron guardadas en el stack:
> por la **UI no hay que reintroducirlas**.

---

## 4. Redespliegue — Método B: script `scripts/redeploy.sh` (automatizable)

Útil para CI o para redesplegar desde tu máquina sin abrir el navegador. El
repositorio ya incluye el script **[`scripts/redeploy.sh`](../../scripts/redeploy.sh)**:
autentica en Portainer, dispara `git pull + redeploy` **reenviando todas las
env-vars** (por API el cuerpo las reemplaza, así que hay que mandarlas) y
**verifica** salud + login + deep-link tras el arranque.

### Uso (una sola vez: preparar los secretos)
```bash
cp scripts/.env.example scripts/.env     # scripts/.env está en .gitignore: NO se sube
#   edita scripts/.env y rellena PORTAINER_PASS, GH_PAT, DB_PASSWORD, SECURITY_QR_SECRET
```

### Cada redespliegue
```bash
bash scripts/redeploy.sh
```
Salida esperada (todo en verde):
```
✔ Autenticado.
✔ Redeploy aceptado (HTTP 200).
✔ Health UP (~54 s).
✔ Login OK (200).
✔ Portal/deep-link OK (200).
✔ Redespliegue completado. App: http://85.239.240.43:8088/login
```

El script **valida** que estén los 4 secretos obligatorios y aborta con un mensaje
claro si falta alguno. Los valores se leen de `scripts/.env` **o** del entorno
(útil en CI: exporta las variables como *secrets* del pipeline en vez de usar el archivo).

### Flags
| Flag | Efecto |
|---|---|
| `--pull-image` | Fuerza re-pull/reconstrucción total de imágenes (por defecto reutiliza caché) |
| `--no-verify` | Omite la verificación post-deploy |
| `-h`, `--help` | Ayuda |

> ⚠️ **Nunca** pongas secretos reales en `scripts/.env.example` ni los subas al repo.
> `scripts/.env` y `*.local` están en `.gitignore`. En CI, usa el gestor de *secrets*
> del pipeline y expórtalos como variables de entorno antes de llamar al script.

### Método C — automático en cada push (GitHub Actions)

El repo incluye el workflow **[`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)**,
que ejecuta `scripts/redeploy.sh` automáticamente en cada `push` a `main`
(ignorando cambios que no afectan al stack: `docs/**`, `**/*.md`, `mobile/**`,
`.github/**`). También admite disparo manual desde **Actions → Deploy → Run workflow**
(con opciones *pull_image* y *verify*).

**Configuración única — crear los *secrets* del repo** en
`Settings → Secrets and variables → Actions → New repository secret`:

| Secret | Valor |
|---|---|
| `PORTAINER_PASS` | contraseña del usuario de Portainer |
| `GH_PAT` | Personal Access Token de GitHub con lectura del repo (para que Portainer lo clone) |
| `DB_PASSWORD` | **la misma** del stack desplegado (pestaña Environment del stack) |
| `SECURITY_QR_SECRET` | idem |

Variables opcionales (`Settings → … → Variables`) para *overrides*: `PORTAINER_URL`,
`APP_URL`, `STACK_ID`, `ENDPOINT_ID`, `HTTP_PORT`. Si no se definen, el script usa sus
valores por defecto.

> **Prerrequisito de red:** los *runners* de GitHub (alojados) deben poder alcanzar
> `85.239.240.43` en los puertos `9443` (API Portainer) y `8088` (verificación). Si el
> servidor filtra por IP de origen, usa un **runner self-hosted** en una red con acceso,
> o desactiva la verificación con la opción *verify=false* en el disparo manual.
> Mientras no existan los 4 *secrets*, el job fallará a propósito en la validación inicial
> del script (mensaje: "faltan variables obligatorias").

---

## 5. Verificación post-despliegue (obligatoria)

Tras cualquier redeploy, comprueba en este orden. El backend tarda **~45 s** en arrancar;
un `502` momentáneo es normal en ese intervalo.

```bash
# 1) Salud del backend (debe salir UP)
curl -s http://85.239.240.43:8088/actuator/health          # {"status":"UP",...}

# 2) Login funcional de punta a punta (debe salir 200 con token)
curl -s -X POST http://85.239.240.43:8088/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Admin123!"}'

# 3) Portal y enlaces directos (deben salir 200, no 404)
curl -s -o /dev/null -w "%{http_code}\n" http://85.239.240.43:8088/login
```

En la UI de Portainer: **Containers** → los 5 contenedores en `running`;
`postgres` y `redis` con etiqueta `(healthy)`; `backend` con *uptime* creciente
(si se reinicia cada ~30-60 s, está en *crash-loop* → ver §8).

---

## 6. Casos especiales según el tipo de cambio

| Cambio | Qué reconstruye | Notas |
|---|---|---|
| **Solo frontend** (`web/`) | imagen `web` (npm ~1-2 min) | Fallback SPA ya configurado; refrescos/deep-links OK |
| **Backend** (`backend/`) | imagen `backend` (Maven, varios min) | El primer build cachea dependencias; los siguientes son más rápidos |
| **Nueva migración BD** (`db/migration/Vxx__*.sql`) | imagen `backend` | **Flyway la aplica sola** al arrancar el backend. **Numeración incremental y nunca editar migraciones ya aplicadas** |
| **`infra/portainer-stack.yml`** | según servicios | Cambios de servicios/puertos/volúmenes |
| **Env-var / secreto** | — | Actualiza en **Stack → Environment variables** (UI) y redeploy; por API, en el `env[]` |
| **`infra/*.Dockerfile` o `*nginx*.conf`** | la imagen afectada | nginx del portal y del proxy tienen su config **horneada** en imagen |

> **Migraciones:** verifica que el arranque muestre `Successfully applied N migrations`
> en los logs del `backend`. Si una migración falla, el backend no arranca (queda en
> *crash-loop*) — revisa el SQL y corrige con una **nueva** migración.

---

## 7. Qué **NO** hacer (para no perder datos ni romper el login)

- ❌ **No borres el volumen `nexus-time-clock_pgdata`.** Contiene la BD (empresas,
  usuarios, asistencias…). Un redeploy normal **lo conserva**; borrarlo obliga a
  re-sembrar usuarios (§9) y pierde todos los datos.
- ❌ **No cambies `DB_USER`/`DB_PASSWORD`** de un despliegue existente esperando que
  Postgres los adopte: Postgres solo aplica esas credenciales al **inicializar un
  volumen vacío**. Si el volumen ya tiene datos, se ignoran y el backend fallará con
  `password authentication failed` (ver §8).
- ❌ **No edites migraciones Flyway ya aplicadas** (cambia su checksum → error de
  validación). Crea una migración nueva.
- ❌ **No uses el puerto 8081** ni otros ya ocupados en ese host compartido: el punto de
  entrada es **8088**.

---

## 8. Solución de problemas rápida

| Síntoma | Causa probable | Acción |
|---|---|---|
| `502 Bad Gateway` en `/api` justo tras redeploy | Backend aún arrancando (~45 s) | Esperar y reintentar; ver logs del `backend` |
| `502` persistente (>2 min) | Backend en *crash-loop* | Ver logs: buscar `ERROR`/`Caused by` |
| `FATAL: password authentication failed for user "nexus"` / `role "nexus" does not exist` | Volumen `pgdata` viejo con credenciales/superusuario distintos | Si es entorno desechable: parar stack, borrar `nexus-time-clock_pgdata`, redeploy (init limpio) y **re-sembrar** (§9) |
| `/actuator/health` = `DOWN` pero login funciona | Indicador de salud de una dependencia opcional (p. ej. mail) | El de mail ya está desactivado (`MANAGEMENT_HEALTH_MAIL_ENABLED`). Revisar qué componente falla |
| `404` al abrir `/login` o refrescar rutas | Falta fallback SPA | Ya resuelto en `infra/web-nginx.conf`; confirmar que la imagen `web` se reconstruyó |
| Portainer: `authentication required: Repository not found` | PAT de GitHub inválido/expirado | Renovar el PAT en **Stack → Git** o en el `env` del script |
| `pull access denied for minio/minio, repository does not exist or may require 'docker login'` | MinIO archivó su edición comunitaria y **borró la imagen de Docker Hub** | Ya resuelto: los compose apuntan a `quay.io/minio/minio`. Si reaparece, comprobar que nadie devolvió el prefijo. Ver el aviso de abajo |

> **Sobre el origen de la imagen de MinIO.** MinIO archivó su edición comunitaria y retiró
> `minio/minio` de Docker Hub, que hoy responde `object not found`. El mensaje de error habla de
> `docker login`, pero **no es un problema de credenciales**: el repositorio ya no existe y ningún
> login lo arregla. Por eso `infra/portainer-stack.yml` e `infra/docker-compose.yml` tiran de
> `quay.io/minio/minio`, el registro propio de MinIO, que sirve el mismo tag con pull anónimo. No
> devuelvas el prefijo a `minio/minio` "para limpiar": eso vuelve a romper el redespliegue.
>
> El fallo solo aparece cuando se fuerza el pull (`--pull-image`, o **Re-pull image** en la UI),
> que es justo lo que hace el despliegue automático de cada push a `main`. Sin forzarlo, Docker
> reutiliza la imagen cacheada en el host y el stack sigue funcionando, que es por lo que esto
> puede tardar semanas en manifestarse.
>
> Nota aparte, de seguridad: al estar archivada la edición comunitaria, esa imagen ya no recibe
> parches. Conviene planificar su relevo (subir a la última comunitaria, replicarla en un registro
> propio, o sustituir el almacén por otro compatible con S3).

**Ver logs de un contenedor** (UI): Containers → `nexus-time-clock-backend-1` → **Logs**.
Por API:
```bash
# (reutiliza $JWT del login) — últimas 80 líneas del backend
CID=$(curl -sk "$PORTAINER/api/endpoints/2/docker/containers/json?filters=%7B%22label%22%3A%5B%22com.docker.compose.service%3Dbackend%22%2C%22com.docker.compose.project%3Dnexus-time-clock%22%5D%7D" \
  -H "Authorization: Bearer $JWT" | grep -oE '"Id":"[a-f0-9]+"' | head -1 | sed -E 's/.*"Id":"([a-f0-9]+)".*/\1/')
curl -sk "$PORTAINER/api/endpoints/2/docker/containers/$CID/logs?stdout=true&stderr=true&tail=80" \
  -H "Authorization: Bearer $JWT"
```

---

## 9. Re-sembrar usuarios (solo si se recreó la BD)

El perfil `prod` **no** siembra usuarios (el `DevDataSeeder` es solo `dev`). Si borraste el
volumen `pgdata`, tras el redeploy hay que volver a crear los usuarios demo. Con el backend
ya arrancado (migraciones aplicadas), ejecuta este SQL en el contenedor `postgres`
(Portainer → Containers → `postgres` → **Console** → `/bin/sh`), o por API con `exec`:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
INSERT INTO companies (id,code,name,email_domain,timezone,locale,status)
  VALUES ('11111111-1111-1111-1111-111111111111','DEMO','Empresa Demo','demo.com','America/Mexico_City','es','ACTIVE');
INSERT INTO company_settings (company_id) VALUES ('11111111-1111-1111-1111-111111111111');
INSERT INTO users (id,tenant_id,is_platform_admin,email,password_hash,first_name,last_name,status)
  VALUES ('22222222-2222-2222-2222-222222222222',NULL,true,'superadmin@nexus.io',crypt('Admin123!',gen_salt('bf',10)),'Super','Admin','ACTIVE');
INSERT INTO users (id,tenant_id,is_platform_admin,email,password_hash,first_name,last_name,status)
  VALUES ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111',false,'admin@demo.com',crypt('Admin123!',gen_salt('bf',10)),'Ana','Administradora','ACTIVE');
INSERT INTO users (id,tenant_id,is_platform_admin,email,password_hash,first_name,last_name,status,employee_code)
  VALUES ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111',false,'empleado@demo.com',crypt('Admin123!',gen_salt('bf',10)),'Emilio','Empleado','ACTIVE','EMP-001');
INSERT INTO user_roles (user_id,role_id) SELECT '22222222-2222-2222-2222-222222222222',id FROM roles WHERE tenant_id IS NULL AND code='SUPER_ADMIN';
INSERT INTO user_roles (user_id,role_id) SELECT '33333333-3333-3333-3333-333333333333',id FROM roles WHERE tenant_id IS NULL AND code='COMPANY_ADMIN';
INSERT INTO user_roles (user_id,role_id) SELECT '44444444-4444-4444-4444-444444444444',id FROM roles WHERE tenant_id IS NULL AND code='EMPLOYEE';
```

Comando de consola: `psql -U nexus -d nexus -c "<pega el SQL>"`.
Contraseña de los 3 usuarios: **`Admin123!`**.

> **Para producción real:** en vez de sembrar a mano, conviene un mecanismo de bootstrap
> de administrador controlado por env (no incluido aún) y credenciales fuertes en lugar
> de `Admin123!`.

---

## 10. Rollback (volver a una versión anterior)

Portainer despliega el `HEAD` de `main`. Para revertir un cambio:

```bash
# Opción A (recomendada): revertir el commit y volver a desplegar
git revert <sha-del-commit-problemático>
git push origin main
# luego: Pull and redeploy en Portainer

# Opción B: apuntar el stack a un commit/tag concreto
#   Stack → Git → "Repository reference" = refs/tags/<tag>  o un SHA, y redeploy
```

> Evita `git push --force` sobre `main`. El *rollback* con `git revert` es reversible y
> deja trazabilidad.

---

## 11. Checklist exprés

- [ ] Cambio compila/pasa build local (`mvn compile` / `npm run build`)
- [ ] `git commit` + `git push origin main`
- [ ] **Pull and redeploy** del stack `nexus-time-clock` en Portainer
- [ ] Backend estable en `running` (sin *crash-loop*)
- [ ] `/actuator/health` = `UP`
- [ ] Login `admin@demo.com / Admin123!` = 200
- [ ] `/login` y deep-links = 200 (no 404)
- [ ] (Si hubo migración) logs muestran `Successfully applied N migrations`
