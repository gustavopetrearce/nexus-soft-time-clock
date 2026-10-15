# 02 — Actores y roles (RBAC)

## 2.1 Actores del sistema

| Actor | Descripción | Canal principal |
|---|---|---|
| **Colaborador (Empleado)** | Registra su asistencia en campo | App Flutter |
| **Supervisor** | Monitorea a su equipo, valida incidencias, ve mapa en tiempo real | Portal Angular |
| **Administrador de Empresa** | Gestiona usuarios, centros, horarios, geocercas de **su** empresa (tenant) | Portal Angular |
| **Administrador de RR.HH.** | Gestiona incidencias, reportes y reglas de asistencia | Portal Angular |
| **Super Administrador (Plataforma)** | Gestiona empresas/tenants y configuración global | Portal Angular |
| **Auditor** | Consulta bitácora de auditoría (solo lectura) | Portal Angular |
| **Sistema / Jobs** | Actores no humanos: scheduler, sincronizador, notificador, generador de reportes | Backend |

## 2.2 Roles y jerarquía

```
SUPER_ADMIN            (global, cross-tenant)
 └── COMPANY_ADMIN     (administra un tenant)
      ├── HR_ADMIN     (incidencias, reportes, reglas)
      ├── SUPERVISOR   (equipo/centros asignados)
      ├── AUDITOR      (solo lectura de auditoría)
      └── EMPLOYEE     (registra su propia asistencia)
```

- Los roles son **por tenant** (salvo `SUPER_ADMIN`, que es global).
- El modelo RBAC soporta **permisos granulares** agrupados en roles; un usuario puede tener uno o varios roles dentro de un tenant.
- Preparado para **scoping por centro/proyecto** (un supervisor solo ve sus centros asignados).

## 2.3 Catálogo de permisos (extracto)

Formato `recurso:acción`. Acciones: `read`, `create`, `update`, `delete`, `export`, `approve`, `manage`.

| Permiso | Descripción |
|---|---|
| `company:manage` | Alta/baja/edición de empresas (solo SUPER_ADMIN) |
| `company:capacity` | Administración del cupo de colaboradores activos y de los bloques adicionales de un tenant (solo SUPER_ADMIN) |
| `user:manage` | Gestión de usuarios del tenant |
| `role:manage` | Gestión de roles y permisos |
| `worksite:manage` | Gestión de centros de trabajo |
| `project:manage` | Gestión de proyectos |
| `schedule:manage` | Gestión de horarios y turnos |
| `geofence:manage` | Gestión de geocercas |
| `attendance:read` | Consulta de asistencias del ámbito autorizado |
| `attendance:register` | Registrar asistencia propia (EMPLOYEE) |
| `incident:approve` | Aprobar/rechazar incidencias |
| `report:export` | Exportar reportes |
| `audit:read` | Consultar bitácora de auditoría |
| `dashboard:read` | Ver dashboards y mapa en tiempo real |
| `sync:read` | Ver estado de sincronización |

## 2.4 Matriz de autorización (resumen)

| Permiso | SUPER_ADMIN | COMPANY_ADMIN | HR_ADMIN | SUPERVISOR | AUDITOR | EMPLOYEE |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `company:manage` | ✅ | — | — | — | — | — |
| `company:capacity` | ✅ | — | — | — | — | — |
| `user:manage` | — | ✅ | — | — | — | — |
| `role:manage` | — | ✅ | — | — | — | — |
| `worksite:manage` | — | ✅ | — | — | — | — |
| `project:manage` | — | ✅ | ✅ | — | — | — |
| `schedule:manage` | — | ✅ | ✅ | — | — | — |
| `geofence:manage` | — | ✅ | — | — | — | — |
| `attendance:read` | — | ✅ | ✅ | ✅ (su ámbito) | — | ✅ (propia) |
| `attendance:register` | — | — | — | — | — | ✅ |
| `incident:approve` | — | ✅ | ✅ | ✅ (su ámbito) | — | — |
| `report:export` | — | ✅ | ✅ | ✅ (su ámbito) | — | — |
| `audit:read` | — | ✅ | — | — | ✅ | — |
| `dashboard:read` | — | ✅ | ✅ | ✅ (su ámbito) | — | — |
| `sync:read` | — | ✅ | — | ✅ | — | — |

> **SUPER_ADMIN es un administrador de plataforma, no cross-tenant.** Su único permiso es
> `company:manage`: gestiona empresas (tenants) y configuración global, pero **no accede a los datos
> operativos de ningún tenant** (asistencias, reportes, incidencias, usuarios, etc.). Al crear una
> empresa aprovisiona su **COMPANY_ADMIN inicial** desde la propia superficie de gestión de empresas
> (endpoint gated por `company:manage`); a partir de ahí, ese COMPANY_ADMIN administra los datos del
> tenant. Esta decisión se implementa recortando los permisos del rol plantilla SUPER_ADMIN
> (migración `V19`); el modelo RBAC sigue soportando técnicamente concederle más permisos si en el
> futuro se optara por un modo cross-tenant o selector de tenant.

> **Excepción acotada: la capacidad contratada (RF-29).** El cupo de colaboradores activos de cada
> empresa es una decisión **comercial de plataforma**, no operativa del tenant, por lo que se
> administra con `company:capacity` (solo SUPER_ADMIN). Para ejercerlo, el super admin ve de cada
> tenant **únicamente el agregado** —límite vigente, bloques contratados, usados y disponibles—,
> nunca el padrón de colaboradores ni ningún dato operativo. El COMPANY_ADMIN consulta ese mismo
> agregado **en modo lectura**, gated por `user:manage` (el permiso con el que da de alta
> colaboradores), para entender por qué un alta se rechaza; no puede modificarlo. Ver
> [RN-34..RN-37](04-reglas-de-negocio.md) y
> [ADR-012](../iteracion-02-arquitectura/adr/ADR-012-capacidad-tenant.md).

> El aislamiento **multi-tenant** es transversal a toda la matriz: ningún rol puede acceder a datos
> de otro tenant, y SUPER_ADMIN directamente no opera sobre datos de tenants. Ver
> [RN-30..RN-33](04-reglas-de-negocio.md).
