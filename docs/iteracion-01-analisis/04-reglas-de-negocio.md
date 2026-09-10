# 04 — Reglas de negocio

Reglas expresadas de forma **verificable**. Cada una será cubierta por pruebas automatizadas en su iteración.

## Grupo A — Validación de asistencia (RF-15, RF-16, RF-17)

| Código | Regla |
|---|---|
| **RN-10** | Un registro de asistencia es **válido** solo si supera TODAS las validaciones **aplicables**: QR vigente, GPS dentro de geocerca, precisión ≤ umbral, dentro de ventana de horario/turno y sin banderas antifraude bloqueantes. En el camino sin centro (RN-18) la geocerca no es aplicable; el resto sí. |
| **RN-11** | La **hora oficial** de un registro es la **hora del servidor** al momento de recibirlo; la hora del dispositivo se guarda como metadato pero **no es autoritativa**. |
| **RN-12** | Los eventos deben respetar una **secuencia válida** por jornada: `ENTRADA → (INICIO_DESCANSO → FIN_DESCANSO)* → SALIDA`. No se permite SALIDA sin ENTRADA abierta, ni ENTRADA duplicada sin cierre. La jornada transcurre en **un mismo centro** (solo `CAMBIO_SITIO` la traslada) —y una jornada abierta sin centro (RN-18) solo se cierra sin centro, nunca en uno— y se considera abierta durante `company_settings.open_shift_max_hours` (16 h por defecto): pasado ese plazo el colaborador puede volver a registrar ENTRADA y una SALIDA tardía se rechaza. Un mismo día admite **varios turnos** — `… → SALIDA → ENTRADA → …` es una transición válida. |
| **RN-13** | El **radio permitido** (geocerca circular) se evalúa como distancia geodésica entre la posición reportada y el centro del sitio ≤ `radio_m`. Con geocerca poligonal, la posición debe estar contenida en el polígono. Solo se evalúa si la marcación **tiene centro**: sin él no hay geocerca contra la que medir (RN-18). |
| **RN-14** | La **precisión** reportada por el GPS debe ser ≤ `precision_max_m` del centro (por defecto configurable, p.ej. 50 m). Precisión mayor → `LOW_GPS_ACCURACY`. |
| **RN-15** | La **ventana de registro** de entrada admite tolerancia configurable antes/después del inicio de turno. Registro fuera de ventana → incidencia (retardo/anticipo) según política, no necesariamente rechazo. |
| **RN-16** | Un **retardo** se genera cuando la ENTRADA ocurre después de `inicio_turno + tolerancia`. |
| **RN-17** | Las **horas trabajadas** se calculan entre ENTRADA y SALIDA descontando descansos; las **horas extra** son el excedente sobre la jornada del turno. |
| **RN-18** | **Registro sin centro de trabajo (opcional, por empresa).** Si `company_settings.siteless_attendance_enabled` está activo, el colaborador puede fichar con un **QR de empresa** (firmado y vigente como el de centro, pero sin centro asociado). En ese camino: (a) la geocerca **no se evalúa** y el registro se acepta con la bandera `NO_GEOFENCE` y sin `distance_to_site_m`; (b) el GPS sigue siendo obligatorio y su **precisión** se exige contra el umbral de la empresa (RN-14); (c) la **foto es obligatoria** aunque `require_photo` esté desactivado, por ser la evidencia que sustituye a la geocerca; (d) el turno se busca entre todas las asignaciones vigentes del colaborador, sin filtrar por centro, conservando RN-15 y RN-16; (e) antifraude (RN-20..RN-28) y secuencia (RN-12) siguen vigentes. Con la política apagada, presentar un QR de empresa se rechaza con `SITELESS_NOT_ALLOWED`. |
| **RN-19** | El **ámbito del QR y el de la marcación deben coincidir en ambas direcciones**: un QR de empresa solo vale para una marcación sin centro y un QR de centro solo para su centro; cualquier cruce → `INVALID_QR`. Sin esta simetría bastaría con omitir el centro frente a un QR de centro para esquivar su geocerca. |

## Grupo B — Antifraude (RF-20, RF-28)

