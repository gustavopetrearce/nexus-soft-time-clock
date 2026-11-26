# Iteración 15 · Importación masiva de usuarios (CSV / XLSX)

## 1. Objetivo y alcance

Dar de alta muchos colaboradores de una vez en una empresa **ya existente**, desde el portal (Usuarios → **Importar**).

| Decisión | Regla |
|---|---|
| Tenant | El del token de quien importa, que necesita `user:manage` (hoy solo COMPANY_ADMIN: HR_ADMIN no tiene ese permiso). El archivo **no** lleva columna de empresa, así que no puede escribir en otro tenant. SUPER_ADMIN no importa (V19: solo plataforma). |
| Rol | Obligatorio en cada fila. Solo se aceptan roles que el operador puede otorgar (`RoleGrantPolicy`: rango estrictamente menor al suyo). |
| Contraseña | La genera el sistema (14 caracteres). Se entrega **una sola vez** en el archivo de resultados; el servidor solo guarda el hash. |
| Duplicados | Solo se crean usuarios nuevos. Un correo o número de empleado ya existente es error de fila. |
| Errores | **Todo o nada.** Con un solo error no se escribe nada. |
| Alcance | Cuenta + roles + perfil de empleado + asignación de turno (opcional). Los contratos (iteración 14) quedan fuera. |

## 2. Estructura del archivo

- `.xlsx` (se lee la primera hoja) o `.csv` en UTF-8 (con o sin BOM). El separador `,`, `;` o tabulador se detecta solo.
- Fila 1 = encabezados. No importan mayúsculas, acentos ni orden (`Número Empleado` = `numero_empleado`). Las columnas desconocidas se ignoran y se avisa. Una columna repetida es error.
- Las filas completamente vacías se saltan. Los errores citan la fila **del archivo**.
- Máximo **1000 filas** y 2 MB por archivo.
- Fechas en `AAAA-MM-DD`. También se aceptan celdas de fecha de Excel y `DD/MM/AAAA`, que el portal convierte.

### Cuenta

| Columna | Oblig. | Destino | Validación |
|---|---|---|---|
| `email` | ✅ | `users.email` | Formato válido, ≤ 254. Único en el tenant y dentro del archivo (sin distinguir mayúsculas). |
| `nombre` | ✅ | `users.first_name` | 1–120 |
| `apellidos` | ✅ | `users.last_name` | 1–120 |
| `numero_empleado` | recomendado | `users.employee_code` | ≤ 60. Único en el tenant y dentro del archivo. Vacío = sin número. |
| `roles` | ✅ | `user_roles` | Uno o más, separados por `\|` (también `,` o `;`): `EMPLOYEE`, `SUPERVISOR`, `AUDITOR`, `HR_ADMIN`, `COMPANY_ADMIN`. El portal también acepta el nombre en español (`Colaborador`, `Supervisor`…). |

### Perfil de empleado (opcional → `employee_profiles`)

| Columna | Validación |
|---|---|
| `telefono` | ≤ 40 |
| `fecha_nacimiento` | Fecha, no futura |
| `fecha_ingreso` | Fecha |
| `genero` | `FEMALE` / `MALE` / `OTHER` / `UNDISCLOSED`. También `F`/`M`/`O`/`ND`, Femenino/Masculino/Otro, Mujer/Hombre y Prefiero/Prefiere no decir. |
| `direccion` | ≤ 400 |
| `contacto_emergencia_nombre` | ≤ 160 |
| `contacto_emergencia_telefono` | ≤ 40 |

El perfil solo se crea si la fila trae al menos uno de estos campos.

### Turno (opcional → `shift_assignments`)

Si se llena **cualquiera** de estas columnas, `codigo_horario`, `turno` y `turno_desde` pasan a ser obligatorias. Asignar turnos además requiere `schedule:manage`; sin ese permiso las columnas de turno son error de fila.

| Columna | Validación |
|---|---|
| `codigo_horario` | Código de un horario **activo** del tenant. |
| `turno` | Nombre del turno dentro de ese horario (sin distinguir mayúsculas ni acentos). Los turnos no tienen código (V4): si dos se llaman igual, la fila da error «turno ambiguo». |
| `codigo_centro` | Opcional. Código de un centro de trabajo **activo**. |
| `turno_desde` | Fecha |
| `turno_hasta` | Fecha opcional, ≥ `turno_desde`. Vacío = indefinido. |

Los códigos coinciden tal cual o, si no hay coincidencia exacta, sin distinguir mayúsculas siempre que el resultado sea único.

### Plantilla y resultados

