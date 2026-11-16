# Iteración 14 — Tipos de contrato por colaborador

## 01 · Evaluación del estado actual y propuesta

> Fecha: 2026-11-16 · Rama base: `feat/permits` (último cambio en BD: `V32__permits.sql`)

### 1. Objetivo

Identificar el **tipo de contrato** de cada colaborador. En esta primera versión hay dos tipos:

| Tipo | Código | Qué define la vigencia |
|---|---|---|
| Por proyecto | `PROJECT` | Un proyecto concreto. El contrato no puede salirse de las fechas del proyecto. |
| Por turno / horario | `SHIFT` | El periodo de empleo. Dentro de él, el colaborador tiene asignados turnos (`shift_assignments`). |

El modelo debe poder crecer después a otros tipos (indefinido, temporal, honorarios…) sin cambiar su estructura.

---

### 2. Estado actual (hallazgos)

#### 2.1 Proyectos

| Elemento | Dónde | Estado |
|---|---|---|
| Tabla `projects` (código, nombre, estado, `starts_on`, `ends_on`) | `db/migration/V3__organization.sql:36-51` | Existe. **No hay CHECK** que asegure `ends_on >= starts_on`. |
| Tabla `project_work_sites` (proyecto ↔ centro) | `V3__organization.sql:54-59` | Existe solo en la BD. **No se mapea** en Java, ni hay API ni pantalla. |
| Relación colaborador ↔ proyecto | — | **No existe.** No hay tabla, entidad ni pantalla. |
| `attendance_records.project_id` | `V6__attendance.sql:19` | Columna sin FK y sin mapear en `AttendanceRecordJpaEntity`. **Siempre es NULL.** |
| Backend | `backend/modules/organization/.../Project*.java` | CRUD sin borrado, con permiso `project:manage`. `Project.update()` no valida las fechas. |
| Web | `web/src/app/features/admin/projects/` | Lista y formulario. El formulario tampoco valida el orden de las fechas. |
| Móvil | — | No hay ninguna referencia a proyectos. |

**Conclusión:** la vigencia que hoy se captura es **la del proyecto**, no la del colaborador en el proyecto. Hoy no hay manera de asignar un colaborador a un proyecto.

#### 2.2 Horarios y asignación de turnos

- `shift_assignments` (`V4__scheduling.sql:46-57`) tiene `user_id`, `shift_id`, `work_site_id` (opcional), `valid_from` y `valid_to`. Es **la única vigencia por colaborador** que existe hoy.
- `SchedulingService.assignShift` (líneas 198-209) solo comprueba que el turno exista:
  - no evita que dos asignaciones se solapen;
  - las asignaciones no se pueden editar ni borrar.
- Resolución del turno al marcar (`attendance/.../SchedulePolicyAdapter.java:45-85`):
  - **Defecto:** si la marca trae centro, se ignoran las asignaciones con `work_site_id` NULL (línea 51). El resultado es un falso `NO_SCHEDULE` y la incidencia `SIN_TURNO`.
  - No se tiene en cuenta el estado `INACTIVE` del horario.

#### 2.3 Colaborador

- `users` (V2) y `employee_profiles` (V15) **no tienen tipo de contrato, puesto, departamento ni tipo de nómina**.
- El único dato laboral es `employee_profiles.hire_date`, que hoy solo se usa para calcular la antigüedad en vacaciones.
- La documentación de la iteración 1 no menciona contratos laborales. Todas las apariciones de "contrato" se refieren a otra cosa: el cupo contratado por la empresa (RF-29), migraciones expand/contract o contratos de eventos. Nómina está fuera de alcance (`01-objetivos-y-alcance.md:37`).

---

### 3. Impacto actual del módulo de proyectos

