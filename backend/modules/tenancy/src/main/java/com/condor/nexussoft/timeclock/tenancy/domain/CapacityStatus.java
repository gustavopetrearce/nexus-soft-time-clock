package com.condor.nexussoft.timeclock.tenancy.domain;

import java.util.UUID;

/**
 * Foto del cupo de un tenant: lo contratado y lo consumido. Es <b>todo</b> lo que el super admin
 * ve de una empresa para administrar su capacidad —nunca el padrón de colaboradores— y lo mismo
 * que el COMPANY_ADMIN consulta en modo lectura (02-actores-y-roles §2.4).
 */
public record CapacityStatus(
        UUID companyId,
        int baseLimit,
        int blockSize,
        int extraBlocks,
        int limit,
        long used,
        long available) {

    public static CapacityStatus of(CompanyCapacity capacity, long used) {
        int limit = capacity.limit();
        return new CapacityStatus(
                capacity.companyId(),
                capacity.baseLimit(),
                capacity.blockSize(),
                capacity.extraBlocks(),
                limit,
                used,
                Math.max(0, limit - used));
    }
}
