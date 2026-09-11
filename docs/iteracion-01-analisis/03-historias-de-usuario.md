# 03 — Historias de usuario

Formato: _Como **[rol]** quiero **[objetivo]** para **[beneficio]**._ Cada historia incluye criterios de aceptación (CA) en estilo Gherkin resumido.

---

## Épica E1 — Autenticación y sesión

### HU-01 — Inicio de sesión (RF-01, RF-13)
Como **usuario** quiero iniciar sesión con mis credenciales dentro de mi empresa para acceder a la plataforma.
- **CA1:** Dado credenciales válidas y tenant válido, obtengo un `accessToken` (JWT corto) y `refreshToken`.
- **CA2:** Dado credenciales inválidas, recibo error 401 genérico (sin revelar si el usuario existe).
- **CA3:** Tras N intentos fallidos, la cuenta se bloquea temporalmente (rate limiting / lockout). Ver [RN-40](04-reglas-de-negocio.md).

### HU-02 — Renovación de token (RF-01)
Como **usuario autenticado** quiero renovar mi sesión con el refresh token para no reautenticarme constantemente.
- **CA1:** Un `refreshToken` válido y no revocado emite un nuevo par de tokens (rotación).
- **CA2:** Un refresh token reutilizado/revocado invalida toda la familia de tokens (detección de robo).

### HU-03 — Cierre de sesión
Como **usuario** quiero cerrar sesión para revocar mi acceso en el dispositivo.
- **CA1:** El refresh token queda revocado; el access token se rechaza al expirar.

---

## Épica E2 — Registro de asistencia (móvil)

### HU-10 — Registrar entrada por QR + GPS (RF-02, RF-14, RF-15, RF-16, RF-17)
Como **colaborador** quiero registrar mi entrada escaneando el QR del sitio para dejar constancia validada de mi asistencia.
- **CA1:** Al escanear un QR **válido y vigente** del centro, con GPS **dentro del radio** de la geocerca y **precisión ≤ umbral**, dentro de la **ventana de horario/turno**, el registro se acepta con **timestamp del servidor**.
- **CA2:** Si el GPS está fuera del radio permitido, el registro se **rechaza** con motivo `OUT_OF_GEOFENCE`.
- **CA3:** Si la precisión del GPS supera el umbral, se **rechaza** con `LOW_GPS_ACCURACY`.
- **CA4:** Si el QR está expirado o no corresponde al centro, se **rechaza** con `INVALID_QR`.
- **CA5:** Si se detecta mock location / root / spoofing, se **rechaza/marca** según política. Ver [RN-20..RN-27](04-reglas-de-negocio.md).
- **CA6:** El registro guarda: usuario, centro, geocerca, lat/lng, precisión, tipo de evento, hash del QR, hora de servidor, resultado de validaciones.

