package com.condor.nexussoft.timeclock.attendance.domain;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Optional;

/**
 * Determina si un instante (ya convertido a la zona del turno) cae dentro de la <b>ventana de
 * registro</b> de un turno (RN-15): {@code [inicio - windowBefore, fin + windowAfter]}.
 * Para turnos que cruzan medianoche se evalúa tanto la ocurrencia que empieza hoy como la que
 * empezó ayer (un turno nocturno abierto anoche sigue vigente en la madrugada).
 */
public final class ScheduleWindowValidator {

    private ScheduleWindowValidator() {
    }

    /**
     * Una aparición concreta del turno en el calendario: sus dos bordes ya fechados. Es lo que hace
     * falta para decidir <b>a qué turno pertenece</b> una marca cuando dos ventanas se solapan.
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

    public static boolean withinWindow(LocalTime start, LocalTime end, boolean crossesMidnight,
                                       int windowBeforeMin, int windowAfterMin, LocalDateTime now) {
        return matchedOccurrence(start, end, crossesMidnight, windowBeforeMin, windowAfterMin, now).isPresent();
    }

    /**
     * Devuelve el {@code inicio} (fecha+hora) de la ocurrencia del turno cuya ventana contiene a
     * {@code now}, o vacío si {@code now} no cae en ninguna ventana. Sirve para medir la tardanza
     * respecto al inicio real de la jornada (RN-16), respetando turnos que cruzan medianoche.
     */
    public static Optional<LocalDateTime> matchedStart(LocalTime start, LocalTime end, boolean crossesMidnight,
                                                       int windowBeforeMin, int windowAfterMin, LocalDateTime now) {
        return matchedOccurrence(start, end, crossesMidnight, windowBeforeMin, windowAfterMin, now)
                .map(Occurrence::start);
    }

    /** La ocurrencia cuya ventana contiene a {@code now}, con sus dos bordes fechados. */
    public static Optional<Occurrence> matchedOccurrence(LocalTime start, LocalTime end, boolean crossesMidnight,
                                                        int windowBeforeMin, int windowAfterMin, LocalDateTime now) {
        LocalDate today = now.toLocalDate();
        Optional<Occurrence> deHoy = occurrenceFor(today, start, end, crossesMidnight,
                windowBeforeMin, windowAfterMin, now);
        if (deHoy.isPresent() || !crossesMidnight) {
            return deHoy;
        }
        return occurrenceFor(today.minusDays(1), start, end, true, windowBeforeMin, windowAfterMin, now);
    }

    private static Optional<Occurrence> occurrenceFor(LocalDate startDate, LocalTime start, LocalTime end,
                                                      boolean crossesMidnight, int beforeMin, int afterMin,
                                                      LocalDateTime now) {
        LocalDateTime occurrenceStart = startDate.atTime(start);
        LocalDate endDate = crossesMidnight ? startDate.plusDays(1) : startDate;
        LocalDateTime occurrenceEnd = endDate.atTime(end);

        boolean dentro = !now.isBefore(occurrenceStart.minusMinutes(beforeMin))
                && !now.isAfter(occurrenceEnd.plusMinutes(afterMin));
        return dentro ? Optional.of(new Occurrence(occurrenceStart, occurrenceEnd)) : Optional.empty();
    }
}
