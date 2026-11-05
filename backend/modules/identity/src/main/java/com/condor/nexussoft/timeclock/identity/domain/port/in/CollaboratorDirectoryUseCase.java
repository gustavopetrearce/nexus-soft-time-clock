package com.condor.nexussoft.timeclock.identity.domain.port.in;

import java.util.Optional;
import java.util.UUID;

/**
 * Resuelve un colaborador por su código de empleado, para la marcación y la consulta de sistemas
 * externos (ADR-013).
 */
public interface CollaboratorDirectoryUseCase {

    enum Eligibility {
        ELIGIBLE,
        /** Dado de baja o sin activar. */
        INACTIVE,
        /** Sin {@code attendance:register}: no cuenta en el cupo (ADR-012), así que tampoco marca. */
        NOT_ENABLED
    }

    /** {@code status} es el de la cuenta ({@code ACTIVE}, {@code INACTIVE}, {@code LOCKED}, {@code INVITED}). */
    record Collaborator(UUID userId, String firstName, String lastName, String status, Eligibility eligibility) {}

    Optional<Collaborator> findByEmployeeCode(UUID tenantId, String employeeCode);
}
