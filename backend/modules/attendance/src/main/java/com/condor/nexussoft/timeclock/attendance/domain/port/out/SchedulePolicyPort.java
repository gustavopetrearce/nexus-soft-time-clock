package com.condor.nexussoft.timeclock.attendance.domain.port.out;

import com.condor.nexussoft.timeclock.attendance.domain.AttendanceEventType;

import java.time.Instant;
import java.util.UUID;

/** Evalúa si el registro cae dentro de la ventana del turno asignado al colaborador (RN-15). */
public interface SchedulePolicyPort {

    /**
     * @param eventType decide contra qué borde del turno se mide la marca cuando varias ventanas se
     *                  solapan: la ENTRADA contra el inicio, la SALIDA contra el fin, los
     *                  intermedios contra el cuerpo.
     */
    ScheduleDecision check(UUID tenantId, UUID userId, UUID workSiteId, AttendanceEventType eventType, Instant at);

    enum Outcome {
        /** El colaborador no tiene turno asignado vigente en ese centro → sin restricción horaria. */
        NO_SCHEDULE,
        /** Hay turno asignado y el registro cae dentro de su ventana. */
        WITHIN_WINDOW,
        /** Hay turno asignado pero el registro cae fuera de la ventana → OUT_OF_SCHEDULE. */
        OUT_OF_WINDOW
    }

    /**
     * Resultado de la evaluación horaria. {@code minutesLate} es la tardanza sobre
     * {@code inicio_turno + tolerancia} de la ocurrencia elegida (RN-16); es 0 salvo que la marca
     * sea posterior a la tolerancia. Solo tiene sentido para ENTRADA dentro de ventana.
     * {@code shiftId} es el turno al que se atribuye la marca —también cuando cae fuera de su
     * ventana, para que el rechazo diga contra qué turno se midió— y es {@code null} solo cuando el
     * colaborador no tiene ninguno vigente.
     */
    record ScheduleDecision(Outcome outcome, int minutesLate, UUID shiftId) {

        public static ScheduleDecision noSchedule() {
            return new ScheduleDecision(Outcome.NO_SCHEDULE, 0, null);
        }

        public static ScheduleDecision outOfWindow(UUID shiftId) {
            return new ScheduleDecision(Outcome.OUT_OF_WINDOW, 0, shiftId);
        }

        public static ScheduleDecision withinWindow(int minutesLate, UUID shiftId) {
            return new ScheduleDecision(Outcome.WITHIN_WINDOW, Math.max(0, minutesLate), shiftId);
        }
    }
}
