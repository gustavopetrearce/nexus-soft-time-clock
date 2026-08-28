# Iteración 11 — Reportes, dashboards y monitoreo en tiempo real

**Objetivo:** materializar el **lado de lectura (CQRS)** — dashboards, exportación de reportes y tiempo real.

## Reporting (BC-11) — `backend/modules/reporting/`
- **Dashboard** (`dashboard:read`): `GET /api/v1/dashboard/summary` → KPIs del tenant (asistencias/rechazos hoy, incidencias abiertas, usuarios activos, centros activos) vía consultas de lectura (`JdbcTemplate`).
- **Reportes** (`report:export`): `GET /api/v1/reports/attendance?from&to&status&format` → descarga el reporte de asistencia con filtros en **CSV** (nativo), **Excel** (Apache POI) o **PDF** (OpenPDF). Datos obtenidos con `ST_Y/ST_X` para lat/lng.
- Columnas centralizadas (`ReportColumns`, DRY) reutilizadas por los tres exportadores.
- **Agregados en JSON** (`report:export`), añadidos después de esta iteración y que el cliente filtra/ordena/exporta:
  - `GET /api/v1/reports/attendance-summary?from&to` → una fila por colaborador: días esperados/asistidos, incidencias, horas trabajadas y extra, y el centro donde acumuló **más horas**.
  - `GET /api/v1/reports/attendance-records?from&to&status` → una fila por marcación.
  - `GET /api/v1/reports/attendance-events?from&to` → una fila por evento, con evidencia y datos de GPS.
  - `GET /api/v1/reports/hours-by-site?from&to` → **desglose de horas por centro**: un colaborador aparece tantas veces como sedes en las que trabajó. Responde a dónde se trabajaron las horas cuando `CAMBIO_SITIO` parte la jornada entre varios centros.
- La unidad de cálculo de horas es la **jornada**, no el día natural, y dentro de ella el **tramo** por centro. Ambos agregados salen de los mismos CTEs (`JourneySegmentsSql`), así que la suma del desglose cuadra con el total del resumen. Detalle y decisiones en [el caso de uso de dos turnos](../iteracion-08-registro-asistencia/02-caso-de-uso-dos-turnos.md).

## Realtime (BC-13) — `backend/modules/realtime/`
- **WebSocket STOMP** (ADR-011): endpoint `/ws` (SockJS), broker `/topic`.
- `RealtimeAttendanceListener` consume `AttendanceRegistered`/`AttendanceRejected` del bus in-process y los **proyecta** a `/topic/tenant/{id}/attendance` → mapa/dashboard en vivo (RF-25).

## Web (Angular)
- `features/admin/dashboard` — `DashboardService` + `MetricsDashboardComponent` (tarjetas KPI) en `/admin/dashboard`. Base para gráficas (ngx-echarts) y mapa (Leaflet + WebSocket).

## Estado de verificación

| Qué | Cómo | Resultado |
|---|---|---|
| **Backend compila** | `mvn compile` (15 módulos, POI+OpenPDF, release 17) | ✅ exit 0 |
| **Exportador CSV** | `mvn test` reporting | ✅ pasa |
| **Portal Angular** | `npm run build` | ✅ exit 0 (`metrics-dashboard-component`) |
| Runtime E2E (export real, WebSocket) | stack + JDK 21 + Docker | ⚠️ no ejecutado |

## Criterios de aceptación
- [x] Dashboard con KPIs del tenant (read-model CQRS).
- [x] Exportación de reportes en CSV, Excel y PDF con filtros (rango, estado).
- [x] WebSocket STOMP con proyección de eventos de asistencia por tenant.
- [x] Componente de dashboard Angular compilando.
- [x] Prueba del exportador CSV — pasa.
- [ ] Verificación E2E en runtime; gráficas (echarts) y mapa (Leaflet) sobre la base creada.

> Siguiente: **Iteración 12 — Notificaciones, integraciones y optimización** (push/email, Transactional Outbox para eventos asíncronos fiables, caché Redis).
