package com.condor.nexussoft.timeclock.attendance.domain;

import java.time.Instant;
import java.util.UUID;

/** Datos mínimos de una marca ya registrada, para operar sobre ella (p.ej. cancelarla) sin rehidratar el agregado. */
public record AttendanceRecordRef(UUID id, UUID tenantId, Instant serverTime, UUID userId,
                                  AttendanceEventType eventType, AttendanceStatus status) {
}
