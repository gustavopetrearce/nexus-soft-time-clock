# Iteración 7 — Horarios, turnos y geocercas

**Objetivo:** completar la **configuración** necesaria para el registro de asistencia: horarios/turnos con tolerancias, geocercas por centro y el **QR firmado** con rotación (ADR-006).

## Scheduling (BC-04) — `backend/modules/scheduling/`
`schedule:manage`. Un solo controlador expone:
- Horarios: `POST/GET /api/v1/schedules`, `GET/PUT /{id}`
- Turnos: `POST/GET /api/v1/schedules/{id}/shifts`, `PUT /api/v1/shifts/{id}` — con `startTime/endTime`, `crossesMidnight`, tolerancias (retardo/anticipo) y ventana de registro (RN-15, RN-16)
- Asignaciones: `POST /api/v1/shift-assignments`, `GET ?userId=`

## Geofencing (BC-05) — `backend/modules/geofencing/`
`geofence:manage`. Base `/api/v1/work-sites/{workSiteId}`:
- `PUT/GET /geofence` — geocerca **circular** (centro PostGIS + radio), upsert de la geocerca activa (RN-13)
- `POST /qr` — genera/rota el **QR firmado** (HMAC-SHA256, `body = tenant|site|nonce|exp`), desactiva el QR previo y devuelve `{token, expiresAt}` (ADR-006, RN-25)
- `verifyQr(token)` (uso interno, lo consume el registro de asistencia en la It. 8): valida firma y vigencia. El `nonce` **no se consume** (V22, addendum de ADR-006): el mismo QR debe servir para todos los eventos de la jornada y para todos los turnos del día, y queda como traza en `attendance_records.qr_nonce`. Un token caducado se distingue del alterado por el código `QR_EXPIRED`, aunque ambos acaben en el mismo rechazo.

## Estado de verificación

| Qué | Cómo | Resultado |
|---|---|---|
| **Backend compila** | `mvn compile` (reactor completo, release 17) | ✅ exit 0 |
| **Firmador de QR** | `mvn test` geofencing (round-trip, manipulación, secreto distinto, basura) | ✅ **4/4 pasan** |
| Runtime E2E | stack + JDK 21 + Docker | ⚠️ no ejecutado |

> El compile-check atrapó un bug real: un adaptador implementaba dos puertos con un método de igual firma y distinto retorno (`findByIdAndTenant`) — se separó en dos adaptadores.

## Criterios de aceptación
- [x] CRUD de horarios y turnos con tolerancias/ventanas, tenant-scoped.
- [x] Asignación de turnos a colaboradores con vigencia.
- [x] Geocerca circular por centro (PostGIS) con upsert.
- [x] QR firmado con nonce+vigencia, generación/rotación y verificación (probada).
- [x] RBAC por permiso, validación, errores uniformes.
- [ ] Verificación E2E en runtime (pendiente JDK 21 + Docker).

> Con esto queda toda la configuración lista para la **Iteración 8 — Registro de asistencia** (núcleo: QR + GPS + geocerca + validaciones + antifraude).
