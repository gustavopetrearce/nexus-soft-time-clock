package com.condor.nexussoft.timeclock.attendance.domain.port.in;

import java.time.Instant;
import java.util.UUID;

/** Cancelación (definitiva) de una marca ya registrada; deja de contar como asistencia (V31). */
public interface CancelAttendanceUseCase {

    int MAX_REASON_LENGTH = 500;

    /**
     * @param serverTime hora de servidor de la marca, si el cliente la conoce: acota la búsqueda a su
     *                   partición. Nula = se busca solo por id.
     */
    CancelledAttendance cancel(UUID tenantId, UUID recordId, Instant serverTime, String reason, UUID actorId);

    record CancelledAttendance(UUID recordId, Instant serverTime, String status, String cancelReason,
                               UUID cancelledBy, Instant cancelledAt) {
    }
}
