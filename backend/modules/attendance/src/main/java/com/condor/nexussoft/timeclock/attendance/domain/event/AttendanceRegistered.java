package com.condor.nexussoft.timeclock.attendance.domain.event;

import com.condor.nexussoft.timeclock.shared.domain.DomainEvent;

import java.time.Instant;
import java.util.UUID;

/**
 * Evento: se aceptó un registro de asistencia. Consumido por Audit, Notifications, Reporting, Realtime, Incidents.
 * {@code minutesLate} es la tardanza sobre la tolerancia del turno (RN-16); 0 si es puntual o no aplica.
 * {@code outOfWindow} marca la marca aceptada fuera de la ventana del turno (RN-15): la ventana solo
 * rechaza la ENTRADA, y los demás eventos se aceptan con esta señal para que Incidents la registre.
 * {@code noSchedule} marca la marca aceptada sin turno vigente: no hay ventana ni retardo contra los
 * que medirla, y sin esta señal pasaría inadvertida para el supervisor.
 */
public record AttendanceRegistered(UUID eventId, Instant occurredAt, UUID tenantId,
                                   UUID attendanceId, UUID userId, UUID workSiteId, String eventKind,
                                   int minutesLate, boolean outOfWindow, boolean noSchedule)
        implements DomainEvent {

    public static AttendanceRegistered of(UUID tenantId, UUID attendanceId, UUID userId, UUID workSiteId,
                                          String eventKind, int minutesLate, boolean outOfWindow,
                                          boolean noSchedule, Instant when) {
        return new AttendanceRegistered(UUID.randomUUID(), when, tenantId, attendanceId, userId, workSiteId,
                eventKind, minutesLate, outOfWindow, noSchedule);
    }

    @Override
    public String eventType() {
        return "AttendanceRegistered";
    }
}
