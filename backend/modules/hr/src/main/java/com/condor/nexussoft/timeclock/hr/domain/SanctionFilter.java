package com.condor.nexussoft.timeclock.hr.domain;

import java.time.LocalDate;

/**
 * Filtros de la bandeja de sanciones; cualquier campo nulo no filtra. {@code from}/{@code to} acotan la
 * fecha de los hechos; {@code search} busca por nombre o número de empleado.
 */
public record SanctionFilter(
        SanctionType type,
        SanctionReason reason,
        SanctionStatus status,
        LocalDate from,
        LocalDate to,
        String search
) {
    public static SanctionFilter none() {
        return new SanctionFilter(null, null, null, null, null, null);
    }
}