> CA1, CA2 y CA4 describen el registro **con centro de trabajo**, que es el camino por defecto. La
> empresa puede habilitar además un camino sin centro: ver [HU-17](#hu-17--registrar-asistencia-sin-centro-de-trabajo-rf-15-rf-18).

### HU-11 — Registrar salida (RF-03)
Como **colaborador** quiero registrar mi salida para cerrar mi jornada.
- **CA1:** Solo puedo registrar salida si tengo una entrada abierta en el mismo centro/turno.
- **CA2:** La salida aplica las mismas validaciones de GPS/geocerca/antifraude que la entrada.

### HU-12 — Registros intermedios (RF-04)
Como **colaborador** quiero registrar eventos intermedios (inicio/fin de descanso, cambio de sitio) para reflejar mi jornada real.
- **CA1:** Los tipos de evento intermedios son configurables por la empresa.
- **CA2:** Se validan secuencias coherentes (no dos "inicio de descanso" seguidos). Ver [RN-12](04-reglas-de-negocio.md).

### HU-13 — Evidencia fotográfica opcional (RF-18)
Como **colaborador** quiero adjuntar una foto al registro cuando la empresa lo requiera para reforzar la evidencia.
- **CA1:** Si la política del centro exige foto, el registro no se completa sin ella.
- **CA2:** La foto se almacena cifrada/segura (MinIO) y se asocia al registro.

### HU-14 — Biometría opcional (RF-19)
Como **colaborador** quiero confirmar mi identidad con biometría del dispositivo antes de registrar para evitar suplantación.
- **CA1:** Si la política lo exige, el registro requiere autenticación local (huella/rostro) exitosa.

### HU-15 — Funcionamiento offline (RF-21)
Como **colaborador en zona sin señal** quiero registrar mi asistencia sin conexión para no perder el registro.
- **CA1:** El registro se guarda localmente (Drift) y entra en la **cola de sincronización**.
- **CA2:** Al recuperar conexión, se sincroniza automáticamente con reintentos inteligentes.
- **CA3:** El servidor valida con **su** hora y detecta duplicados/replay (idempotencia). Ver [RN-50..RN-54](04-reglas-de-negocio.md).
- **CA4:** El colaborador ve el estado de cada registro: `pendiente / sincronizado / rechazado`.

### HU-16 — Historial personal (RF-05)
Como **colaborador** quiero ver mi historial de registros para consultar mi asistencia.
- **CA1:** Puedo filtrar por rango de fechas y ver estado de cada registro.

### HU-17 — Registrar asistencia sin centro de trabajo (RF-15, RF-18)
Como **colaborador sin sede fija** (visitador, técnico de campo, comercial) quiero registrar mi
asistencia sin pertenecer a un centro de trabajo, para dejar constancia de mi jornada donde quiera
que esté. Es un camino **opcional** que convive con [HU-10](#hu-10--registrar-entrada-por-qr--gps-rf-02-rf-14-rf-15-rf-16-rf-17); no lo sustituye.
- **CA1:** El camino solo existe si la empresa lo habilita (`company_settings.siteless_attendance_enabled`, apagado por defecto). Con la política apagada, un intento se **rechaza** con `SITELESS_NOT_ALLOWED` aunque se presente un QR de empresa emitido antes.
- **CA2:** Se registra escaneando un **QR de empresa**: firmado y con vigencia como el de centro, pero sin centro asociado. Lo emite quien tenga `geofence:manage`.
- **CA3:** La ubicación GPS sigue siendo **obligatoria** y se persiste, pero **no se contrasta con ninguna geocerca**: el registro se acepta marcado con la bandera `NO_GEOFENCE` y sin distancia al centro.
- **CA4:** La **precisión** del GPS se sigue exigiendo contra el umbral de la empresa; por encima, `LOW_GPS_ACCURACY`.
- **CA5:** La **foto es obligatoria** en este camino, aunque la empresa tenga la evidencia fotográfica desactivada: sin geocerca es la única prueba de presencia. Sin ella, `PHOTO_REQUIRED`.
- **CA6:** Los ámbitos no se mezclan: un QR de empresa presentado con un centro, o un QR de centro presentado sin él, se rechazan con `INVALID_QR`. Una jornada abierta sin centro solo se cierra sin centro, y viceversa (ver [RN-12](04-reglas-de-negocio.md)).
- **CA7:** Antifraude, device binding, ventana de turno y secuencia de jornada siguen aplicándose. El turno se busca entre **todas** las asignaciones vigentes del colaborador, sin filtrar por centro, para conservar la detección de retardo.
- **CA8:** En el portal, estas marcas se distinguen como **«Sin centro»** —no como un centro vacío— y el detalle indica que no hubo validación de geocerca.

---

## Épica E3 — Administración (portal)

### HU-20 — Gestión de empresas (RF-13)
Como **super administrador** quiero dar de alta y configurar empresas (tenants) para operar la plataforma multi-empresa.

### HU-21 — Gestión de usuarios y roles (RF-06, RF-22)
Como **administrador de empresa** quiero crear usuarios y asignarles roles para controlar el acceso.
- **CA1:** No puedo asignar roles de mayor privilegio que el mío.
- **CA2:** Los usuarios pertenecen a un único tenant (excepto SUPER_ADMIN).

### HU-22 — Gestión de centros de trabajo y proyectos (RF-07, RF-23)
Como **administrador** quiero gestionar centros de trabajo y proyectos con su ubicación para asociar la asistencia.

### HU-23 — Gestión de geocercas (RF-10)
Como **administrador** quiero definir la geocerca (centro + radio o polígono) de cada sitio para delimitar dónde es válido registrar.
- **CA1:** Puedo definir geocerca circular (centro + radio) y (futuro) poligonal.
- **CA2:** El sistema valida solapamientos/consistencia.

### HU-24 — Gestión de horarios y turnos (RF-08)
Como **administrador** quiero configurar horarios y turnos con tolerancias para evaluar puntualidad.
- **CA1:** Puedo definir tolerancia de retardo y ventana de registro.

### HU-25 — Generación de QR de centro (RF-14)
Como **administrador** quiero generar/rotar el QR de un centro para el registro seguro.
- **CA1:** El QR incorpora un secreto/nonce firmado y una vigencia, no un valor estático adivinable. Ver [RN-25](04-reglas-de-negocio.md).
- **CA2:** Si la empresa habilitó el registro sin centro ([HU-17](#hu-17--registrar-asistencia-sin-centro-de-trabajo-rf-15-rf-18)), puedo emitir además un **QR de empresa** desde Configuración. A diferencia del QR de centro, rotarlo **invalida el anterior de inmediato**: al no tener geocerca detrás, la firma y la vigencia no bastan como única barrera.

### HU-26 — Gestión de incidencias (RF-09)
Como **RR.HH./supervisor** quiero revisar y resolver incidencias (retardos, faltas, permisos) para mantener la asistencia correcta.
- **CA1:** Puedo aprobar/rechazar justificaciones con comentario, quedando auditado.

---

## Épica E4 — Visibilidad, reportes y auditoría

### HU-30 — Dashboards (RF-24)
Como **supervisor/admin** quiero dashboards de asistencias, incidencias, retardos, horas trabajadas/extra y usuarios activos para tomar decisiones.

### HU-31 — Mapa en tiempo real (RF-25)
Como **supervisor** quiero ver en un mapa los registros/ubicaciones en tiempo real para supervisar la operación.

### HU-32 — Estado de sincronización (RF-26)
Como **supervisor/admin** quiero ver qué dispositivos tienen registros pendientes de sincronizar para detectar problemas de campo.

### HU-33 — Reportes exportables (RF-11)
Como **admin/RR.HH.** quiero exportar reportes en Excel/PDF/CSV con filtros avanzados para análisis y cumplimiento.

### HU-34 — Auditoría (RF-12)
Como **auditor/admin** quiero consultar la bitácora de todas las acciones (usuario, fecha, hora, IP, navegador, dispositivo, acción, valores antes/después) para trazabilidad y cumplimiento.

### HU-35 — Notificaciones (RF-27)
Como **usuario** quiero recibir notificaciones (push/email) de eventos relevantes (registro rechazado, incidencia, sincronización) para reaccionar a tiempo.

---

> Cada historia se traza a RF y RN en [09 — Matriz de trazabilidad](09-matriz-trazabilidad.md).
