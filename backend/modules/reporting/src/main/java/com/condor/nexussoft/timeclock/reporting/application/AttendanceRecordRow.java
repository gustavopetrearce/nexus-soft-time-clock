package com.condor.nexussoft.timeclock.reporting.application;

import java.time.Instant;

/**
 * Fila del reporte de <b>registros individuales</b> de asistencia por empleado (RF-11, HU-16 en web).
 * No expone ids/llaves: el empleado se identifica por número (employee_code) y nombre, y el centro
 * por su nombre; el tipo de evento y el estado son códigos de enum que el front traduce a etiquetas.
 */
public record AttendanceRecordRow(
        String employeeNumber,
        String employeeName,
        Instant serverTime,
        String eventType,
        String status,
        String rejectionReason,
        String workCenter,
        /** Etiqueta de la categoría del descanso (V30); nula fuera de descansos o sin categoría. */
        String breakType,
        /** Causa de la cancelación (V31); solo si {@code status} es CANCELLED. */
        String cancelReason) {
}
