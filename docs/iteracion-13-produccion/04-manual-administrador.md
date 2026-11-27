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

**Descansos por turno** (V38): si la empresa usa tipos de descanso (almuerzo, comida…), en cada turno puede activarse **Limitar los descansos de este turno** y marcar los permitidos; sin ninguno marcado, el turno no admite descansos. Ejemplo: nocturno sin descansos, matutino almuerzo y comida, vespertino solo comida. Manda el turno de la entrada que abrió la jornada; sin turno asignado se admiten todos. Además, **cada tipo de descanso se usa una vez por día** (el día de la entrada, aunque el colaborador salga y vuelva a entrar): un segundo almuerzo se rechaza con *descanso ya usado hoy* y uno que el turno no admite con *descanso no permitido en el turno*. La secuencia sigue igual: entrada → inicio/fin de descanso → … → salida. API: `breaksRestricted` y `allowedBreakTypeIds` en `/schedules/{id}/shifts`; la app consulta `GET /api/v1/attendance/me/break-options`.

### Incidencias
`/api/v1/incidents` → revisar incidencias (retardos, rechazos), **aprobar/rechazar** con comentario. Las incidencias por registro rechazado se crean automáticamente.

### Vacaciones
Portal **Vacaciones** (`vacation:approve`) y app (**Aprobar vacaciones**): la bandeja muestra las pendientes; **Aprobar** o **Rechazar** (rechazada = *negativa de la empresa*). El colaborador puede pedir **cancelar** una solicitud pendiente o una aprobada que aún no empieza, con motivo obligatorio; el filtro **Con cancelación solicitada** (pestaña *Cancelaciones* en la app) las reúne:
- Pendiente con cancelación pedida: **Aprobar**, **Rechazar** o **Aceptar cancelación**. Aprobar o rechazar deniega la cancelación.
- Aprobada con cancelación pedida: **Aceptar cancelación** (los días se liberan) o **Denegar cancelación** (sigue aprobada).

*Cancelada* significa siempre «a petición del colaborador». API: `PATCH /api/v1/vacations/requests/{id}/resolve`, `PATCH /vacations/requests/{id}/cancellation/resolve`, `GET /vacations/requests?cancellation=PENDING`, `POST /api/v1/me/vacations/{id}/cancellation` (colaborador).

### Permisos (entradas tarde, salidas temprano, faltas)
Portal **Permisos** (`permit:manage`: administrador, RR. HH., supervisor) → **Registrar permiso** para un colaborador: tipo (entrada tarde / salida temprano con la hora autorizada, o falta con rango de fechas), motivo (personal, incapacidad, cita médica, asunto familiar, trámite, otro) y observaciones. El permiso **queda aprobado** al registrarlo; no puede haber dos del mismo tipo traslapados. **Cancelar permiso** es definitivo.

**Solicitudes de incapacidad del colaborador**: desde la app el colaborador solicita una incapacidad (falta con motivo *incapacidad*) con observaciones obligatorias; llega a la bandeja como **Pendiente** («Solicitado por el colaborador»). Quien tiene `permit:manage` la **aprueba** (queda como otorgante) o la **rechaza**, con nota opcional. Pendientes y rechazadas no justifican faltas, no admiten goce ni cancelación; el filtro de estatus *Pendiente* muestra las que faltan por resolver.

**Goce de sueldo** (`permit:pay`, solo **RR. HH.**): al registrar o después, sobre cualquier permiso aprobado —también los que aprobó un supervisor— RR. HH. decide *con goce* o *sin goce* (con nota); mientras no lo haga queda *pendiente de revisión*. La bandeja filtra por goce para encontrar los pendientes.

Efecto en el reporte de asistencia: una falta en un día cubierto por un permiso de falta cuenta como **justificada**, y un retardo en un día con permiso de entrada tarde **no cuenta**. Las incidencias no se modifican.

**Reporte de incapacidades** (Permisos → Incapacidades): faltas con motivo *incapacidad* en el periodo, con goce (con/sin/pendiente), periodo, días, estatus (pendiente/aprobado/rechazado/cancelado y vigencia: próxima, en curso, concluida) y la columna **Motivo (observaciones)** con el motivo exacto; totales y exportación Excel/PDF/CSV. API: `GET/POST /api/v1/permits`, `PATCH /permits/{id}/resolve`, `PATCH /permits/{id}/cancel`, `PATCH /permits/{id}/pay`, `GET /permits/incapacities`, `POST /api/v1/me/permits/incapacity` (colaborador).

### Sanciones
Portal **Sanciones** (`sanction:manage`: administrador, RR. HH., supervisor) → **Abrir sanción** a un colaborador: tipo (amonestación verbal, amonestación por escrito, acta administrativa o **suspensión** con fecha de inicio y días), motivo (retardos, falta injustificada, mala conducta, incumplimiento de políticas, negligencia, otro), fecha de los hechos y **descripción obligatoria**. Nace **vigente**; **Anular** exige motivo y es definitivo. Filtros por tipo, motivo, estado y fechas; exportación Excel/PDF/CSV. El colaborador ve sus sanciones en la app (solo lectura). Por ahora la suspensión no reclasifica el reporte de asistencia. API: `GET/POST /api/v1/sanctions`, `GET /sanctions/report`, `PATCH /sanctions/{id}/void`, `GET /api/v1/me/sanctions`.

### Dashboards y tiempo real
`/admin/dashboard` → KPIs (asistencias/rechazos del día, incidencias abiertas, usuarios/centros activos). El canal WebSocket (`/ws`, tópico `/topic/tenant/{id}/attendance`) alimenta el mapa/monitor en vivo.

### Reportes
`GET /api/v1/reports/attendance?from&to&status&format=csv|xlsx|pdf` → exportar asistencia con filtros.

### Auditoría
`GET /api/v1/audit` → bitácora inmutable de acciones y eventos (quién, cuándo, qué).

## Documentación de la API
Swagger UI: `/swagger-ui.html`. Todas las operaciones están versionadas bajo `/api/v1` y protegidas por RBAC (permiso por operación).
