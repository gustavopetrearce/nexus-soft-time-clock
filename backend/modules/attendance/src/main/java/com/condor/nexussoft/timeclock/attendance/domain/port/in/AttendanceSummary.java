package com.condor.nexussoft.timeclock.attendance.domain.port.in;

import java.time.Instant;

/**
 * Resumen de un registro para el historial del colaborador (RF-05, HU-16).
 * No expone ids/llaves: el centro de trabajo se resuelve a su nombre; el tipo de evento
 * y el estado son códigos de enum que el cliente traduce a etiquetas.
 */
public record AttendanceSummary(
        String eventType,
        String status,
        String rejectionReason,
        Instant serverTime,
        String workCenter,
        /** Causa de la cancelación; solo si {@code status} es CANCELLED. */
        String cancelReason) {
}
