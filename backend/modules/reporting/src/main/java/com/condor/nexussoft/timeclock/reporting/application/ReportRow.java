package com.condor.nexussoft.timeclock.reporting.application;

import java.time.Instant;
import java.util.UUID;

/** Fila del reporte de asistencia. Las coordenadas son nulas en las marcas de un sistema externo (ADR-013). */
public record ReportRow(
        Instant serverTime,
        UUID userId,
        String eventType,
        String status,
        String rejectionReason,
        Double latitude,
        Double longitude,
        /** Causa de la cancelación (V31); solo si {@code status} es CANCELLED. */
        String cancelReason) {
}
