package com.condor.nexussoft.timeclock.attendance.domain;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

/**
 * Sitúa un instante (ya convertido a la zona del turno) dentro del calendario de un turno.
 *
 * <p>Dos preguntas distintas, y conviene no mezclarlas: <b>a qué aparición del turno pertenece</b>
 * una marca —{@link #candidateOccurrences}, que las enumera todas— y <b>si cae en su ventana de
 * registro</b> (RN-15) {@code [inicio - windowBefore, fin + windowAfter]}
 * —{@link Occurrence#withinWindow}. Resolver la primera filtrando por la segunda hacía que un turno
 * cuya ventana aún no ha abierto no compitiera, y la marca se la quedara otro turno con la ventana
 * todavía abierta, midiendo la entrada contra un inicio de horas antes.</p>
 */
public final class ScheduleWindowValidator {

    private ScheduleWindowValidator() {
    }

    /**
     * Una aparición concreta del turno en el calendario: sus dos bordes ya fechados. Es lo que hace
     * falta para decidir <b>a qué turno pertenece</b> una marca cuando dos turnos se disputan.
     */
    public record Occurrence(LocalDateTime start, LocalDateTime end) {

        /**
         * Distancia de la marca al punto del turno que le corresponde según el tipo de evento: una
         * ENTRADA se mide contra el inicio, una SALIDA contra el fin, y los intermedios contra el
         * cuerpo del turno (0 si caen dentro). Es el criterio de desempate entre turnos solapados:
         * gana el más cercano.
         */
        public long referenceDistanceMinutes(AttendanceEventType eventType, LocalDateTime now) {
            return switch (eventType) {
                case ENTRADA -> absMinutes(start, now);
                case SALIDA -> absMinutes(end, now);
                case INICIO_DESCANSO, FIN_DESCANSO, CAMBIO_SITIO -> distanceToBody(now);
            };
        }

        /** Si la ocurrencia ya había empezado: desempata de forma estable hacia el turno en curso. */
        public boolean startedBy(LocalDateTime now) {
            return !now.isBefore(start);
        }

        /** La ventana de registro de esta aparición (RN-15). Inclusiva en ambos extremos. */
        public boolean withinWindow(int windowBeforeMin, int windowAfterMin, LocalDateTime now) {
            return !now.isBefore(start.minusMinutes(windowBeforeMin))
                    && !now.isAfter(end.plusMinutes(windowAfterMin));
        }

        /**
         * Día al que pertenece la jornada. Es la fecha contra la que se mide la vigencia de la
         * asignación: un turno nocturno fichado de madrugada sigue siendo el del día que arrancó.
         */
        public LocalDate businessDate() {
            return start.toLocalDate();
        }

        private long distanceToBody(LocalDateTime now) {
            if (now.isBefore(start)) {
                return absMinutes(start, now);
            }
            return now.isAfter(end) ? absMinutes(end, now) : 0L;
        }

        private static long absMinutes(LocalDateTime a, LocalDateTime b) {
            return Math.abs(Duration.between(a, b).toMinutes());
        }
    }

    /**
     * Las apariciones del turno que pueden reclamar una marca de {@code now}: la de ayer, la de hoy
     * y la de mañana. Se enumeran las tres siempre —no sólo en los turnos nocturnos— porque el
     * criterio de cercanía necesita ver el turno que aún no ha empezado para no atribuir la marca al
     * de ayer; en un turno diurno las de los extremos quedan a más de un día y nunca ganan.
     */
    public static List<Occurrence> candidateOccurrences(LocalTime start, LocalTime end,
                                                        boolean crossesMidnight, LocalDateTime now) {
        LocalDate today = now.toLocalDate();
        return List.of(
                occurrenceFor(today, start, end, crossesMidnight),
                occurrenceFor(today.minusDays(1), start, end, crossesMidnight),
                occurrenceFor(today.plusDays(1), start, end, crossesMidnight));
    }

    public static boolean withinWindow(LocalTime start, LocalTime end, boolean crossesMidnight,
                                       int windowBeforeMin, int windowAfterMin, LocalDateTime now) {
        return matchedOccurrence(start, end, crossesMidnight, windowBeforeMin, windowAfterMin, now).isPresent();
    }

    /**
     * La aparición cuya ventana contiene a {@code now}, con sus dos bordes fechados, o vacío si
     * ninguna la contiene. Prevalece la de hoy sobre la de ayer y la de mañana, que es lo que
     * mantiene abierto el turno nocturno arrancado anoche cuando se ficha de madrugada.
     */
    public static Optional<Occurrence> matchedOccurrence(LocalTime start, LocalTime end, boolean crossesMidnight,
                                                        int windowBeforeMin, int windowAfterMin, LocalDateTime now) {
        return candidateOccurrences(start, end, crossesMidnight, now).stream()
                .filter(o -> o.withinWindow(windowBeforeMin, windowAfterMin, now))
                .findFirst();
    }

    private static Occurrence occurrenceFor(LocalDate startDate, LocalTime start, LocalTime end,
                                            boolean crossesMidnight) {
        LocalDate endDate = crossesMidnight ? startDate.plusDays(1) : startDate;
        return new Occurrence(startDate.atTime(start), endDate.atTime(end));
    }
}
