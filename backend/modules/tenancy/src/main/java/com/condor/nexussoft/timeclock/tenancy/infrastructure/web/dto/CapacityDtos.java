package com.condor.nexussoft.timeclock.tenancy.infrastructure.web.dto;

import com.condor.nexussoft.timeclock.tenancy.domain.CapacityStatus;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/** DTOs del cupo de colaboradores activos (RF-29). */
public final class CapacityDtos {

    private CapacityDtos() {
    }

    /**
     * Lo que se devuelve del cupo de una empresa: lo contratado y lo consumido, sin un solo dato
     * de los colaboradores. Es el agregado que ve el SUPER_ADMIN (02-actores-y-roles §2.4).
     */
    public record CapacityResponse(
            UUID companyId,
            int baseLimit,
            int blockSize,
            int extraBlocks,
            int limit,
            long used,
            long available) {

        public static CapacityResponse from(CapacityStatus s) {
            return new CapacityResponse(s.companyId(), s.baseLimit(), s.blockSize(),
                    s.extraBlocks(), s.limit(), s.used(), s.available());
        }
    }

    /**
     * Se fija el número total de bloques, no un incremento: un reintento tras un timeout no debe
     * venderle al cliente un bloque de más.
     */
    public record UpdateCapacityRequest(
            @NotNull(message = "indique los bloques adicionales")
            @Min(value = 0, message = "los bloques adicionales no pueden ser negativos")
            @Max(value = 1000, message = "revise el valor: supera cualquier contrato razonable")
            Integer extraBlocks) {
    }
}
