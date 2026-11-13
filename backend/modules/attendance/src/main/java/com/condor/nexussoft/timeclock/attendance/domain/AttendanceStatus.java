package com.condor.nexussoft.timeclock.attendance.domain;

public enum AttendanceStatus {
    ACCEPTED,
    REJECTED,
    PENDING_REVIEW,
    /** Anulada por un supervisor/administrador tras registrarse (V31). No cuenta como asistencia. */
    CANCELLED;

    /** Solo una marca que hoy cuenta (o podría contar) se puede cancelar; la cancelación es definitiva. */
    public boolean isCancellable() {
        return this == ACCEPTED || this == PENDING_REVIEW;
    }
}
