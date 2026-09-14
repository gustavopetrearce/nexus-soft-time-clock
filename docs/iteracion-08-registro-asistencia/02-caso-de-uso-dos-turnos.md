# Caso de uso — jornada de dos turnos con descanso y cambio de sitio

**Objetivo:** ejercitar de punta a punta el día que RN-12 declara válido pero que ninguna prueba
cubría: un colaborador con **dos turnos asignados el mismo día**. Cruza las tres capas que hasta
ahora se probaban por separado —secuencia (RN-12), ventana de turno (RN-15/RN-16) y cálculo de horas
(RN-17)—, que no coincidían entre sí. Los cinco hallazgos están corregidos.

Prueba: `backend/bootstrap/src/test/java/com/condor/nexussoft/timeclock/attendance/JornadaDosTurnosIT.java`

## Escenario

Organización con dos centros. Colaborador con dos turnos, ambos con los defaults de
`V4__scheduling.sql` (tolerancia 10 min, ventana ±30 min):

| Turno | Horario | Descanso nominal | Ventana de registro | Asignado en |
|-------|---------|------------------|---------------------|-------------|
| T1 | 08:00–14:00 | 30 min | `[07:30, 14:30]` | Centro A |
| T2 | 14:30–19:00 | 0 min | `[14:00, 19:30]` | Centro A y Centro B |

| Hora  | Evento           | Centro | Resultado | Turno atribuido |
|-------|------------------|--------|-----------|-----------------|
| 08:00 | ENTRADA          | A | ACEPTADO | T1 |
| 11:00 | INICIO_DESCANSO  | A | ACEPTADO | T1 |
| 11:30 | FIN_DESCANSO     | A | ACEPTADO | T1 |
| 14:00 | SALIDA           | A | ACEPTADO | T1 |
| 14:30 | ENTRADA          | A | ACEPTADO | T2 |
| 15:30 | CAMBIO_SITIO     | B | ACEPTADO | T2 |
| 19:00 | SALIDA           | B | ACEPTADO | T2 |

**La secuencia y la ventana de turno sostienen el día entero.** Los siete eventos se aceptan en
orden, el descanso queda emparejado, la segunda ENTRADA se admite tras la SALIDA del primer turno, y
el `CAMBIO_SITIO` traslada el centro de la jornada de forma que la SALIDA final se acepta en el centro
nuevo. Se usa **un solo QR por centro** para todos los eventos, incluido el segundo turno (RN-26). Y
cada marca queda atribuida a su turno pese a que las dos ventanas se solapan entre las 14:00 y las
14:30 (columna de la derecha, ver H2).

Y el día se contabiliza como dos jornadas, no de la primera ENTRADA a la última SALIDA (ver H3).

## Hallazgos

### H1 — Las horas del turno se leen desplazadas por el huso de la JVM · **RESUELTO**

`backend/bootstrap/src/main/resources/application.yml:23` fijaba
`spring.jpa.properties.hibernate.jdbc.time_zone: UTC`. El ajuste está pensado para las marcas de
tiempo, pero Hibernate lo aplica también a las columnas `time` de `shifts`: en una JVM cuyo huso por
defecto no sea UTC, `start_time` y `end_time` llegan al dominio corridos exactamente ese desfase.

Medido con la JVM en `America/Mexico_City` (UTC−6), sobre las mismas filas que la base guarda como
`08:00:00` / `14:00:00`:

```
DIAG asign site=A shift=Turno 1 02:00-08:00 before=30 after=30 tz=UTC
DIAG asign site=A shift=Turno 2 08:30-13:00 before=30 after=30 tz=UTC
DIAG 8:0   A=WITHIN_WINDOW/350      <- ENTRADA puntual marcada con 350 min de retardo
DIAG 14:0  A=OUT_OF_WINDOW
DIAG 14:30 A=OUT_OF_WINDOW
DIAG 19:0  A=OUT_OF_WINDOW
```

Con ese desfase el escenario se cae entero a partir de las 14:00 con `OUT_OF_SCHEDULE`, y las
tardanzas de RN-16 se miden contra una hora de inicio falsa. Queda enmascarado en cualquier
despliegue cuya JVM corra en UTC —y por eso no lo veía nadie—, pero cualquier entorno con otro huso
rechaza fichajes legítimos.

Es el hallazgo más grave de la lista: no depende del escenario de dos turnos, afecta a **toda**
validación de horario.

