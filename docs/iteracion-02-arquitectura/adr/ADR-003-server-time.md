# ADR-003 — Hora del servidor como autoridad temporal

**Estado:** Aceptado · **Fecha:** 2026-07-21

## Contexto
La hora del dispositivo es manipulable (fraude) y difiere entre equipos. La asistencia requiere un timestamp confiable (RF-17, RN-11).

## Decisión
El **timestamp oficial** de todo registro es la **hora del servidor** al procesarlo (UTC en almacenamiento; zona del centro/tenant para cálculo y presentación, RNF-19). La hora del dispositivo se guarda solo como **metadato** para diagnóstico/antifraude (detectar desfase sospechoso). Para registros **offline**, el servidor fija la hora al **sincronizar** y conserva la hora local declarada como referencia; discrepancias grandes generan bandera/incidencia.

## Addendum — 2026-08-27: cómo se sostiene el "UTC" en la capa de persistencia

Esta decisión se cumple con tres piezas, y **`hibernate.jdbc.time_zone` no es ninguna de ellas**:

1. El instante oficial lo da `Clock.systemUTC()` (`IdentityBeansConfig.serverClock`), inyectado en
   todos los servicios. No depende del huso de la JVM.
2. Se almacena en columnas `timestamptz` mapeadas a `Instant`/`OffsetDateTime`, que son instantes
   absolutos: el esquema no tiene una sola columna `timestamp` sin zona.
3. La zona de negocio para calcular turnos y presentar (RNF-19) sale del dato, no del entorno:
   `schedules.timezone` con herencia de `work_sites`/`companies`, resuelta en `ShiftZonePort` /
   `ShiftZoneAdapter` y consumida por `SchedulePolicyAdapter`. Esa herencia estuvo **documentada aquí
   pero no implementada** hasta el hallazgo H6 del [caso de uso de dos
   turnos](../../iteracion-08-registro-asistencia/02-caso-de-uso-dos-turnos.md): el código caía a UTC
   en cuanto el horario no fijaba zona, y con una empresa a UTC−6 eso desplazaba seis horas la
   ventana de registro. La guarda hoy `ShiftZoneInheritanceIT`, nivel a nivel.

`application.yml` fijaba además `spring.jpa.properties.hibernate.jdbc.time_zone: UTC`, heredado del
commit inicial sin justificación. Ese ajuste solo tiene sentido para columnas `timestamp` sin zona
—de las que no hay ninguna— y a cambio se aplicaba a las dos únicas columnas `time` del esquema,
`shifts.start_time` y `shifts.end_time`, que son **hora de pared** del centro y no instantes. En una
JVM fuera de UTC, un turno de `08:00–14:00` se guardaba como `14:00–20:00` y se leía como
`02:00–08:00`: escritura y lectura se compensaban, pero cualquier fila que entrara por otra vía
(seeder, migración, SQL crudo) quedaba corrida, y con ella se rechazaban fichajes legítimos por
`OUT_OF_SCHEDULE` y se calculaban retardos contra una hora falsa (RN-15, RN-16). Diagnóstico completo
en [el caso de uso de dos turnos](../../iteracion-08-registro-asistencia/02-caso-de-uso-dos-turnos.md).

**Decisión:** la propiedad se retira y no debe reintroducirse. Para que el descuido no vuelva a pasar
inadvertido, el runtime fija `-Duser.timezone=UTC` en el `ENTRYPOINT` (antes corría en UTC solo por
accidente de la imagen base, del que dependen los `LocalDate.now()` sin zona) y **las pruebas corren
en un huso deliberadamente distinto de UTC** (`test.timezone` en `backend/pom.xml`), con
`ShiftTimeZoneRoundTripIT` guardando el round-trip.

## Consecuencias
- ➕ Integridad temporal a prueba de manipulación del dispositivo.
- ➕ Consistencia entre dispositivos y husos.
- ➖ Registros offline no reflejan la hora exacta del evento físico → se documenta la política y se marca el desfase; se conserva la hora declarada para auditoría.
- ➖ Requiere NTP fiable en servidores.
