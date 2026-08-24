# Iteración 3 — Modelo de dominio y base de datos

**Objetivo:** materializar el análisis (It. 1) y la arquitectura (It. 2) en un **modelo de dominio** por bounded context y un **esquema relacional PostgreSQL/PostGIS** normalizado, con **migraciones Flyway** ejecutables, índices, restricciones, vistas, funciones, triggers y estrategia de particionamiento.

**Entregables**

| Doc / Artefacto | Ubicación |
|---|---|
| [01 — Modelo de dominio](01-modelo-dominio.md) | Agregados, entidades, VOs e invariantes por BC |
| [02 — DER (diagrama entidad-relación)](02-der.md) | ER completo en Mermaid |
| [03 — Diccionario de datos](03-diccionario-datos.md) | Tablas y columnas principales |
| [04 — Índices y particionamiento](04-indices-particionamiento.md) | Estrategia de rendimiento a escala |
| **Migraciones Flyway (SQL)** | [`db/migration/V1..V10`](../../db/migration/) |
| **Guía de BD** | [`db/README.md`](../../db/README.md) |

**Criterios de aceptación**

- [ ] Cada bounded context tiene su modelo de dominio (agregados + invariantes) y sus tablas.
- [ ] Esquema normalizado (3FN) con integridad referencial y restricciones de dominio (CHECK).
- [ ] Soporte geoespacial (PostGIS, GIST) para geocercas y ubicaciones.
- [ ] Particionamiento de tablas de alto volumen (`attendance_records`, `audit_logs`).
- [ ] Idempotencia modelada (`idempotency_keys`); el nonce del QR queda como traza en `attendance_records.qr_nonce` (RN-26).
- [ ] Auditoría inmutable (append-only) y outbox para event-driven.
- [ ] Migraciones Flyway versionadas y coherentes; catálogo RBAC sembrado.
- [ ] Verificación de ejecución del SQL (pendiente: requiere Docker/PostGIS activo).

> Estado de verificación: revisión estática completa. La ejecución contra PostGIS quedó pendiente por falta de Docker activo en el entorno; ver `db/README.md` para reproducirla.