- **Plantilla XLSX** (`plantilla-usuarios.xlsx`), con tres hojas:
  - *Usuarios*: encabezados y una fila de ejemplo.
  - *Instrucciones*: columna, si es obligatoria y descripción.
  - *Catálogos*: valores válidos **del tenant**. Incluye los roles que el operador puede otorgar y los géneros; los horarios con sus turnos solo aparecen con `schedule:manage`, y los centros solo con `worksite:manage`.
- **Plantilla CSV**: encabezados y fila de ejemplo, en UTF-8 con BOM.
- **Archivo de resultados** (`resultado-importacion-AAAA-MM-DD.xlsx`), con las columnas `fila`, `email`, `numero_empleado`, `nombre`, `apellidos`, `roles` y `password_temporal`. Si se cierra el drawer sin descargarlo, el portal pide confirmación.

## 3. Flujo y API

1. El portal lee el archivo con SheetJS y solo revisa su **forma**: formato, tamaño, encabezados y número de filas.
2. **Vista previa:** `POST /api/v1/users/import?dryRun=true` con `{ rows: [...] }` → 200. El servidor valida todo y no escribe nada.
3. **Confirmación:** `POST /api/v1/users/import?dryRun=false`.
   - Sin errores: **201** con `created[]`, que incluye `temporaryPassword`.
   - Si algo cambió desde la vista previa (otra alta con el mismo correo): **422** con `issues[]`, y no se escribió nada.

Respuesta: `{ dryRun, valid, totalRows, seatsNeeded, seatsAvailable, issues: [{row, column, code, message}], created: [...] }`. `row = 0` indica un error del archivo completo, como `CAPACITY_EXCEEDED`.

Códigos de error por fila:
- Formato y longitud: `REQUIRED`, `TOO_LONG`, `INVALID_EMAIL`, `INVALID_DATE`, `FUTURE_DATE`, `INVALID_GENDER`.
- Duplicados: `DUPLICATE_IN_FILE`, `DUPLICATE_EMAIL`, `DUPLICATE_EMPLOYEE_CODE`.
- Roles: `UNKNOWN_ROLE`, `FORBIDDEN_ROLE_GRANT`.
- Turno: `SHIFT_FORBIDDEN`, `UNKNOWN_SCHEDULE`, `UNKNOWN_SHIFT`, `AMBIGUOUS_SHIFT`, `UNKNOWN_WORK_SITE`, `AMBIGUOUS_CODE`, `INVALID_RANGE`.

## 4. Implementación

- **Módulo nuevo `backend/modules/onboarding`.** Es el único módulo que depende de otros bounded contexts, y solo de sus puertos de entrada:
  - `UserManagementUseCase.createAll` (Identity).
  - `EmployeeProfileUseCase.upsert` (HR).
  - `SchedulingUseCase.assignShift` (Scheduling).
  - `CompanyCapacityUseCase.get` (Tenancy).
- **Lecturas de validación:** las hace `JdbcImportCatalogAdapter`, una consulta por concepto para todo el lote. Es el mismo precedente que los adaptadores de directorio de Scheduling y HR.
- **Reglas:** viven en `ImportValidator`, que es puro y está probado de forma unitaria.
- **Una sola transacción.** `UserAdminPersistenceAdapter.create` hace `saveAndFlush`, para que dentro de esa transacción vean al usuario recién insertado tanto el conteo del cupo (SQL directo) como las comprobaciones de pertenencia de HR y Scheduling.
- **Cupo:** se valida para el lote entero en la vista previa y, al escribir, alta por alta como en el alta individual (RN-37).
- **Contraseñas:** `createAll` cifra con BCrypt en paralelo, porque son unos 80 ms por hash y 1000 en serie superarían el timeout del proxy.
- **nginx:** `location = /api/v1/users/import` amplía el timeout a 300 s y el cuerpo a 4 MB.
- **Corrección colateral en `POST /users`:**
  - Un `employee_code` duplicado devolvía **500** y ahora devuelve 422 `DUPLICATE_EMPLOYEE_CODE`.
  - Un correo inválido devuelve 422 `INVALID_EMAIL`.
  - Un código en blanco se guarda como `NULL`.
- **Auditoría:** el interceptor de entidades ya registra cada alta (usuario, roles, perfil y turno) con la contraseña enmascarada.

## 5. Limitaciones conocidas

- No existe «forzar cambio de contraseña en el primer inicio de sesión». Las contraseñas temporales siguen siendo válidas hasta que el colaborador las cambie o se restablezcan. Queda como mejora (columna `must_change_password`).
- No hay correo de bienvenida ni invitación; el estado `INVITED` sigue sin usarse.
- No se actualizan usuarios existentes (no hay *upsert*) ni se crean contratos.
