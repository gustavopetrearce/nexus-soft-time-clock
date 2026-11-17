package com.condor.nexussoft.timeclock.hr.domain;

import java.time.LocalDate;

/**
 * Filtros de la bandeja de permisos; cualquier campo nulo no filtra. {@code from}/{@code to}
 * seleccionan los permisos cuyo periodo se traslapa con el rango; {@code search} busca por
 * nombre o número de empleado.
 */
public record PermitFilter(
        PermitType type,
        PermitReason reason,
        PayStatus payStatus,
        PermitStatus status,
        LocalDate from,
        LocalDate to,
        String search
) {
    public static PermitFilter none() {
        return new PermitFilter(null, null, null, null, null, null, null);
    }
}
