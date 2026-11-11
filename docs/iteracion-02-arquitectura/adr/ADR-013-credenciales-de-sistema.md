# ADR-013 — Credenciales de sistema y marcación externa

**Estado:** Aceptado · **Fecha:** 2026-11-05 · Excepción acotada a [ADR-003](ADR-003-server-time.md) (RN-11)

## Contexto

La API solo autenticaba personas: login con contraseña y refresh rotatorio ([ADR-007](ADR-007-jwt-refresh.md)). Un sistema corporativo necesita registrar marcaciones en nombre de los colaboradores, y ese flujo no le sirve:

1. **El refresh rotatorio es frágil entre máquinas.** Dos instancias que renuevan a la vez, o una respuesta perdida, revocan la sesión entera.
2. **`POST /api/v1/attendance` registra al dueño del token** y exige QR firmado, GPS y dispositivo, que un sistema de servidor no tiene.
3. **Una cuenta de persona como integración** acopla el sistema a una contraseña y ocupa cupo (RN-34) sin ser un colaborador.

## Decisión

1. **Credencial por empresa.** Tabla `api_clients` ([V28](../../../db/migration/V28__api_clients_external_attendance.sql)). La administra el `COMPANY_ADMIN` con el permiso `integration:manage`. `SUPER_ADMIN` queda fuera (V19): la credencial opera datos del tenant.
2. **Contrato OAuth2 `client_credentials`** en `POST /api/v1/oauth/token`, para que sirva cualquier librería cliente. Sin refresh token: al caducar el access token se pide otro con la credencial.
   - **Credencial fija para dispositivos.** Un reloj checador solo puede enviar una cabecera configurada una vez y no puede renovar un token. Por eso `POST /api/v1/integrations/attendance` y `GET /api/v1/integrations/users`, y solo esos endpoints, aceptan también `Authorization: Basic base64(client_id:client_secret)` en cada petición. `ApiClientBasicAuthenticationFilter` produce la misma identidad que un token, así que autorización, tenant y auditoría no distinguen la vía.
   - **Sin vencimiento.** La credencial no caduca: solo deja de valer al revocarla, rotar el secreto o inactivar la empresa. Un dispositivo se configura una vez.
3. **Secreto de 256 bits aleatorios**, del que solo se guarda el SHA-256, igual que un refresh token. Con esa entropía un hash lento no aporta nada y no hace falta contador de intentos.
4. **Token confinado.** Lleva `token_use: client`, y `SecurityConfig` solo le abre `POST /api/v1/integrations/attendance` y `GET /api/v1/integrations/users`. Su `sub` es el id de la credencial, no de un usuario, y hay endpoints con `isAuthenticated()` que lo tratarían como tal. `/ws` no pasa por esas reglas, así que `StompAuthorizationInterceptor` lo rechaza aparte.
5. **Permisos fuera del catálogo.** `attendance:register:external` y `user:lookup:external` no están en `permissions`, de modo que ningún rol de usuario puede recibirlos. Un token de persona no puede marcar por otra.
6. **Revocación inmediata.** La marcación y la consulta comprueban en cada petición que la credencial y la empresa sigan activas, sin esperar a que caduque el JWT.
7. **Confianza en el emisor.** El sistema ya autenticó a la persona: no se validan QR, GPS, antifraude, dispositivo, foto ni biometría. Sí se mantienen idempotencia, tipo de evento habilitado, horario y secuencia. Como por QR, sin turno vigente la marca se acepta con la bandera `NO_SCHEDULE` y su ENTRADA abre una incidencia `SIN_TURNO`.
8. **Colaborador por `employee_code`**, único por empresa. El emisor puede comprobarlo antes de marcar con `GET /api/v1/integrations/users?employeeCode=`: coincidencia exacta, devuelve nombre, estado y si puede marcar, sin correo ni roles. Debe seguir activo y tener `attendance:register`: quien no cuenta en el cupo (ADR-012) tampoco marca por esta vía. Un bloqueo por contraseñas fallidas no impide marcar, porque esta vía no usa la contraseña; un bloqueo puesto por un administrador sí.
9. **Hora oficial = hora del evento.** Es la excepción a RN-11. Se acota a un máximo de `attendance.offline.max-age-hours` (72 h) en el pasado y 5 minutos en el futuro. Una hora futura dentro de la tolerancia se guarda como la de llegada (bandera `EVENT_TIME_CLAMPED`): fechada después, una marca por QR posterior se validaría contra ella y quedaría antes en la jornada. La hora de llegada queda en `created_at`, y el evento de dominio lleva la de llegada para que la bitácora no pueda fecharse hacia atrás.
10. **Orden cronológico por colaborador.** La secuencia se evalúa contra el último evento anterior a la hora de la marca. Una marca anterior a otra ya aceptada se rechaza con `INVALID_SEQUENCE` en lugar de intercalarse, porque podría invalidar lo que ya se dio por bueno.
11. **Sin columnas nuevas en `attendance_records`.** `source = EXTERNAL`, y la credencial queda en `validations_json`. `location` y `gps_accuracy_m` pasan a admitir NULL.

## Consecuencias

- ➕ El móvil y el portal no cambian: el registro normal y sus validaciones siguen intactos.
- ➕ Revocar o rotar una credencial no afecta a ninguna persona ni a otra integración.
- ➖ **Quien tenga la credencial puede marcar por cualquier colaborador de la empresa.** Es la consecuencia directa de confiar en el emisor, y por eso se confina el token, se audita la credencial en cada marca y se exige custodiarla como un secreto de producción.
- ➖ **Con la credencial fija, el secreto viaja en cada marcación**, no solo cada 15 minutos, y no caduca solo. **HTTPS es obligatorio en producción.** Si se roba un reloj, hay que revocar su credencial; por eso se usa una por dispositivo.
- ➖ Rotar el secreto de un reloj obliga a reconfigurarlo, y no hay solapamiento con el secreto anterior.
- ➖ **La hora oficial la declara el emisor.** Un sistema con el reloj mal o comprometido puede fechar marcas dentro de la ventana permitida. La diferencia con `created_at` permite detectarlo.
- ➖ El emisor debe ordenar sus envíos por colaborador; un reintento tardío puede acabar en `INVALID_SEQUENCE`, con su incidencia.
- ➖ Los reportes deben tolerar coordenadas nulas.
- 🔄 Si hacen falta otras operaciones para sistemas (consultas, altas), se abren nuevas reglas en `SecurityConfig` con su propio permiso fuera del catálogo.
