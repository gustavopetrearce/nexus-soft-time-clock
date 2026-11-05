package com.condor.nexussoft.timeclock.attendance.domain.port.out;

import java.util.Optional;
import java.util.UUID;

/** Lo que la marcación externa necesita saber del BC Identity (ADR-013). */
public interface ExternalIntegrationPort {

    enum Eligibility { ELIGIBLE, INACTIVE, NOT_ENABLED }

    record Collaborator(UUID userId, Eligibility eligibility) {}

    boolean isClientActive(UUID tenantId, UUID apiClientId);

    Optional<Collaborator> findCollaborator(UUID tenantId, String employeeCode);
}
