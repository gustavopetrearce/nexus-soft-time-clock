# Architecture Decision Records (ADR)

Registro de decisiones arquitectónicas significativas (formato Michael Nygard). Estado: `Propuesto` · `Aceptado` · `Reemplazado` · `Obsoleto`.

| ADR | Título | Estado |
|---|---|---|
| [ADR-001](ADR-001-modular-monolith-hexagonal.md) | Modular Monolith + Arquitectura Hexagonal | Aceptado |
| [ADR-002](ADR-002-multitenancy.md) | Multi-tenant por columna `tenant_id` | Aceptado |
| [ADR-003](ADR-003-server-time.md) | Hora del servidor como autoridad temporal | Aceptado |
| [ADR-004](ADR-004-offline-idempotencia.md) | Offline-first e idempotencia por UUID | Aceptado |
| [ADR-005](ADR-005-event-driven-cqrs.md) | Event-Driven + CQRS + Transactional Outbox | Aceptado |
| [ADR-006](ADR-006-qr-firmado.md) | QR de centro firmado con nonce y vigencia | Aceptado |
| [ADR-007](ADR-007-jwt-refresh.md) | JWT access + refresh token rotatorio | Aceptado |
| [ADR-008](ADR-008-minio-evidencias.md) | MinIO (S3) para evidencias | Aceptado |
| [ADR-009](ADR-009-postgis.md) | PostgreSQL + PostGIS para geoespacial | Aceptado |
| [ADR-010](ADR-010-redis.md) | Redis para caché, rate limiting y anti-replay | Aceptado |
| [ADR-011](ADR-011-websocket-realtime.md) | WebSocket (STOMP) para tiempo real | Aceptado |
| [ADR-012](ADR-012-capacidad-tenant.md) | Capacidad de colaboradores activos por tenant (cupo + bloques) | Aceptado |