| Consumidor | ¿Usa proyectos hoy? | Observación |
|---|---|---|
| Registro de asistencia (`RegisterAttendanceService`) | No | No valida pertenencia, estado ni vigencia, y no guarda `project_id`. |
| Sincronización offline (`SyncAttendanceService`) | No | Delega en `register`. |
| Reloj externo (`RegisterExternalAttendanceService`) | No | Igual que el registro normal. |
| Geocercas / QR | No | Ambos dependen del centro de trabajo (`work_site_id`) o de la empresa (V25). |
| Incidencias (`IncidentEventListener`) | No | `incidents` no tiene columna de proyecto. |
| Reportes y dashboards (`AttendanceSummaryService`, `SiteHoursService`, `DashboardService`, vistas V9) | No | Agrupan por centro y turno. **CU-09 promete un filtro por proyecto que no existe.** |
| Permisos (V32), descansos (V30), notificaciones, tiempo real | No | — |
| Alcance de supervisor (RN-33) | No | `user_work_site_scope` existe, pero no se usa; no hay alcance por proyecto. |

**Veredicto:** el módulo de proyectos es hoy un **catálogo aislado**, con impacto funcional **nulo**.

- **Riesgo de activarlo: bajo.** Ningún flujo depende de proyectos, así que conectarlo no rompe nada existente.
- **Deuda:** no se cumple lo que prometen RF-23/HU-22 ("asociar la asistencia"), CU-09 (filtro por proyecto) ni la parte de proyectos de RN-33.
- **Datos actuales:** antes de añadir el CHECK de fechas hay que revisar los proyectos ya creados por si alguno tiene `ends_on < starts_on`.

---

### 4. Modelo propuesto

#### 4.1 Entidad `employment_contracts` (módulo `hr`)

Va en el módulo `hr`, junto a `EmployeeProfile` y `Permit`. **Un contrato `PROJECT` es en sí mismo la asignación del colaborador al proyecto**, así que no hace falta otra tabla de asignación.

| Columna | Tipo | Regla |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | Obligatorio (multi-tenant) |
| `user_id` | uuid | FK a `users` |
| `contract_type` | varchar | `PROJECT` \| `SHIFT` (CHECK) |
| `project_id` | uuid | FK a `projects`. **Obligatorio si es `PROJECT`, NULL si es `SHIFT`** (CHECK) |
| `work_site_id` | uuid | Opcional: centro principal |
| `starts_on` | date | Obligatorio |
| `ends_on` | date | Si tiene valor, `>= starts_on`. NULL = indefinido. En `PROJECT`, si el proyecto tiene fin, el contrato no puede ser indefinido: al registrarlo sin fin hereda el del proyecto |
| `status` | varchar | `ACTIVE` \| `ENDED` (terminado: `ends_on` recortado) \| `CANCELLED` (captura errónea; deja de contar) |
| `cancel_reason` | varchar(500) | Obligatorio al cancelar (mismo patrón que V31) |
| `notes` | varchar(500) | Opcional |
| `created_by`, `ended_by/at`, `cancelled_by/at`, `created_at`, `updated_at` | — | Trazabilidad |

Índices: `(tenant_id, user_id, starts_on)`, `(tenant_id, project_id)` y `(tenant_id, contract_type, status)`. El traslape (RN-63) lo garantiza además una restricción de exclusión `btree_gist` sobre los contratos no cancelados.

#### 4.2 Requisitos y reglas nuevos

| ID | Descripción |
|---|---|
| **RF-30** | Personal con `contract:manage` registra, edita, termina y cancela contratos de un colaborador, y consulta su historial. |
| **RN-63** | Un colaborador tiene **como máximo un contrato `ACTIVE` vigente en cada fecha**. No se permiten solapes. |
| **RN-64** | Un contrato `PROJECT` requiere un proyecto `ACTIVE`, y su rango debe quedar **dentro** de la vigencia del proyecto. |
| **RN-65** | Si un proyecto se cierra o se acortan sus fechas, los contratos que quedan fuera se señalan "por revisar". No se modifican automáticamente. Se calcula al consultar (no hay evento), así que siempre refleja el estado actual del proyecto. |
| **RN-66** | Una marca de un colaborador con contrato `PROJECT` **se acepta**, pero abre la incidencia `FUERA_DE_VIGENCIA` si la fecha de negocio cae fuera del contrato o del proyecto, o si el proyecto no está `ACTIVE`. |
| **RN-67** | La marca guarda `project_id` del contrato `PROJECT` vigente, para poder reportar por proyecto. |

