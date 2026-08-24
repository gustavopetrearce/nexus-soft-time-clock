# Base de datos — Nexus Soft Time Clock

Esquema PostgreSQL + PostGIS y migraciones **Flyway** (baseline de la Iteración 3).

## Migraciones (orden Flyway)

| Versión | Archivo | Contenido |
|---|---|---|
| V1 | `extensions_and_tenancy.sql` | Extensiones (PostGIS, pgcrypto, citext, btree_gist), `fn_set_updated_at`, `companies`, `company_settings` |
| V2 | `identity_rbac.sql` | `users`, `permissions`, `roles`, `role_permissions`, `user_roles`, `devices`, `refresh_tokens`, `user_work_site_scope` |
| V3 | `organization.sql` | `work_sites` (índice GIST), `projects`, `project_work_sites` |
| V4 | `scheduling.sql` | `schedules`, `shifts`, `shift_assignments` |
| V5 | `geofencing.sql` | `geofences` (GIST), `site_qr_tokens`, `qr_nonce_consumed` (eliminada en V22) |
| V6 | `attendance.sql` | `attendance_records` (**particionada** por `server_time`), `idempotency_keys`, `fraud_flags`, `work_days` |
| V7 | `incidents.sql` | `incidents` |
| V8 | `audit_outbox_notifications.sql` | `audit_logs` (**particionada**, inmutable), `outbox_events`, `notifications` |
| V9 | `functions_and_views.sql` | `fn_distance_m`, `fn_within_geofence`, `fn_create_monthly_partition`, vistas de lectura |
| V10 | `seed_rbac_catalog.sql` | Catálogo de permisos + roles plantilla + matriz de autorización |

> En la **Iteración 4** estos scripts se enlazan al backend en `backend/bootstrap/src/main/resources/db/migration` y Flyway los ejecuta al arrancar. Aquí viven como referencia canónica del modelo.

## Verificar el esquema localmente

Requiere Docker corriendo. Levanta una instancia PostGIS efímera y aplica las migraciones en orden:

```bash
# 1) Levantar PostGIS
docker run -d --name nexus-pg-verify -e POSTGRES_PASSWORD=nexus \
  -e POSTGRES_DB=nexus -p 5433:5432 postgis/postgis:16-3.4

# 2) Aplicar migraciones en orden (V1..V10)
for f in db/migration/V*__*.sql; do
  echo ">> $f"
  docker exec -i nexus-pg-verify psql -U postgres -d nexus < "$f" || break
done

# 3) Limpiar
docker rm -f nexus-pg-verify
```

Con Flyway (una vez configurado en el backend):

```bash
./mvnw -pl bootstrap flyway:migrate
```

## Convenciones

- `snake_case`, tablas en plural. Timestamps `timestamptz` en **UTC** (RNF-19).
- Toda tabla de negocio lleva `tenant_id` (ADR-002); índices de negocio lo usan como **prefijo**.
- `created_at`/`updated_at` con trigger `fn_set_updated_at` en tablas mutables.
- Geometría como `geography(Point/Polygon, 4326)` con índices **GIST** (ADR-009).
- Tablas de gran volumen (`attendance_records`, `audit_logs`) **particionadas por mes**; un job crea particiones futuras con `fn_create_monthly_partition`.
