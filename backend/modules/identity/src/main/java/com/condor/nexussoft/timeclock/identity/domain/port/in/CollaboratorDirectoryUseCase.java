package com.condor.nexussoft.timeclock.identity.domain.port.in;

import java.util.Optional;
import java.util.UUID;

/** Resuelve un colaborador por su código de empleado, para la marcación de sistemas externos. */
public interface CollaboratorDirectoryUseCase {

    enum Eligibility {
        ELIGIBLE,
        /** Dado de baja o sin activar. */
        INACTIVE,
        /** Sin {@code attendance:register}: no cuenta en el cupo (ADR-012), así que tampoco marca. */
        NOT_ENABLED
    }

    record Collaborator(UUID userId, Eligibility eligibility) {}

    Optional<Collaborator> findByEmployeeCode(UUID tenantId, String employeeCode);
}