**Arreglo aplicado.** Se retiró la propiedad. No tenía ningún destinatario legítimo: sirve para
columnas `timestamp` sin zona y el esquema no tiene **ninguna** —las 41 columnas de fecha-hora son
`timestamptz`, mapeadas a `Instant`/`OffsetDateTime`—, mientras que las dos únicas columnas `time`
del esquema son justamente las que corrompía. Entró en el commit inicial `3162c65` sin justificación
y ningún ADR la pedía. Como producción y CI ya corrían en UTC, la propiedad era allí un no-op:
quitarla no cambia comportamiento ni exige migrar datos. (La salvedad va con la condición: si algún
despliegue llegó a correr fuera de UTC, sus filas de `shifts` quedaron guardadas corridas y hay que
corregirlas una vez — se ve de un vistazo con `SELECT name, start_time, end_time FROM shifts`.)

Al medirlo con la prueba de regresión salieron dos detalles que el diagnóstico inicial no tenía:

- El daño va en **las dos direcciones**. Escribiendo por Hibernate un turno de `08:00`, la base
  guardaba `14:00:00`: el dato **en reposo** era incorrecto, no solo la lectura. Que el escenario
  siguiera funcionando en UTC se debía a que escritura y lectura se compensaban; bastaba con que una
  fila entrara por otra vía (un seeder, una migración, el `JdbcTemplate` del IT) para romper la
  simetría.
- Las columnas `date` **no** estaban afectadas: `shift_assignments.valid_from` round-trips intacta
  con y sin la propiedad. El radio de daño era exactamente `shifts.start_time` y `shifts.end_time`.

Además, para que el fallo no pudiera volver a ser invisible:

- `infra/backend.Dockerfile` clava `-Duser.timezone=UTC` en el `ENTRYPOINT`. Hasta ahora el
  contenedor corría en UTC por accidente de la imagen base, y de ese accidente dependen ocho
  `LocalDate.now()` sin zona (fecha de incidencia, antigüedad para vacaciones, rangos por defecto de
  los reportes). Va como flag de JVM y no como variable `TZ` porque `scripts/redeploy.sh` reemplaza
  el entorno del stack entero en cada redespliegue.
- `backend/pom.xml` corre **las pruebas en un huso deliberadamente distinto de UTC**
  (`test.timezone`, hoy `America/Mexico_City`). Que el fallo fuera invisible en CI era la mitad del
  problema.

### H2 — La ENTRADA del segundo turno puede contarse como retardo de 380 minutos · **RESUELTO**

Las ventanas de los dos turnos **se solapan** en `[14:00, 14:30]`:
`ScheduleWindowValidator` es inclusivo en ambos extremos, así que la ventana de T1 llega hasta las
14:30 —la hora de inicio de T2—. Y `SchedulePolicyAdapter.check` se quedaba con la **primera**
asignación cuya ventana casara, iterando una lista que no llevaba `ORDER BY`
(`ShiftAssignmentJpaRepository.findByUserIdAndTenantId`).

Cuando gana T1, la ENTRADA de las 14:30 se mide contra `08:00 + 10 min de tolerancia`:

```
minutesLate = 380     flags = [LATE]
AttendanceRegistered { "eventKind": "ENTRADA", "minutesLate": 380 }
```

Ese evento abre una incidencia `RETARDO` al pasar por `IncidentEventListener:33`. El colaborador
llegó puntual a su turno y acumula un retardo de más de seis horas. Cuál de los dos turnos gana
depende del orden en que Postgres devuelva las filas: el resultado **no es determinista**.

**Arreglo aplicado.** El solape no era el defecto —`window_after_min` existe justamente para dar
margen al cerrar—; el defecto era resolverlo al azar. Faltaba la regla que dijera **a qué turno
pertenece una marca**, y ahora es: el turno cuyo **borde correspondiente al tipo de evento** está más
cerca (`ScheduleWindowValidator.Occurrence.referenceDistanceMinutes`).

| Evento | Se mide contra | En el escenario |
|---|---|---|
| `ENTRADA` | el **inicio** | 14:30 → T2, a 0 min frente a los 390 de T1 |
| `SALIDA` | el **fin** | 14:00 → T1, a 0 min frente a los 300 de T2 |
| intermedios | el **cuerpo** `[inicio, fin]`, 0 si cae dentro | 11:00, 11:30 → T1 · 15:30 → T2 |

