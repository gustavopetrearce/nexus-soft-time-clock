# Iteración 8 — Registro de asistencia (EL NÚCLEO)

**Objetivo:** implementar el corazón del producto — registrar asistencia validada por QR + GPS + geocerca + antifraude, con hora de servidor e idempotencia.

## Módulos

### Anti-Fraud (BC-07) — `backend/modules/antifraud/`
`FraudEvaluationService`: evalúa señales del dispositivo (mock location, root/jailbreak, GPS spoofing, GPS off, dispositivo no confiable) contra la política (REJECT bloquea / FLAG marca). Sin persistencia; devuelve banderas + decisión de bloqueo.

### Attendance (BC-06, núcleo) — `backend/modules/attendance/`
`RegisterAttendanceService` orquesta, en orden:
1. **Idempotencia** (RN-51): reenvío del mismo `operationUuid` → devuelve el resultado previo sin reprocesar.
2. **QR firmado** (RN-25): verifica firma + vigencia + coincidencia tenant/centro (delegado a Geofencing).
3. **Antifraude** (RN-20..RN-28): recoge banderas; bloquea si la política lo indica.
4. **Geocerca + precisión** (RN-13, RN-14): distancia geodésica (haversine) ≤ radio y precisión ≤ umbral.
5. **Ventana de horario** (RN-15, RN-16): si el colaborador tiene turno vigente en el centro, la ventana del turno gobierna cuándo puede **abrir** la jornada, así que solo la `ENTRADA` fuera de ventana se rechaza (`OUT_OF_SCHEDULE`); sin turno asignado no se restringe. SALIDA, descansos y cambio de sitio se aceptan fuera de ventana —rechazarlos dejaba al colaborador sin poder cerrar la jornada— con la bandera `OUT_OF_SCHEDULE`, que abre una incidencia `FUERA_DE_VENTANA`. Una ENTRADA pasada la tolerancia, pero dentro de ventana, se acepta con bandera `LATE`.
6. **Secuencia de jornada** (RN-12): transición coherente respecto al último evento aceptado (ver matriz abajo) → `INVALID_SEQUENCE`.
7. **Evidencia y biometría** (HU-13, HU-14): la foto se verifica contra el almacenamiento (existe, cuelga del prefijo del tenant/usuario/centro y es reciente); si el centro las exige y faltan → `PHOTO_REQUIRED` / `BIOMETRIC_REQUIRED`.
8. **Anti-replay** (RN-26): lo cubren la idempotencia por `operation_uuid` (RN-51) y la secuencia de jornada (RN-12); el `nonce` del QR solo se guarda como traza en `attendance_records.qr_nonce`.
9. **Hora de servidor** (RN-11) fija el timestamp oficial.
10. Persiste el registro (aceptado o rechazado con motivo) y **publica evento** `AttendanceRegistered`/`AttendanceRejected`.

Gana el **primer** motivo de rechazo de la lista; las validaciones posteriores siguen ejecutándose para dejar sus banderas en `validations_json`.

#### Matriz de secuencia (RN-12)

El estado de la jornada es el **último evento aceptado** del colaborador dentro de la ventana `company_settings.open_shift_max_hours` (16 h por defecto, migración **V23**). Fuera de esa ventana la jornada deja de considerarse abierta: sin esa cota, una ENTRADA sin su SALIDA bloquearía al colaborador con `INVALID_SEQUENCE` de forma indefinida, porque nada cierra las jornadas huérfanas.

| Evento solicitado | Se acepta si el último evento aceptado es… | Centro |
|---|---|---|
| `ENTRADA` | ninguno, o `SALIDA` | — |
| `INICIO_DESCANSO` | `ENTRADA`, `FIN_DESCANSO` o `CAMBIO_SITIO` | mismo |
| `FIN_DESCANSO` | `INICIO_DESCANSO` | mismo |
| `CAMBIO_SITIO` | `ENTRADA`, `FIN_DESCANSO` o `CAMBIO_SITIO` | libre |
| `SALIDA` | `ENTRADA`, `FIN_DESCANSO` o `CAMBIO_SITIO` | mismo |

`CAMBIO_SITIO` es el **único** evento que traslada el centro de referencia de la jornada; los demás deben registrarse donde está abierta. Como `ENTRADA` es válida tras una `SALIDA`, el mismo día admite **varios turnos** (`ENTRADA → … → SALIDA → ENTRADA → … → SALIDA`), y el mismo QR de centro sirve para todos (RN-26).

#### Atribución de la marca a un turno (RN-15, RN-16)

Con varios turnos el mismo día las **ventanas de registro se solapan**: el `window_after_min` de uno pisa el `window_before_min` del siguiente. Turnos de `08:00–14:00` y `14:30–19:00` con la ventana por defecto de ±30 min dan `[07:30, 14:30]` y `[14:00, 19:30]`, que se pisan entre las 14:00 y las 14:30. La marca pertenece al turno cuyo **borde correspondiente al tipo de evento** está más cerca:

| Evento | Se mide contra |
|---|---|
| `ENTRADA` | el **inicio** de la ocurrencia |
| `SALIDA` | el **fin** de la ocurrencia |
| `INICIO_DESCANSO`, `FIN_DESCANSO`, `CAMBIO_SITIO` | el **cuerpo** `[inicio, fin]`: 0 si la marca cae dentro |

A igual distancia gana el turno ya empezado, y en último término el id: la decisión no puede depender del orden en que la base devuelva las asignaciones. El turno elegido es el que fija la tardanza de RN-16 y **queda grabado en `attendance_records.shift_id`**, de modo que un retardo es auditable —se sabe contra qué inicio se midió—.

