# Iteración 10 — Incidencias, auditoría y reglas de negocio

**Objetivo:** cerrar el bucle **event-driven** que dejó preparado la arquitectura: los eventos de dominio ya publicados (`AttendanceRegistered/Rejected`, `UserLoggedIn`, `UserLockedOut`) ahora son **consumidos** para generar auditoría e incidencias, sin acoplar a los emisores.

## Audit (BC-10) — `backend/modules/audit/`

La bitácora se alimenta por **dos vías complementarias**, porque una sola no cubre RN-43 («toda acción que crea/modifica/elimina datos genera auditoría»):

**1. Eventos de dominio** — `AuditEventListener` escucha **la interfaz `DomainEvent`** → recibe *todos* los eventos de cualquier BC sin depender de ellos. `AuditRecorder` los convierte en una entrada inmutable con el evento serializado en `new_values`. Narra hechos de negocio con su semántica (una marcación rechazada y su motivo), pero solo dos módulos publican eventos: asistencia e identidad.

**2. Cambios de entidad** — `EntityChangeAuditInterceptor` se engancha al flush de Hibernate y registra cada INSERT/UPDATE/DELETE con sus **valores anteriores y nuevos** (RN-60). Cubre el CRUD administrativo entero —empresas, usuarios, roles, centros, geocercas, QR, horarios, políticas, vacaciones, dispositivos— sin sembrar de llamadas los catorce módulos, y es el único punto donde el estado *previo* sigue disponible. Los cambios se acumulan por hilo y se vuelcan en `beforeCommit`: dentro de la transacción de negocio (si se deshace, su rastro también) pero fuera del flush que los generó.

- Quedan **fuera** del interceptor la propia bitácora (sería un bucle), el outbox y las claves de idempotencia (fontanería), los refresh tokens (rotan en cada renovación; el login ya se audita) y las marcaciones y notificaciones (ya tienen su entrada por evento).
- Tampoco se audita un cambio que **solo** mueve marcas automáticas (`lastSeenAt`, `updatedAt`…):
  cada marcación actualiza el «visto por última vez» del dispositivo, y eso llenaba la bitácora de
  entradas vacías —148 de 230 filas en una pasada de los ITs—. Aprobar o revocar ese mismo
  dispositivo toca otros campos y sí queda registrado.
- Los secretos se registran como cambiados, nunca su valor: `passwordHash` y compañía viajan enmascarados. La comparación se hace sobre el valor real —enmascarar antes de comparar volvía **invisible** un cambio de contraseña—.

### Qué guarda cada entrada (RN-60)
Usuario, correo, fecha/hora, IP, user-agent, dispositivo, acción, recurso y los valores antes/después. El autor sale de `AuditContext`, un portador por hilo que llena `AuditContextFilter` desde el JWT y los datos de la petición, hermano de `TenantContext`.

> **El actor era nulo en todas las entradas.** Desde que la V12 introdujo el Outbox, los eventos no se publican en la transacción de negocio sino en el hilo del relay (`@Scheduled`), donde no hay `SecurityContext` del que deducir quién actuó. La migración **V26** añade el autor a `outbox_events`: se captura al escribir la fila —dentro de la petición, el único momento en que se sabe— y el relay lo repone antes de entregar el evento.

- `GET /api/v1/audit` (`audit:read`) — consulta paginada de la bitácora del tenant (RF-12), con actor, origen y valores antes/después.

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
| **Backend compila** | `mvn compile` (18 módulos, JDK 21) | ✅ exit 0 |
| **Resolución de incidencias** | `mvn test` incidents (aprobar OPEN→APPROVED; alta desde rechazo) | ✅ **2/2 pasan** |
| **Autor en la bitácora** | `mvn test` audit + platform (`AuditRecorderTest`, `OutboxProcessorTest`) | ✅ pasan |
| **Auditoría del CRUD** | `mvn test` audit (`EntityChangeAuditInterceptorTest`: alta, cambio, baja, exclusiones, enmascarado, marcas de rastro) | ✅ **10/10 pasan** |
| **Contra PostGIS real** | `mvn verify` con los ITs apuntados a un PostGIS desechable (`-Dit.datasource.url`) | ✅ 52 ITs verdes; la bitácora queda con 82 entradas: altas de QR, dispositivos, horarios, turnos, asignaciones e incidencias, más los eventos de asistencia |
| **Inmutabilidad (RN-61)** | `UPDATE`/`DELETE` a mano sobre `audit_logs` | ✅ ambos rechazados por el trigger `fn_block_mutation` |
| Runtime E2E (eventos → audit/incidencias) | stack + JDK 21 + Docker | ⚠️ no ejecutado |

## Criterios de aceptación
- [x] Auditoría alimentada por eventos (escucha genérica de `DomainEvent`), inmutable.
- [x] Auditoría de toda escritura de negocio con valores anteriores y nuevos (RN-43, RN-60).
- [x] Autor, IP, navegador y dispositivo en cada entrada, también en los eventos que publica el relay.
- [x] Consulta paginada de la bitácora (`audit:read`).
- [x] Incidencia automática ante registro rechazado (regla de negocio event-driven).
- [x] Listado y resolución de incidencias con transición validada (`incident:approve`).
- [x] Pruebas de la resolución/creación de incidencias — pasan.
- [ ] Verificación E2E en runtime (pendiente JDK 21 + Docker).

> Nota: los listeners son síncronos (`@EventListener`) en esta iteración; el camino de producción con **Transactional Outbox** (ADR-005) para entrega asíncrona fiable se aborda en la optimización (Iteración 12).

> Siguiente: **Iteración 11 — Reportes, dashboards y monitoreo en tiempo real** (read-models/CQRS, export Excel/PDF/CSV, WebSocket + mapa).
