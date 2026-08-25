# ADR-004 — Offline-first e idempotencia por UUID de operación

**Estado:** Aceptado · **Fecha:** 2026-07-21

## Contexto
La app debe operar sin conexión sin perder registros (RF-21, RNF-10) y evitar duplicados/replay al reenviar (RN-26, RN-51).

## Decisión
Cada operación de registro se crea en el cliente con un **UUID v4** persistido localmente (Drift) **antes** de intentar enviarse. El UUID viaja como **`Idempotency-Key`**. El backend mantiene un **registro de idempotencia** (Redis + tabla) por UUID: si llega un UUID ya procesado, **devuelve el resultado previo** sin duplicar. ~~El `nonce` del QR se marca como consumido para prevenir replay.~~[^v22] La sincronización usa **reintentos con backoff exponencial** y un límite antes de marcar error.

[^v22]: **Addendum 2026-08-25.** El consumo de nonce se retiró en la migración **V22** (ver addendum de [ADR-006](ADR-006-qr-firmado.md)). El QR de centro lleva un nonce fijo durante toda su vigencia y debe servir para todos los eventos de la jornada y para todos los turnos del día, así que consumirlo equivalía a «un solo registro por persona y día». El anti-replay queda en la idempotencia por `operation_uuid` descrita aquí, más la secuencia coherente (RN-12), la geocerca, el antifraude y el device binding.

## Consecuencias
- ➕ Cero pérdida de registros; reenvíos seguros.
- ➕ Anti-replay y anti-duplicado unificados por diseño.
- ➕ Base clara para resolución de conflictos (servidor autoritativo, RN-53).
- ➖ Requiere almacenar claves de idempotencia con TTL adecuado (memoria/tabla) y limpiar por retención.
- ➖ El cliente debe gestionar estados (`pendiente/sincronizado/rechazado`) y la cola FIFO.