Sin esta regla se resolvía el solape con la primera asignación que apareciera: una ENTRADA puntual a las 14:30 podía medirse contra las 08:00 y abrir una incidencia de 380 min de retardo. Ver el [caso de uso de dos turnos](02-caso-de-uso-dos-turnos.md).

#### Fichajes offline

`SyncAttendanceService` delega cada item del lote en este mismo orquestador. La ventana de horario se evalúa con la **hora del dispositivo** cuando el origen es `OFFLINE_SYNC` y esa hora es anterior a la de llegada y no supera `attendance.offline.max-age-hours` (72 h por defecto); en ese caso el registro lleva la bandera `OFFLINE_DEVICE_TIME_USED`. Sin ello, un fichaje capturado de noche y sincronizado por la mañana caería siempre en `OUT_OF_SCHEDULE`. La hora oficial del registro sigue siendo la del servidor (RN-11).

> Un centro que opere en modo offline necesita un QR de **vigencia larga**: con el TTL por defecto (120 s) el token ya habrá caducado al sincronizar y el lote entero se rechazará como `INVALID_QR` (con la bandera `QR_EXPIRED` para distinguirlo de una firma alterada).

**API:**
- `POST /api/v1/attendance` (`attendance:register`) → 200 con `{recordId, status, rejectionReason, serverTime, distanceToSiteM, flags}`. Un rechazo de negocio **no** es error HTTP.
- `GET /api/v1/attendance/me?limit=` → historial propio (RF-05).

Motivos de rechazo: `INVALID_QR`, `OUT_OF_GEOFENCE`, `LOW_GPS_ACCURACY`, `GPS_UNAVAILABLE`, `OUT_OF_SCHEDULE`, `INVALID_SEQUENCE`, `FRAUD_MOCK_LOCATION`, `FRAUD_ROOTED_DEVICE`, `FRAUD_GPS_SPOOF_APP`, `UNTRUSTED_DEVICE`, `PHOTO_REQUIRED`, `BIOMETRIC_REQUIRED`, `EVENT_TYPE_DISABLED`.

`REPLAY_DETECTED` sigue en el enum y en el `CHECK` de la tabla por los registros históricos, pero desde la V22 **ningún camino lo produce**.

## Detalles técnicos
- Idempotencia respaldada en `idempotency_keys.result_json` (migración **V11**); resultado serializado con Jackson.
- Ubicación persistida como `geography(Point,4326)` (hibernate-spatial/JTS); `validations_json` como `jsonb` (`@JdbcTypeCode(JSON)`).
- Puertos de salida hacia otros BC (QR, geocerca, fraude) vía adaptadores de integración → aplicación testeable con mocks.

## Estado de verificación

| Qué | Cómo | Resultado |
|---|---|---|
| **Backend compila** | `mvn compile` (reactor completo, release 17) | ✅ exit 0 |
| **Lógica del núcleo** | `mvn test` attendance (JUnit + Mockito) | ✅ pasan |
| **Jornada end-to-end** | `AttendanceSequenceIT` (`mvn -pl bootstrap verify`, Testcontainers + PostGIS) | ⚠️ pendiente de ejecutar en CI |

> Las pruebas `*IT` no se ejecutaban: surefire solo recoge `*Test` y **maven-failsafe-plugin no estaba configurado**, así que el `mvn verify` de CI las saltaba en silencio. Ya está añadido a `bootstrap/pom.xml`, de modo que `AttendanceSequenceIT` y `ApplicationSmokeIT` corren en el pipeline.

> **Docker Desktop 29.x en Windows:** Testcontainers no logra conectar con el motor («Could not find a valid Docker environment»); las estrategias por named pipe y por variable de entorno fallan con `HTTP 400` al pedir `/info`. Afecta por igual al `ApplicationSmokeIT` que ya existía, así que es del entorno y no de las pruebas nuevas; subir Testcontainers a 1.20.6 no lo corrige. En CI (`ubuntu-latest`, socket Unix) no se reproduce. Para poder ejecutarlos en local pese a ello, `PostgisIntegrationTest` acepta `-Dit.datasource.url=...` y se conecta a un PostGIS ya levantado (ver [02](02-caso-de-uso-dos-turnos.md)).

> El compile-check atrapó un bug real (uso de `Jwt` sin la dependencia oauth2 en attendance) — se resolvió leyendo tenant/usuario del contexto de seguridad sin acoplar a esa librería.

## Documentos

- [01 — Evidencia fotográfica (RF-18 / HU-13)](01-evidencia-fotografica.md): política por centro con herencia de empresa, subida prefirmada a MinIO y verificación de la evidencia en el servidor.
- [02 — Caso de uso: jornada de dos turnos](02-caso-de-uso-dos-turnos.md): recorrido completo de un día con dos turnos, descanso y cambio de sitio. La secuencia (RN-12) lo aguanta; salen cinco defectos en la ventana de turno y en el cálculo de horas. El más grave —un desfase de huso en `shifts.start_time`— ya está corregido (ver addendum de [ADR-003](../iteracion-02-arquitectura/adr/ADR-003-server-time.md)).

## Criterios de aceptación
- [x] Registro por QR + GPS + geocerca + validaciones + antifraude + hora de servidor.
- [x] Idempotencia (offline-ready) y anti-replay por nonce.
- [x] Persistencia del resultado (aceptado/rechazado + motivo + banderas) y evento de dominio.
- [x] Historial propio del colaborador.
- [x] Pruebas de la lógica del núcleo (5 escenarios) — pasan.
- [ ] Verificación E2E en runtime (pendiente JDK 21 + Docker).

> Siguiente: **Iteración 9 — Sincronización offline** (ingesta por lotes idempotente y resolución de conflictos) + el registro de asistencia en la app Flutter (QR + GPS + cola local Drift).
