package com.condor.nexussoft.timeclock.attendance.infrastructure.web.dto;

import com.condor.nexussoft.timeclock.attendance.domain.port.in.AttendanceSummary;

import java.time.Instant;

/**
 * Historial propio del colaborador (RF-05, HU-16). No expone ids/llaves ni coordenadas:
 * solo fecha/hora de servidor, tipo de evento, estado (+ motivo de rechazo) y centro de trabajo.
 */
public record AttendanceSummaryResponse(String eventType, String status, String rejectionReason,
                                        Instant serverTime, String workCenter,
                                        String cancelReason) {

    public static AttendanceSummaryResponse from(AttendanceSummary s) {
        return new AttendanceSummaryResponse(s.eventType(), s.status(), s.rejectionReason(),
                s.serverTime(), s.workCenter(), s.cancelReason());
    }
}
