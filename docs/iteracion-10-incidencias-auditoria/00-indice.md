# Iteración 10 — Incidencias, auditoría y reglas de negocio

**Objetivo:** cerrar el bucle **event-driven** que dejó preparado la arquitectura: los eventos de dominio ya publicados (`AttendanceRegistered/Rejected`, `UserLoggedIn`, `UserLockedOut`) ahora son **consumidos** para generar auditoría e incidencias, sin acoplar a los emisores.

## Audit (BC-10) — `backend/modules/audit/`
- `AuditEventListener` escucha **la interfaz `DomainEvent`** → recibe *todos* los eventos de cualquier BC sin depender de ellos.
- `AuditRecorder` convierte cada evento en una entrada **inmutable** (append-only): acción = tipo de evento, tenant, actor (del contexto de seguridad si aplica), y el evento serializado en `new_values` (jsonb). Persistido con `EntityManager.persist` (INSERT garantizado; la tabla bloquea UPDATE/DELETE por trigger, RN-61).
- `GET /api/v1/audit` (`audit:read`) — consulta paginada de la bitácora del tenant (RF-12).

## Incidents (BC-09) — `backend/modules/incidents/`
- `IncidentEventListener` implementa tres **reglas de negocio automatizadas** (RF-09):
  - `AttendanceRejected` → incidencia `REGISTRO_RECHAZADO` (prioridad `MEDIUM`).
  - `AttendanceRegistered` con ENTRADA y retardo → incidencia `RETARDO` (RN-16, prioridad `LOW`). El registro sigue aceptado.
  - `AttendanceRegistered` marcado fuera de la ventana del turno → incidencia `FUERA_DE_VENTANA` (RN-15, prioridad `LOW`, migración **V24**). La ventana solo rechaza la ENTRADA, así que una SALIDA tardía se acepta y cierra la jornada; esta incidencia es la señal que le queda al supervisor. Es excluyente con `RETARDO`, que exige estar *dentro* de la ventana.
- `IncidentService`: listado filtrable por estado y **resolución** (aprobar/rechazar/resolver) con transición de estado validada (solo desde `OPEN`) y registro del resolutor + fecha.
- `GET /api/v1/incidents?status=` y `PATCH /api/v1/incidents/{id}/resolve` (`incident:approve`).

## Flujo event-driven resultante

```
Registro de asistencia rechazado
   └─(evento AttendanceRejected)─┬─► Audit  → bitácora inmutable
                                 └─► Incidents → incidencia OPEN para RR.HH.
Login / bloqueo de cuenta
   └─(UserLoggedIn / UserLockedOut)─► Audit → bitácora
```

## Estado de verificación

| Qué | Cómo | Resultado |
|---|---|---|
| **Backend compila** | `mvn compile` (13 módulos, release 17) | ✅ exit 0 |
| **Resolución de incidencias** | `mvn test` incidents (aprobar OPEN→APPROVED; alta desde rechazo) | ✅ **2/2 pasan** |
| Runtime E2E (eventos → audit/incidencias) | stack + JDK 21 + Docker | ⚠️ no ejecutado |

## Criterios de aceptación
- [x] Auditoría alimentada por eventos (escucha genérica de `DomainEvent`), inmutable.
- [x] Consulta paginada de la bitácora (`audit:read`).
- [x] Incidencia automática ante registro rechazado (regla de negocio event-driven).
- [x] Listado y resolución de incidencias con transición validada (`incident:approve`).
- [x] Pruebas de la resolución/creación de incidencias — pasan.
- [ ] Verificación E2E en runtime (pendiente JDK 21 + Docker).

> Nota: los listeners son síncronos (`@EventListener`) en esta iteración; el camino de producción con **Transactional Outbox** (ADR-005) para entrega asíncrona fiable se aborda en la optimización (Iteración 12).

> Siguiente: **Iteración 11 — Reportes, dashboards y monitoreo en tiempo real** (read-models/CQRS, export Excel/PDF/CSV, WebSocket + mapa).
