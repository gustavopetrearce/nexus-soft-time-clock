package com.condor.nexussoft.timeclock.hr.domain;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Filtros del listado de contratos; cualquier campo nulo no filtra. {@code activeOn} selecciona los
 * contratos no cancelados que cubren esa fecha; {@code search} busca por nombre o número de empleado.
 */
public record ContractFilter(
        ContractType type,
        ContractStatus status,
        UUID projectId,
        UUID userId,
        LocalDate activeOn,
        String search
) {
    public static ContractFilter none() {
        return new ContractFilter(null, null, null, null, null, null);
    }
}
