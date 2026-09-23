# Iteración 12 — Notificaciones, integraciones y optimización

**Objetivo:** completar las piezas de robustez y experiencia que quedaron como TODO: notificaciones, **Transactional Outbox** (entrega de eventos fiable y asíncrona) y **caché Redis**.

## Notifications (BC-12) — `backend/modules/notifications/`
- `NotificationEventListener` consume `AttendanceRejected` → `NotificationService.notifyRejectedAttendance` crea una notificación **PUSH** (persistida) y la envía.
- `LoggingPushSender` (adaptador de desarrollo) → en producción se sustituye por **Firebase Cloud Messaging** (resuelve `push_token` del dispositivo). Canal `EMAIL` disponible vía Spring Mail (bootstrap).
- `GET /api/v1/notifications/me` — notificaciones del usuario autenticado (RF-27).

## Transactional Outbox (ADR-005) — `backend/platform/outbox/`
Reemplaza la publicación **síncrona** de eventos por una **fiable y asíncrona**:
- `OutboxWriter` escribe el evento (clase + payload JSON) en `outbox_events` **dentro de la misma transacción** de negocio → evita el "dual write".
- `OutboxRelay` (`@Scheduled`) lee los pendientes y, por cada uno, `OutboxProcessor.processOne` (**REQUIRES_NEW**, aislamiento por evento) lo deserializa a su tipo concreto y lo **republica** al bus interno tras el commit.
- Los publicadores de **identity** y **attendance** ahora delegan en `OutboxWriter` en lugar de publicar directo. Los consumidores (audit, incidents, realtime, notifications) reciben los eventos vía el relay → ya **no** corren dentro de la transacción de negocio.
- Migración **V12** añade `event_class` a `outbox_events` (para deserializar).
- Migración **V26** añade el **autor** (usuario, correo, IP, user-agent, dispositivo). El relay publica en un hilo del scheduler, sin petición detrás: sin esto la auditoría no sabía quién había provocado el evento y registraba actor nulo (RN-60). El autor se captura al escribir la fila y se repone antes de publicar, junto con el tenant.

## Optimización — Caché Redis
- `@Cacheable("dashboardSummary")` sobre `DashboardService.summary` (TTL 60s, `spring.cache.type=redis`) → alivia las consultas del dashboard (RNF-01). `DashboardSummary` es `Serializable`.

## Estado de verificación

| Qué | Cómo | Resultado |
|---|---|---|
| **Backend compila** | `mvn compile` (16 módulos, release 17) | ✅ exit 0 |
| **Notificaciones** | `mvn test` notifications (push + persistencia SENT) | ✅ pasa |
| Runtime E2E (outbox relay, Redis, push) | stack + JDK 21 + Docker | ⚠️ no ejecutado |

> **Nota de honestidad sobre el Outbox:** el relay deserializa el evento a su tipo concreto con Jackson (requiere que el compilador emita `-parameters`, que el `spring-boot-starter-parent` activa por defecto). Esto **no está verificado en runtime**; conviene una prueba de integración con Testcontainers al disponer de Docker + JDK 21. La entrega es **at-least-once**: los consumidores deben ser idempotentes (hardening pendiente: dead-letter tras N intentos ya contemplado con `status='FAILED'`).

## Criterios de aceptación
- [x] Notificación automática (push) ante registro rechazado, persistida.
- [x] Consulta de notificaciones propias.
- [x] Transactional Outbox: escritura en la tx de negocio + relay asíncrono con aislamiento por evento.
- [x] Publicadores de eventos migrados al outbox (entrega desacoplada de la tx).
- [x] Caché Redis en el dashboard.
- [x] Prueba de notificaciones — pasa.
- [ ] Verificación E2E del relay/Redis en runtime (pendiente Docker + JDK 21).

> Siguiente: **Iteración 13 — Pruebas, documentación y preparación para producción** (Testcontainers de integración, C4/UML consolidados, endurecimiento y CI/CD final).
