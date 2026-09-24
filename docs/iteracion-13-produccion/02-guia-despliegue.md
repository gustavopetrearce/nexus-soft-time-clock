# 02 — Guía de despliegue

## Variables de entorno (backend)

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DB_URL` / `DB_USER` / `DB_PASSWORD` | Conexión PostgreSQL/PostGIS | `jdbc:postgresql://db:5432/nexus` |
| `REDIS_HOST` / `REDIS_PORT` | Redis | `redis` / `6379` |
| `MAIL_HOST` / `MAIL_PORT` | SMTP | `smtp:587` |
| `SPRING_PROFILES_ACTIVE` | Perfil | `prod` |
| `SECURITY_QR_SECRET` | Secreto HMAC del QR (¡rotar!) | (secreto fuerte) |
| `SECURITY_JWT_ACCESS_TTL_SECONDS` | TTL access token | `900` |
| `SECURITY_JWT_REFRESH_TTL_DAYS` | TTL refresh token | `30` |
| `NEXUS_SEED_PASSWORD` | (solo dev) contraseña semilla | — |

> En producción, la llave de firma JWT debe provenir de un **keystore/secreto persistente** (no la generada en memoria del perfil dev) — ver [ADR-007](../iteracion-02-arquitectura/adr/ADR-007-jwt-refresh.md).

## Docker Compose (entorno único / demos)
```bash
docker compose -f infra/docker-compose.yml up -d --build
```
Imágenes: `infra/backend.Dockerfile` (multi-stage, JRE 21), `infra/web.Dockerfile` (Angular → NGINX).

## Kubernetes (producción)
Topología en [`docs/iteracion-02-arquitectura/08-despliegue.md`](../iteracion-02-arquitectura/08-despliegue.md). Puntos clave:
- Backend **stateless** → `Deployment` + **HPA** (CPU/memoria/req).
- PostgreSQL, Redis y MinIO como servicios **gestionados/HA** fuera del Deployment.
- **Ingress NGINX + cert-manager** (TLS/HTTPS obligatorio).
- Config/secretos vía **ConfigMap/Secret** (o Vault).
- Probes `liveness`/`readiness`/`startup` (Spring Actuator).
- Flyway como job/initContainer de arranque; migraciones **compatibles hacia atrás** (expand/contract) para zero-downtime.
- Scheduler/Outbox coordinado con **ShedLock** en multi-réplica.

## CI/CD (GitHub Actions)
`.github/workflows/ci.yml` ejecuta, en cada push/PR:
- **backend**: `mvn verify` (unit + IT Testcontainers, cobertura JaCoCo) con JDK 21.
- **web**: `npm ci && npm run build && npm test` (headless).
- **mobile**: `flutter pub get && gen-l10n && analyze && test`.

Extensión recomendada para release: build y push de imágenes al registry, escaneo de vulnerabilidades (imagen + dependencias), y despliegue por entorno (staging → prod) con aprobación.

## Observabilidad
- Métricas: `/actuator/prometheus` → Prometheus → Grafana (dashboards). El endpoint pide HTTP
  Basic (`SECURITY_METRICS_USERNAME` / `SECURITY_METRICS_PASSWORD`) y no se publica por NGINX:
  el scrape va por la red interna. Sin contraseña configurada queda cerrado.
- Alertas básicas: latencia p95 de registro, tasa de rechazos, backlog del outbox, errores 5xx.
