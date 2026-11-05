package com.condor.nexussoft.timeclock.attendance.infrastructure.integration;

import com.condor.nexussoft.timeclock.attendance.domain.port.out.ExternalIntegrationPort;
import com.condor.nexussoft.timeclock.identity.domain.port.in.ApiClientUseCase;
import com.condor.nexussoft.timeclock.identity.domain.port.in.CollaboratorDirectoryUseCase;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

/** Puente hacia el BC Identity para la marcación de sistemas externos (ADR-013). */
@Component
public class ExternalIntegrationAdapter implements ExternalIntegrationPort {

    private final ApiClientUseCase apiClients;
    private final CollaboratorDirectoryUseCase collaborators;

    public ExternalIntegrationAdapter(ApiClientUseCase apiClients, CollaboratorDirectoryUseCase collaborators) {
        this.apiClients = apiClients;
        this.collaborators = collaborators;
    }

    @Override
    public boolean isClientActive(UUID tenantId, UUID apiClientId) {
        return apiClients.isActive(tenantId, apiClientId);
    }

    @Override
    public Optional<Collaborator> findCollaborator(UUID tenantId, String employeeCode) {
        return collaborators.findByEmployeeCode(tenantId, employeeCode)
                .map(c -> new Collaborator(c.userId(), switch (c.eligibility()) {
                    case ELIGIBLE -> Eligibility.ELIGIBLE;
                    case INACTIVE -> Eligibility.INACTIVE;
                    case NOT_ENABLED -> Eligibility.NOT_ENABLED;
                }));
    }
}
