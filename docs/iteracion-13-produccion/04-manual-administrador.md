# 04 — Manual del administrador

Portal web **Nexus Soft Time Clock** para supervisores y administradores.

## Roles
| Rol | Puede |
|---|---|
| SUPER_ADMIN | Gestionar empresas (tenants) de la plataforma y su cupo de colaboradores activos |
| COMPANY_ADMIN | Usuarios, roles, centros, proyectos, horarios, geocercas de su empresa |
| HR_ADMIN | Horarios, incidencias, reportes |
| SUPERVISOR | Monitoreo, incidencias y reportes de su ámbito |
| AUDITOR | Consulta de la bitácora de auditoría |

## Tareas frecuentes

### Empresas (SUPER_ADMIN)
`/admin/companies` → crear/editar empresas, activar/suspender. Cada alta crea su configuración por defecto.

### Cupo de colaboradores activos (SUPER_ADMIN)
Cada empresa tiene un **cupo de colaboradores activos**: **150** de base, ampliable en **bloques completos de 50** (acumulativos — límite = `150 + 50 × bloques`; el colaborador 151 exige el primer bloque).
- Solo SUPER_ADMIN (permiso `company:capacity`) cambia los bloques, y el cambio queda auditado.
- Del tenant se ve **solo el agregado**: límite, bloques, usados y disponibles — nunca el padrón de colaboradores.
- **Colaborador activo** = cuenta habilitada para registrar accesos (rol con `attendance:register`) que no esté dada de baja, con independencia de su frecuencia de uso. Las cuentas de portal (admin, RR.HH., supervisión, auditoría) no consumen cupo.
- La **baja** (`status=INACTIVE`) libera cupo de inmediato, cierra las sesiones del colaborador y **no borra** su historia de asistencia.
- No se puede reducir bloques por debajo del uso actual: primero hay que dar de baja colaboradores.

En el portal: `/admin/companies` muestra la columna **Cupo** (`usados/límite`, con el número de bloques si tiene) y el botón ‹grupos› de cada fila abre el diálogo de cupo, donde se suben o bajan bloques y se ve el límite resultante antes de guardar. La columna y el botón solo aparecen con `company:capacity`.

En `/admin/users`, el COMPANY_ADMIN ve el cupo de su empresa como chip junto a «Nuevo usuario»; al agotarse aparece un aviso y los rechazos por límite se muestran con el mensaje del backend (límite, usados, disponibles).

API: `GET|PUT /api/v1/companies/{id}/capacity` (el PUT recibe `{ "extraBlocks": n }` y fija el **total** de bloques, no un incremento: un reintento tras un timeout no vende un bloque de más), `GET /api/v1/companies/capacities?ids=…` para toda una página del listado y `GET /api/v1/companies/me/capacity` en modo lectura para el tenant.

### Usuarios y roles
`API /api/v1/users` → alta de colaboradores con roles; cambio de estado; asignación de roles.
`GET /api/v1/roles` → roles disponibles.
Si la empresa agotó su cupo (ver arriba), el alta, la reactivación y la asignación de un rol que registra asistencia se rechazan con `CAPACITY_EXCEEDED` (HTTP 409) indicando límite, usados y disponibles; el COMPANY_ADMIN consulta esos números en modo lectura y pide la ampliación al super administrador.

### Centros de trabajo y geocercas
1. Crear el **centro** con su ubicación (lat/lng) — `POST /api/v1/work-sites`.
2. Definir la **geocerca** circular (centro + radio) — `PUT /api/v1/work-sites/{id}/geofence`.
3. Generar/rotar el **QR** del centro — `POST /api/v1/work-sites/{id}/qr` (devuelve el token a imprimir/mostrar).

### Horarios y turnos
`/api/v1/schedules` y `/schedules/{id}/shifts` → definir turnos con tolerancias y ventanas de registro; asignar turnos a colaboradores (`/shift-assignments`).

### Incidencias
`/api/v1/incidents` → revisar incidencias (retardos, rechazos), **aprobar/rechazar** con comentario. Las incidencias por registro rechazado se crean automáticamente.

### Dashboards y tiempo real
`/admin/dashboard` → KPIs (asistencias/rechazos del día, incidencias abiertas, usuarios/centros activos). El canal WebSocket (`/ws`, tópico `/topic/tenant/{id}/attendance`) alimenta el mapa/monitor en vivo.

### Reportes
`GET /api/v1/reports/attendance?from&to&status&format=csv|xlsx|pdf` → exportar asistencia con filtros.

### Auditoría
`GET /api/v1/audit` → bitácora inmutable de acciones y eventos (quién, cuándo, qué).

## Documentación de la API
Swagger UI: `/swagger-ui.html`. Todas las operaciones están versionadas bajo `/api/v1` y protegidas por RBAC (permiso por operación).
