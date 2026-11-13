package com.condor.nexussoft.timeclock.attendance.domain.event;

import com.condor.nexussoft.timeclock.shared.domain.DomainEvent;

import java.time.Instant;
import java.util.UUID;

/**
 * Evento: un supervisor/administrador canceló una marca ya registrada (V31). La causa es texto libre,
 * solo de referencia. Consumido por Audit (traza), Incidents (cierra las incidencias ligadas) y Realtime.
 */
public record AttendanceCancelled(UUID eventId, Instant occurredAt, UUID tenantId,
                                  UUID attendanceId, Instant serverTime, UUID userId, String eventKind,
                                  UUID cancelledBy, String reason)
        implements DomainEvent {

    public static AttendanceCancelled of(UUID tenantId, UUID attendanceId, Instant serverTime, UUID userId,
                                         String eventKind, UUID cancelledBy, String reason, Instant when) {
        return new AttendanceCancelled(UUID.randomUUID(), when, tenantId, attendanceId, serverTime, userId,
                eventKind, cancelledBy, reason);
    }

    @Override
    public String eventType() {
        return "AttendanceCancelled";
    }
}
