package com.condor.nexussoft.timeclock.incidents.infrastructure;

import com.condor.nexussoft.timeclock.attendance.domain.event.AttendanceCancelled;
import com.condor.nexussoft.timeclock.attendance.domain.event.AttendanceRegistered;
import com.condor.nexussoft.timeclock.attendance.domain.event.AttendanceRejected;
import com.condor.nexussoft.timeclock.incidents.domain.port.in.IncidentManagementUseCase;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Reglas de negocio automatizadas (event-driven) para RR.HH./supervisor (RF-09):
 * cada rechazo de asistencia abre una incidencia REGISTRO_RECHAZADO, cada ENTRADA aceptada con
 * retardo (RN-16) abre una incidencia RETARDO, y cada marca aceptada fuera de la ventana del turno
 * (RN-15) abre una FUERA_DE_VENTANA. Una ENTRADA aceptada sin turno vigente abre una SIN_TURNO.
 * Cancelar una marca (V31) resuelve las incidencias que siguieran abiertas por ella.
 */
@Component
public class IncidentEventListener {

    private static final String ENTRADA = "ENTRADA";

    private final IncidentManagementUseCase incidents;

    public IncidentEventListener(IncidentManagementUseCase incidents) {
        this.incidents = incidents;
    }

    @EventListener
    public void onAttendanceRejected(AttendanceRejected event) {
        incidents.openForRejectedAttendance(event.tenantId(), event.userId(),
                event.attendanceId(), event.reason());
    }

    @EventListener
    public void onAttendanceRegistered(AttendanceRegistered event) {
        if (ENTRADA.equals(event.eventKind()) && event.minutesLate() > 0) {
            incidents.openForLateArrival(event.tenantId(), event.userId(),
                    event.attendanceId(), event.minutesLate());
        }
        // Excluyente con el retardo: aquel exige estar DENTRO de la ventana.
        if (event.outOfWindow()) {
            incidents.openForOutOfWindow(event.tenantId(), event.userId(),
                    event.attendanceId(), event.eventKind());
        }
        // Solo la ENTRADA: es la que abre la jornada sin horario, y basta una incidencia por jornada.
        // Excluyente con las dos anteriores, que exigen turno.
        if (ENTRADA.equals(event.eventKind()) && event.noSchedule()) {
            incidents.openForNoSchedule(event.tenantId(), event.userId(), event.attendanceId());
        }
    }

    @EventListener
    public void onAttendanceCancelled(AttendanceCancelled event) {
        incidents.closeForCancelledAttendance(event.tenantId(), event.attendanceId(), event.reason(),
                event.cancelledBy());
    }
}
