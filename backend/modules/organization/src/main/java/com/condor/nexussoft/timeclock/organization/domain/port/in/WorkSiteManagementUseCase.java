package com.condor.nexussoft.timeclock.organization.domain.port.in;

import com.condor.nexussoft.timeclock.organization.domain.WorkSite;
import com.condor.nexussoft.timeclock.shared.domain.Paged;

import java.util.Optional;
import java.util.UUID;

/** Administración de centros de trabajo (RF-07), siempre acotada al tenant. */
public interface WorkSiteManagementUseCase {

    WorkSite create(UUID tenantId, WorkSiteCommands.CreateWorkSiteCommand command);

    WorkSite update(UUID tenantId, UUID id, WorkSiteCommands.UpdateWorkSiteCommand command);

    WorkSite changeStatus(UUID tenantId, UUID id, WorkSite.Status status);

    WorkSite get(UUID tenantId, UUID id);

    /**
     * Variante no excepcional de {@link #get}: un centro ausente (o de otro tenant) es una condición
     * normal para quien solo consulta su política, no un error. Lanzar allí marcaría como rollback-only
     * la transacción del llamador, que después no podría confirmar (UnexpectedRollbackException).
     */
    Optional<WorkSite> find(UUID tenantId, UUID id);

    Paged<WorkSite> list(UUID tenantId, int page, int size, String search);
}
