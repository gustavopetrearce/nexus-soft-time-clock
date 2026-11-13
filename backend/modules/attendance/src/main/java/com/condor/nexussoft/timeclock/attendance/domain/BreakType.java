package com.condor.nexussoft.timeclock.attendance.domain;

import java.util.UUID;

/**
 * Categoría de descanso de una empresa ("Almuerzo", "Comida", "Café"…). No es un tipo de evento:
 * califica el par INICIO_DESCANSO/FIN_DESCANSO, así que la secuencia de la jornada (RN-12) y el
 * cálculo de horas siguen viendo un descanso sin más.
 *
 * @param code       identificador estable para integraciones ({@code [A-Z0-9_]+}, único por empresa)
 * @param paid       si el tramo de descanso cuenta como tiempo trabajado en los reportes
 * @param maxMinutes duración máxima orientativa; nula = sin límite
 */
public record BreakType(UUID id, UUID tenantId, String code, String label, boolean enabled,
                        boolean paid, Integer maxMinutes, int sortOrder) {
}