#### 4.3 Matriz de impacto de la propuesta

| Consumidor | Cambio |
|---|---|
| BD | Nueva migración V33 con:<ul><li>tabla `employment_contracts`;</li><li>CHECK de fechas en `projects`;</li><li>FK de `attendance_records.project_id`;</li><li>permiso `contract:manage`.</li></ul>V34 añade el tipo de incidencia `FUERA_DE_VIGENCIA`. |
| `hr` | Dominio, servicio, persistencia y API REST de contratos. |
| `organization` | Validación de fechas del proyecto y evento al cerrarlo o acortarlo. |
| `attendance` | `ContractPolicyPort` y su adaptador (patrón de `SchedulePolicyAdapter`). Se guarda `project_id` y se marca la falta de vigencia en el evento. Registro, sync y reloj externo heredan el cambio porque pasan por `register`. |
| `incidents` | Nuevo tipo `FUERA_DE_VIGENCIA`. |
| `reporting` | Días esperados limitados a los contratos vigentes y a `hire_date`; filtro `projectId` (CU-09); horas por proyecto. |
| Web | Pestaña "Contratos" en la ficha del colaborador; colaboradores en el detalle del proyecto; validación de fechas. |
| Móvil | Perfil muestra el contrato y proyecto vigentes (solo lectura) e incluye el provider en el flush de logout. |

---

### 5. Plan por fases

| Fase | Alcance | Entregable |
|---|---|---|
| 0 ✅ | Esta evaluación | Este documento |
| 1 ✅ | V33, contratos en `hr`, validación de fechas de proyecto, pantallas web | CRUD de contratos funcionando (ver §7) |
| 2 ✅ | Integración con la marcación, `FUERA_DE_VIGENCIA`, corrección de `SchedulePolicyAdapter` (asignación sin centro y horario inactivo) | Marcas asociadas al proyecto, con su incidencia |
| 3 | Reportes por proyecto y días esperados por contrato; perfil en móvil | CU-09 cumplido |

**Fuera de alcance** (se anota como deuda):

- alcance de supervisor por proyecto (RN-33);
- generación automática de faltas;
- solapes y edición de `shift_assignments`;
- incidencia por **falta** de contrato (podría volverse configurable por empresa una vez cargados los datos).

### 6. Decisiones tomadas

1. El contrato es una **entidad explícita con historial**; no se deduce de las asignaciones ni es un campo del perfil.
2. Si un colaborador marca fuera de la vigencia de su contrato, **la marca se acepta y se abre una incidencia**, sin rechazarla.
3. La entrega se hace **por fases**, empezando por esta evaluación.

---

### 7. Fase 1 — lo implementado

**Base de datos — `db/migration/V33__employment_contracts.sql`**
- Tabla `employment_contracts`, con CHECK por tipo, CHECK de causa al cancelar y exclusión de traslapes.
- `ck_projects_range` en `projects`, creado `NOT VALID`: no rompe el despliegue si ya hay filas con fechas invertidas, pero aplica a todo lo nuevo y a cualquier edición.
- FK `attendance_records.project_id → projects` (`ON DELETE SET NULL`). La columna se empezará a llenar en la fase 2.
- Permiso `contract:manage` para `COMPANY_ADMIN` y `HR_ADMIN`.