| Código | Regla |
|---|---|
| **RN-20** | Si el dispositivo reporta **mock location** activa, el registro se marca `FRAUD_MOCK_LOCATION` y se rechaza (política por defecto; configurable a "marcar y permitir revisión"). |
| **RN-21** | Si el dispositivo está **rooteado / con jailbreak**, se marca `FRAUD_ROOTED_DEVICE` según política del tenant (rechazar o marcar). |
| **RN-22** | Si el **GPS está deshabilitado** o no se obtiene fix, no se permite registrar (`GPS_UNAVAILABLE`). |
| **RN-23** | Se detecta la presencia de **apps de spoofing de GPS** conocidas; si están activas, se marca `FRAUD_GPS_SPOOF_APP`. |
| **RN-24** | Un registro con **precisión insuficiente** no puede aprobarse automáticamente (ver RN-14). |
| **RN-25** | El **QR del centro no es un valor estático**: incorpora un secreto firmado + `nonce` + vigencia. Un QR **expirado** o con firma inválida → `INVALID_QR`. El **QR de empresa** (RN-18) se comprueba además contra el registro de emisiones: rotarlo deja el anterior inservible al instante, porque sirve desde cualquier ubicación y no tiene una geocerca que lo respalde. |
| **RN-26** | **Reutilización fraudulenta de QR / replay:** cada registro incluye un identificador único de operación (client-generated UUID); el servidor **rechaza duplicados** por ese UUID (idempotencia, RN-51) y descarta las secuencias incoherentes (RN-12). El QR de centro lleva un nonce fijo durante toda su vigencia y **debe servir para todos los eventos de la jornada**, así que no se "consume": se persiste en el registro (`attendance_records.qr_nonce`) como traza de auditoría. Frente a un QR fotografiado, las barreras son la geocerca (RN-13), el antifraude (RN-20..RN-28) y el device binding (RN-27). |
| **RN-27** | **Device binding (RF-28):** un colaborador opera con dispositivo(s) registrado(s); un dispositivo no reconocido genera verificación adicional o bloqueo según política. |
| **RN-28** | Toda **bandera antifraude** queda registrada en el evento y visible para el supervisor, independientemente de si bloqueó o no el registro. |

## Grupo C — Multi-tenant y seguridad (RF-13, RF-22)

| Código | Regla |
|---|---|
| **RN-30** | Todo dato de negocio pertenece a un **tenant (empresa)**; ninguna consulta puede devolver datos de otro tenant (aislamiento obligatorio a nivel de aplicación y de datos). |
| **RN-31** | El `tenant_id` se deriva del **token/contexto de sesión**, nunca de un parámetro manipulable por el cliente. |
| **RN-32** | Un usuario (salvo SUPER_ADMIN) pertenece a **un solo tenant**. |
| **RN-33** | Un supervisor solo accede a datos de los **centros/proyectos** que tiene asignados. |
| **RN-40** | Tras `N` (configurable, p.ej. 5) intentos fallidos de login, la cuenta se bloquea temporalmente (backoff). |
| **RN-41** | Los `accessToken` son de **vida corta**; los `refreshToken` rotan en cada uso y se **revoca la familia** ante reutilización. |
| **RN-42** | La información sensible (credenciales, datos personales, evidencias) se almacena **cifrada**; el transporte es **siempre HTTPS/TLS**. |
| **RN-43** | Toda acción que crea/modifica/elimina datos debe generar un registro de **auditoría** (ver Grupo E). |

## Grupo D — Offline y sincronización (RF-21)

| Código | Regla |
|---|---|
| **RN-50** | La app es **offline-first**: un registro se persiste localmente antes de intentar enviarse; la falta de red no puede causar pérdida de registros. |
| **RN-51** | Cada registro lleva un **UUID de operación** generado en el cliente; el backend es **idempotente** respecto a ese UUID (reenvíos no duplican). |
| **RN-52** | La **sincronización** es automática al recuperar conectividad, con **reintentos con backoff exponencial** y límite de intentos antes de marcar error. |
| **RN-53** | **Resolución de conflictos:** ante discrepancias, la validación **del servidor es autoritativa** (hora, geocerca, antifraude). Un registro offline puede ser **aceptado, marcado con incidencia o rechazado** al sincronizar. |
| **RN-54** | El cliente recibe **confirmación de sincronización** con el resultado por registro y actualiza su estado local. |

## Grupo E — Auditoría (RF-12)

| Código | Regla |
|---|---|
| **RN-60** | Cada evento de auditoría almacena: **usuario, fecha, hora, IP, navegador/user-agent, dispositivo, acción, valores anteriores y valores nuevos**. |
| **RN-61** | Los registros de auditoría son **inmutables** (append-only); no se permite su edición ni borrado por usuarios de negocio. |
| **RN-62** | La auditoría respeta el aislamiento multi-tenant (un auditor solo ve su tenant). |