Medir la SALIDA contra el fin y no contra el inicio no es un detalle: con "inicio más cercano" para
todo, la SALIDA de las 14:00 —el fin exacto de T1— se habría atribuido a T2, que empieza 30 min
después. A igual distancia gana el turno ya empezado y, en último término, el id del turno: la
decisión no puede depender del orden de las filas.

Con eso, la ENTRADA de las 14:30 es de T2 y llega puntual: sin bandera `LATE`, sin incidencia. Y
elegir bien no perdona la tardanza real: a las 15:00 sigue saliendo `LATE` con 20 min sobre la
tolerancia de T2.

**El turno elegido se persiste.** `attendance_records.shift_id` existía desde `V6__attendance.sql:18`
y nunca se había escrito; ahora se graba en todas las marcas, también en las rechazadas. Hace
auditable el retardo —se sabe contra qué inicio se midió— y es el dato que H3 necesita para partir el
día por turno. No hizo falta migración.

De propina, `findByUserIdAndTenantId` pasa a llevar orden explícito. No es lo que hace correcto el
arreglo —la selección ya es determinista por construcción—, pero deja estable la respuesta de
`GET /api/v1/shift-assignments`, que variaba entre llamadas.

### H3 — El reporte de horas colapsa el día de dos turnos · **RESUELTO**

`AttendanceSummaryService` agregaba el día como `max(SALIDA) − min(ENTRADA)` y descontaba el
`break_minutes` **nominal** de una sola asignación, la que ganara el `DISTINCT ON (sa.user_id)`. Ni
partía el día por jornada ni miraba los eventos de descanso reales.

| | Real | Reportado |
|---|---|---|
| Trabajadas | **600 min** (330 en T1 + 270 en T2) | **630 min** |
| Extras | **0 min** | **300 min** |

Las 660 min brutas incluyen el hueco de 14:00 a 14:30 entre turnos; de ahí se resta el descanso
nominal de T1 (30 min, el turno que ganó el `DISTINCT ON`), no los 30 min de descanso realmente
marcados —que coinciden por casualidad—. Y las extras se miden contra la jornada neta de **ese único
turno** (330 min), como si el día hubiera sido de uno solo.

