# ADR-012 — Capacidad de colaboradores activos por tenant (cupo base + bloques)

**Estado:** Aceptado · **Fecha:** 2026-10-14 · Requerimiento **RF-29** (reglas [RN-34..RN-37](../../iteracion-01-analisis/04-reglas-de-negocio.md))

## Contexto

El negocio vende la plataforma con un **cupo de colaboradores activos por empresa**: 150 de base, ampliable en **bloques completos de 50** (acumulativos; a partir del colaborador 151 hace falta el primer bloque). La administración del cupo es una decisión comercial y la ejerce **solo el super administrador**.

Del modelo actual se desprenden tres hechos que condicionan la decisión:

1. **No existe una entidad `employee`.** Un colaborador es una fila de `users` con un rol que incluye `attendance:register` (hoy solo `EMPLOYEE`, sembrado en `V10`), y "habilitado para registrar" equivale a `status = 'ACTIVE'` sin bloqueo vigente (`User.canAuthenticate`). El cupo, por tanto, se mide sobre `users`, que vive en **BC-01 (identity)**, mientras el límite es un atributo del **tenant**, en **BC-02 (tenancy)**.
2. **`company_settings` es territorio del tenant.** La edita el propio COMPANY_ADMIN con `company:settings` ([V21](../../../db/migration/V21__company_policy_settings.sql)). Un cupo guardado ahí sería, por construcción, un cupo que el tenant puede tocar.
3. **[ADR-002](ADR-002-multitenancy.md) + `V19`**: SUPER_ADMIN es administrador de plataforma y **no accede a datos operativos** de ningún tenant; su único permiso era `company:manage`. Administrar el cupo le obliga a conocer *cuántos* colaboradores activos tiene una empresa.

## Decisión

1. **Almacenamiento propio.** Tabla `company_capacity (company_id PK → companies, base_limit, block_size, extra_blocks, updated_at, updated_by)`, separada de `company_settings` para que el cupo quede fuera del alcance de `company:settings` y para dejar traza de quién lo cambió. Los tres valores se **persisten por tenant** (snapshot): un cambio comercial futuro de los defaults (150/50) no altera retroactivamente los contratos vigentes. Límite vigente = `base_limit + extra_blocks × block_size`; `extra_blocks` es un entero ≥ 0 (bloques completos, sin fracciones ni prorrateo).
2. **Permiso propio `company:capacity`**, concedido **solo** al rol plantilla `SUPER_ADMIN`. Como `V19` borró de ese rol todo permiso distinto de `company:manage`, la migración debe insertarlo explícitamente para SUPER_ADMIN y **no** para `COMPANY_ADMIN`/`HR_ADMIN` — el patrón inverso al de `V20`/`V21`. Se descarta reutilizar `company:manage`: funcionaría, pero haría indistinguibles en la auditoría "editó la empresa" y "le vendió un bloque".
3. **Exposición mínima y asimétrica.** El super admin ve de cada tenant **solo el agregado** (límite, bloques, usados, disponibles), nunca el padrón; el COMPANY_ADMIN ve el mismo agregado **en modo lectura** (gated por `user:manage`, con el que da de alta colaboradores) para poder interpretar un rechazo por cupo. Es una excepción acotada —y declarada— al principio de ADR-002 de que SUPER_ADMIN no lee datos del tenant.
4. **El conteo se hace por permiso efectivo** (`attendance:register`), no por el código de rol `EMPLOYEE`: hoy son equivalentes porque los roles no son editables (`RoleController` solo lista), pero la equivalencia no debe quedar enterrada en una query.
5. **Enforcement en identity, límite consultado por puerto.** `identity` es quien decide si puede habilitar un colaborador, así que consulta el límite a `tenancy` mediante un puerto de salida (`TenantCapacityPort`) en vez de leer sus tablas. Se preserva el bajo acoplamiento entre bounded contexts de [ADR-001](ADR-001-modular-monolith-hexagonal.md) / RNF-12.
6. **Transacción y serialización por tenant.** La comprobación del cupo y la operación que lo consume van en la **misma transacción**, con bloqueo de la fila de `company_capacity` (`SELECT … FOR UPDATE`). Sin él, dos altas concurrentes en el límite pasan ambas. A esta escala (cientos de filas por tenant) el bloqueo de fila es suficiente y más simple que un trigger de constraint.
7. **Tres caminos consumen cupo** y los tres se validan: alta (`POST /api/v1/users`), reactivación (`PATCH /api/v1/users/{id}/status` → `ACTIVE`) y asignación de un rol con `attendance:register` (`PUT /api/v1/users/{id}/roles`). El aprovisionamiento del COMPANY_ADMIN inicial no consume cupo (RN-35, S-13).
8. **La baja debe cortar la sesión.** Pasar a `INACTIVE` (o bloquear la cuenta) **revoca los refresh tokens** del usuario, y `refresh` revalida el estado de la cuenta antes de rotar. Sin esto el cupo liberado se reasigna mientras el colaborador dado de baja sigue registrando con una sesión que se renueva sola hasta 30 días: el límite sería contable pero no efectivo (RN-36).
9. **Rechazo explícito y auditado.** Superar el cupo responde `409` con código `CAPACITY_EXCEEDED` y los números (límite, usados, disponibles). Todo cambio de `extra_blocks` genera auditoría con valores antes/después (RN-43). Reducir bloques por debajo del uso actual se rechaza (ver [D-09](../../iteracion-01-analisis/10-supuestos-y-decisiones-abiertas.md)).

## Consecuencias

- ➕ El cupo es inmanipulable por el tenant: distinta tabla, distinto permiso, distinta superficie.
- ➕ El límite efectivo es una fórmula sobre datos persistidos por tenant; cambiar la oferta comercial no reescribe contratos vigentes ni requiere migración de datos.
- ➕ Contar por permiso efectivo deja la regla a prueba de roles nuevos o editables en el futuro.
- ➖ Introduce una dependencia nueva identity → tenancy; se paga con un puerto y su adaptador, no con acceso directo a tablas.
- ➖ El super admin pasa a conocer un agregado de cada tenant: hay que mantener esa excepción **explícita** en [02 — Actores y roles](../../iteracion-01-analisis/02-actores-y-roles.md) §2.4 para que no se interprete como la puerta a un modo cross-tenant.
- ➖ El bloqueo de fila serializa las altas de un mismo tenant. Irrelevante para un CRUD administrativo; no aplica al registro de asistencia, que no consume cupo.
- 🔄 Si en el futuro se vende por centro de trabajo o por franja de consumo, cambia la fórmula pero no el punto de enforcement ni el modelo de permisos.