**Backend — módulo `hr`**
- `ContractService` aplica RN-63/64/65; `EmploymentContract` es el dominio.
- `EmploymentContractPersistenceAdapter` lee proyectos, centros y usuarios con SQL nativo, sin dependencia de compilación entre módulos.
- `ContractController` expone:

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/api/v1/contracts` | Listado con filtros `type`, `status`, `projectId`, `userId`, `activeOn`, `search` |
| `GET` | `/api/v1/contracts/options` | Colaboradores, proyectos y centros para el formulario |
| `GET` | `/api/v1/users/{userId}/contracts` | Historial de un colaborador |
| `POST` | `/api/v1/contracts` | Alta |
| `PUT` | `/api/v1/contracts/{id}` | Editar centro, fechas y notas (solo `ACTIVE`) |
| `PATCH` | `/api/v1/contracts/{id}/end` | Terminar (recorta la vigencia, no la amplía) |
| `PATCH` | `/api/v1/contracts/{id}/cancel` | Cancelar (causa obligatoria) |

- `/options` existe porque `HR_ADMIN` no tiene `user:manage` ni `worksite:manage`. Sin él, el formulario no podría listar colaboradores ni centros.
- Errores: 400 validación, 404 inexistente, 409 traslape o estado inválido. Un choque con la restricción de la BD también responde 409.

**Backend — módulo `organization`**
- `Project` rechaza fin anterior al inicio con `DomainException` (`INVALID_DATE_RANGE`, 422).

**Portal web**
- Nueva página **Contratos** (`/contracts`, menú *Organización*):
  - filtros por tipo, proyecto, estado, "vigente en" y búsqueda;
  - acciones editar, terminar y cancelar;
  - aviso "por revisar".
- En el formulario del proyecto:
  - validación de fechas;
  - al editar, panel **Colaboradores asignados** con el botón *Asignar colaborador*.

**Pruebas**
- `ContractServiceTest` (13 casos).
- `ProjectTest` (3).
- `ContractIT` (2, con PostgreSQL real): API, seguridad, SQL nativo y restricciones de la BD.
- `contract.models.spec.ts` (4).

---

### 8. Fase 2 — lo implementado

**Qué contrato cuenta para una marca** (`attendance/.../ContractPolicyAdapter`)

La fecha se mide en la zona del centro, o de la empresa si el centro no tiene, o UTC.

1. **El contrato no cancelado que cubre la fecha.** Si es por proyecto, la marca se atribuye al proyecto. Queda *fuera de vigencia* si el proyecto no está `ACTIVE` o si la fecha cae fuera de las fechas del proyecto.
2. **Si ninguno la cubre, el más cercano en el tiempo.** Si es por proyecto, la marca también se atribuye a ese proyecto, pero *fuera de vigencia*. Es el caso de quien sigue fichando después de terminar su asignación, o antes de que empiece.
3. **Un contrato por turno, o ninguno,** no atribuye proyecto ni señala nada.

**Efecto en la marcación**

Aplica igual por QR, sync offline y reloj externo.
- **RN-67:** `attendance_records.project_id` guarda el proyecto atribuido.
- **RN-66:** fuera de vigencia la marca **se acepta** con la bandera `OUT_OF_CONTRACT`, sea cual sea el evento.
- El evento `AttendanceRegistered` lleva dos campos nuevos: `projectId` y `outOfContract`.
- Solo la **ENTRADA** abre la incidencia **`FUERA_DE_VIGENCIA`** (prioridad media), una por jornada, como `SIN_TURNO`.
- **V34** añade el tipo `FUERA_DE_VIGENCIA` al CHECK de `incidents.type`.
- El portal ya traduce el tipo nuevo.

**Correcciones en `SchedulePolicyAdapter`**
- Una asignación de turno **sin centro** vale para cualquier centro. Antes se descartaba si la marca traía centro y la ENTRADA salía como `SIN_TURNO`.
- Los turnos de un horario **`INACTIVE`** ya no reclaman marcas.

**Pruebas**
- Unitarias: 3 casos nuevos en `RegisterAttendanceServiceTest`, 3 en `IncidentEventListenerTest` y 2 en `SchedulePolicyAdapterTest`.
- `ContractAttendanceIT` (4, con PostgreSQL real): marca, `project_id`, paso por el outbox y la incidencia creada. Casos:
  - contrato vigente;
  - contrato terminado;
  - proyecto cerrado;
  - contrato por turno.