Contradecía RN-17 ("se calculan entre ENTRADA y SALIDA descontando descansos") y RN-12 ("un mismo día
admite varios turnos") a la vez. Los eventos `INICIO_DESCANSO`/`FIN_DESCANSO` se validaban y se
persistían pero **no entraban en ningún cálculo**.

**Arreglo aplicado.** La unidad de cálculo pasa a ser la **jornada**: cada ENTRADA abre una y la
SALIDA que le sigue la cierra. Un día con dos turnos son dos jornadas, y el hueco entre ellas deja de
contar. Las marcas se agrupan con un contador acumulado de ENTRADAs por ventana
(`count(*) FILTER (WHERE event_type = 'ENTRADA') OVER (PARTITION BY user_id ORDER BY server_time)`),
que cambia de valor justo en cada ENTRADA.

Sobre esa base:

- **Descansos reales.** Se resta lo marcado (`INICIO_DESCANSO` → `FIN_DESCANSO`), no el
  `break_minutes` del turno. Como RN-12 garantiza que los descansos van emparejados —no admite dos
  `INICIO_DESCANSO` seguidos ni una SALIDA con descanso abierto—, basta restar la suma de los
  instantes de fin menos la de los de inicio; no hace falta casar cada par.
- **Extras por turno.** Cada jornada se compara contra la jornada neta de **su** turno
  (`attendance_records.shift_id`, que se persiste desde el arreglo de H2) y se suman los excedentes.
  Salir antes de un turno no compensa quedarse de más en otro.
- **La jornada se fecha por su ENTRADA.** De regalo, esto arregla el turno nocturno: antes la ENTRADA
  caía en un día UTC y la SALIDA en el siguiente, así que ninguno de los dos tenía el par completo y
  el turno entero contaba como **0 h**.

| | Real | Antes | Ahora |
|---|---|---|---|
| Trabajadas | 600 min | 630 min | **600 min** |
| Extras | 0 min | 300 min | **0 min** |

Dos efectos colaterales del cambio, ambos buscados: los días esperados se acotan ahora con el rango
completo de asignaciones del colaborador (`min(valid_from)`, `max(valid_to)`) en vez de con "la
asignación más reciente", que entre empates era una elección arbitraria; y el centro de respaldo para
quien no tiene marcas en el rango se elige de forma determinista.

**Ojo al desplegar:** las horas del histórico cambian. Un día con dos turnos baja (deja de contarse el
hueco), un turno nocturno sube de 0 a sus horas reales, y una empresa que tenga los eventos de
descanso deshabilitados verá subir las horas en el importe del descanso nominal que antes se restaba
a ciegas.

### H4 — `CAMBIO_SITIO` no reparte las horas por centro · **RESUELTO**

El reporte atribuía el periodo entero al último centro marcado (CTE `last_site`): salía
**Centro B**, donde el colaborador terminó el día, aunque la mayor parte del tiempo fue en A. Ese CTE
además era `DISTINCT ON (user_id)` sobre **todo el rango** —con 30 días, el centro de la última marca
del mes— y **no filtraba por `status`**, así que una marca rechazada en otra sede decidía la columna.
Y no había forma de consultar el reparto: ningún endpoint exponía horas por centro.

El reparto real de las 10 h del escenario es **6,5 h en A** (390 min) y **3,5 h en B** (210 min).

> Una versión anterior de este documento decía "7,5 h en A y 3,5 h en B". Eso era tiempo
> *transcurrido*, no trabajado: contaba el descanso de 30 min y el hueco de 14:00 a 14:30 entre
> turnos.

**Arreglo aplicado.** Cada marca abre un **tramo** que dura hasta la siguiente, y el centro del tramo
es el de la marca que lo abre. Un tramo cuenta como trabajado si lo abre un evento de trabajo
—`ENTRADA`, `FIN_DESCANSO` o `CAMBIO_SITIO`—, que es exactamente el `isWorking()` de
`AttendanceSequenceValidator`: el que abre `INICIO_DESCANSO` es el descanso, y tras la `SALIDA` no hay
nada.

El reparto es válido porque RN-12 ya garantiza que los tramos de una jornada son **contiguos y sin
solape**: `CAMBIO_SITIO` es el único evento que mueve el centro, y la SALIDA y los descansos exigen
registrarse donde la jornada está abierta, así que un descanso nunca queda a caballo de un cambio de
sitio. Puede haber N cambios por jornada, y los tramos del mismo centro se suman.

Sobre esos tramos:

- **La columna `workCenter`** pasa a ser el centro con **más horas** en el rango, no el último
  marcado. Se desempata por la marca más reciente, con lo que degrada al comportamiento anterior
  cuando no hay horas (jornadas abandonadas). De regalo deja de contar marcas rechazadas, porque sale
  del mismo pipeline que exige `ACCEPTED`.
- **Endpoint nuevo `GET /api/v1/reports/hours-by-site?from&to`** con el desglose: un colaborador
  aparece tantas veces como centros en los que trabajó.
- **Las extras se imputan al centro donde se produjeron**: son los últimos minutos trabajados de la
  jornada, así que se reparten recorriendo los tramos desde el final. Si el excedente cabe en el
  último tramo va entero ahí; si lo desborda, el resto sube al anterior.

Los CTEs de tramos viven una sola vez (`JourneySegmentsSql`) y los usan tanto el resumen como el
desglose, así que **la suma de los centros cuadra siempre con el total del resumen** — hay una prueba
dedicada a ese invariante.

La forma del reporte agregado **no cambia**: sigue siendo una fila por colaborador con `workCenter`
escalar, así que la pantalla, su orden/filtro y el export del cliente quedan intactos. El endpoint
nuevo aún no tiene pantalla; queda listo para consumirse.

### H5 — La ventana del turno rechaza también las SALIDA · **RESUELTO**

`RegisterAttendanceService` evaluaba `OUT_OF_SCHEDULE` para **todos** los tipos de evento, sin ningún
filtro —en contraste con el paso justo debajo, que sí lo tiene para la bandera `LATE`—. Una SALIDA a
las 19:45, pasada la ventana de T2, se rechazaba:

```
status = REJECTED     rejectionReason = OUT_OF_SCHEDULE
```

El colaborador que se retrasaba al cerrar se quedaba **sin poder cerrar la jornada**, y esa jornada
abierta solo se desatascaba cuando caducaba por `open_shift_max_hours` (RN-12). En el móvil veía
*"Registro rechazado: fuera del horario del turno."*, sin decirle que la jornada seguía abierta ni qué
hacer.

**Arreglo aplicado.** La ventana gobierna **cuándo se puede abrir** la jornada, así que solo rechaza la
`ENTRADA` —RN-10 la exige dentro de ventana para que el registro sea válido—. SALIDA, descansos y
cambio de sitio se aceptan.

Es además lo que dice RN-15 al pie de la letra: *"La **ventana de registro de entrada** admite
tolerancia configurable… Registro fuera de ventana → **incidencia** (retardo/anticipo) según política,
**no necesariamente rechazo**."*

- La marca fuera de ventana lleva **siempre** la bandera `OUT_OF_SCHEDULE` en `validations_json`,
  también cuando además se rechaza. Es el mismo patrón que ya usa `QR_EXPIRED`: la bandera documenta lo
  que pasó, el motivo decide.
- El evento `AttendanceRegistered` gana un `outOfWindow`, que es por donde la marca aceptada llega a
  incidencias: `minutesLate` no servía, porque fuera de ventana es 0 por construcción.
- **Incidencia nueva `FUERA_DE_VENTANA`** (migración `V24`), `OPEN` y prioridad `LOW`. Hacía falta un
  tipo propio: `RETARDO` está reservado a la ENTRADA tardía *dentro* de ventana (RN-16), y `FALTA`/`OTRO`
  no los emite nadie. Sin ella, aceptar la marca habría hecho **perder** al supervisor la señal que
  antes le daba el rechazo.

Queda fuera la otra mitad de lo que insinúa RN-15 ("según política"): que la empresa elija si la
ENTRADA fuera de ventana se rechaza o solo se marca. El patrón `REJECT|FLAG` ya está montado —cuatro
columnas de `company_settings` lo usan, con su DTO, endpoint y toggle en ajustes—, así que es un
añadido acotado si el negocio lo pide.

### H6 — La ventana se evalúa en UTC cuando el horario no fija zona · **RESUELTO**

Lo levantó un caso de producción: **CN-000234**, dos turnos —3 · 14:00–17:10 y 4 · 17:15–23:30—, una
ENTRADA el 2026-09-14 a las **13:29:12 hora local** y una incidencia `RETARDO` de **124 minutos**.

`SchedulePolicyAdapter.zoneForShift` solo leía `schedules.timezone` y, a falta de ella, caía a UTC.
El esquema documenta lo contrario desde el principio —`V4__scheduling.sql:10`: *"override; si NULL
hereda del centro/tenant"*—, y las columnas están ahí: `work_sites.timezone` (V3) y
`companies.timezone NOT NULL DEFAULT 'UTC'` (V1). Solo faltaba el código, y el formulario web dejaba
la zona del horario como campo opcional en blanco, así que crear un horario sin zona era el camino
por defecto.

Con la empresa a UTC−6, el instante real de la marca es `19:29:12` UTC, y se comparó contra las horas
de pared de los turnos como si fueran UTC:

| Turno | Ventana `[inicio−30, fin+30]` | ¿Contiene 19:29:12? |
|---|---|---|
| 3 · 14:00–17:10 | `[13:30, 17:40]` | No |
| 4 · 17:15–23:30 | `[16:45, 00:00]` | **Sí** |

```
lateThreshold = 17:15 + 10 (late_tolerance_min)  = 17:25:00
minutesLate   = 19:29:12 − 17:25:00 = 2 h 04 m 12 s  →  124
```

Cuadra al segundo, y −6 h es el único desfase que da 124. Las dos asignaciones son un espejismo: con
el desfase el turno 3 también queda fuera de ventana, así que el turno 4 gana sin que llegue a
ejecutarse el desempate de H2.

**Arreglo aplicado.** Un puerto propio, `ShiftZonePort`, con un adaptador que baja la cadena
**horario → centro → empresa → UTC** en una sola consulta. Se lee por JDBC y no con los casos de uso
de Scheduling/Organization por la misma razón que el resto del adaptador: una consulta que no
encuentra fila no lanza, y un `orElseThrow` dentro de la transacción del registro la marcaría
rollback-only. El centro que manda en la herencia es el de la **asignación**, no el de la marca: es
donde se trabaja ese turno.

En hora local esa marca no la reclama ningún turno —llega 48 segundos antes de que abra la ventana
del turno 3— y se rechaza con `OUT_OF_SCHEDULE`. El colaborador llegó 31 min antes de su turno con
`window_before_min` en 30; el rechazo es honesto, el retardo de dos horas contra un turno que aún no
había empezado, no.

### H7 — Un turno cuya ventana aún no ha abierto no competía por la marca · **RESUELTO**

Sobrevive al arreglo de H6 y produce el mismo síntoma por otro camino. `SchedulePolicyAdapter`
filtraba la **candidatura** por la ventana: solo entraban al desempate de H2 los turnos cuya ventana
ya contenía la marca. Quien llegaba a su turno antes de que abriera la suya —más de
`window_before_min`— veía la marca atribuida al turno anterior, todavía dentro de su `window_after`.

Con los turnos del caso, una ENTRADA a las **16:30**: la ventana del turno 4 abre a las 16:45, la del
turno 3 cierra a las 17:40. El turno 3 era el único candidato y se llevaba la marca con **140 min** de
retardo contra su inicio de las 14:00.

**Arreglo aplicado.** Las dos preguntas se separan. `ScheduleWindowValidator.candidateOccurrences`
enumera las apariciones del turno —ayer, hoy y mañana— sin mirar la ventana, compiten todas las de
todos los turnos vigentes con el mismo criterio de cercanía de H2, y la ventana se comprueba
**después**, sobre la que gana. Fuera de ventana, la ENTRADA se rechaza con `OUT_OF_SCHEDULE` en vez
de convertirse en un retardo contra otro turno.

- `ScheduleDecision.outOfWindow` pasa a llevar el `shiftId`, así que `attendance_records.shift_id`
  queda grabado también en el rechazo: se ve contra qué turno se midió, que es lo que hacía tan
  opaco el diagnóstico de este caso.
- La vigencia de la asignación se mide contra la **fecha de la jornada** (`Occurrence.businessDate`)
  y no contra la del reloj: un turno nocturno fichado de madrugada pertenece al día en que arrancó, y
  antes se validaba contra el día siguiente en el último día de su vigencia.
- `window_before_min` y `window_after_min` se exponen por fin en el formulario de turnos, y la zona
  del horario pasa a ser obligatoria con la del navegador precargada. Sin lo primero no había forma
  de ensanchar el margen desde la aplicación; sin lo segundo, H6 se repite en el próximo horario.

## Cobertura añadida

`JornadaDosTurnosIT` (7 pruebas, contra PostgreSQL real con las migraciones aplicadas):

| Prueba | Qué fija |
|---|---|
| `jornadaDeDosTurnos_conDescansoYCambioDeSitio_seAceptaCompleta` | Los 7 eventos en orden, 5 en A y 2 en B, un QR por centro |
| `entradaAlInicioDelSegundoTurno_noSeMideContraElPrimero` | H2: la marca del solape va a T2, sin retardo ni incidencia |
| `entradaTardiaAlSegundoTurno_sigueMarcandoRetardo` | Que elegir bien el turno no perdone la tardanza real |
| `reporteDeHoras_deUnDiaDeDosTurnos_cuentaCadaJornadaPorSeparado` | H3: 10 h, 0 extras y el centro con más horas |
| `desgloseDeHorasPorCentro_reparteLaJornadaPartida` | H4: 6,5 h en A y 3,5 h en B |
| `salidaFueraDeLaVentanaDelTurno_seAceptaYQuedaMarcada` | H5: la SALIDA tardía cierra la jornada y queda marcada |
| `entradaFueraDeLaVentanaDelTurno_seRechaza` | Que la ENTRADA sí se sigue rechazando fuera de ventana |

`SchedulePolicyAdapterTest` suma cinco pruebas con los turnos reales del caso (3 · 14:00–17:10 y
4 · 17:15–23:30, defaults 10 / 30 / 30):

| Prueba | Qué fija |
|---|---|
| `turnosReales_marcaSeEvaluaEnLaZonaDelCentro_noEnUtc` | H6: en hora local la marca de las 13:29:12 no la reclama el turno de la noche |
| `turnosReales_enUtc_reproduceElRetardoDe124Minutos` | El retardo de producción, tal cual, como testigo de la causa |
| `entradaAnticipadaAlSegundoTurno_noLaReclamaElPrimeroConUnRetardoFantasma` | H7: a las 16:30 gana el turno 4, sin los 140 min contra el 3 |
| `entradaAnticipadaAlSegundoTurno_conVentanaPreviaAncha_seAceptaPuntual` | Que ensanchar `window_before_min` resuelve el caso de negocio |
| `turnosReales_entradaTardiaAlSegundoTurno_mideContraSuInicio` | Que elegir bien el turno no perdona la tardanza real |

`ShiftZoneInheritanceIT` (9 pruebas, contra PostgreSQL real) fija la cadena de H6 nivel a nivel:
horario → centro → empresa → UTC, con los casos de cadena vacía, zona mal escrita, horario
inexistente y horario de otro tenant.

Ya no queda ninguna prueba de caracterización: las que fijaban un comportamiento incorrecto se
reescribieron al arreglar su hallazgo.

`AttendanceSummaryIT` (9 pruebas) guarda el arreglo de H3 contra el SQL real, con los casos que el
escenario no da: un descanso más largo y otro más corto que el nominal, dos jornadas el mismo día sin
turno, un turno nocturno que cruza la medianoche, extras que no se compensan entre turnos, una jornada
sin SALIDA y marcas rechazadas. Dos de sus casos cubren H4: que el centro de la fila es el de más
horas, y que una marca rechazada en otra sede no lo decide.

`SiteHoursIT` (8 pruebas) guarda el desglose de H4: el reparto de la jornada partida, el descanso
restado del tramo en que ocurre, la ida y vuelta que suma tramos del mismo centro, las extras
imputadas donde se produjeron —incluido el caso en que desbordan el último tramo—, la jornada sin
SALIDA que no aparece, y el **invariante de que la suma del desglose cuadra con el resumen**.

`SchedulePolicyAdapterTest` (10 pruebas, sin base de datos) guarda el arreglo de H2: recorre la
matriz de atribución, incluida la comprobación de que **alimentar la lista de asignaciones en los dos
órdenes da el mismo resultado**, que es lo que el fallo original no cumplía.

`ShiftTimeZoneRoundTripIT` (5 pruebas) guarda el arreglo de H1: que la hora de un turno sea la misma
al escribirla, en reposo y al leerla, venga de Hibernate o de SQL crudo. Su primera prueba comprueba
que la JVM **no** corre en UTC, para que el resto no se vuelva mudo si alguien quita `test.timezone`
del pom.

Infraestructura de soporte, en `bootstrap/src/test/java/.../support/`:

- `MutableClock` — reloj de servidor movible. Hacía falta uno de verdad: aquí la hora gobierna a la
  vez el `server_time`, la ventana del turno y la fecha de la incidencia, así que el truco de
  `AttendanceSequenceIT` (mover `server_time` por SQL después de registrar) no alcanza.
- `PostgisIntegrationTest` — contenedor PostGIS único por JVM, compartido por todos los ITs que lo
  extiendan (`AttendanceSequenceIT` ya lo hace).

## Cómo ejecutarla

```bash
cd backend && mvn -pl bootstrap -am verify -Dit.test=JornadaDosTurnosIT -DfailIfNoSpecifiedTests=false
```

Testcontainers **no negocia la versión de API con Docker Desktop 29 en Windows** —la estrategia de
named pipe recibe un 400 y ni `TESTCONTAINERS_RYUK_DISABLED`, ni `DOCKER_HOST` explícito, ni subir a
Testcontainers 1.20.6 lo resuelven—. Para eso `PostgisIntegrationTest` acepta un PostGIS ya
levantado; apuntar siempre a una base **desechable**, porque las pruebas escriben en ella:

```bash
docker exec <postgres> psql -U <admin> -c "CREATE DATABASE nstc_it;"
docker exec <postgres> psql -U <admin> -d nstc_it -c "CREATE EXTENSION postgis;"

cd backend && mvn -o -pl bootstrap failsafe:integration-test \
  -Dit.test=JornadaDosTurnosIT -DfailIfNoSpecifiedTests=false \
  -Dtest.extraArgs="-Dit.datasource.url=jdbc:postgresql://localhost:5432/nstc_it \
                    -Dit.datasource.username=<user> -Dit.datasource.password=<pass>"
```

Las propiedades puntuales de JVM van por `test.extraArgs` y no sobrescribiendo `argLine`, que el pom
usa para el agente de jacoco y para el huso de las pruebas. **No** hay que forzar `-Duser.timezone`:
el pom pone a propósito un huso distinto de UTC, y que la prueba pase ahí es lo que demuestra que H1
está resuelto.
