package com.condor.nexussoft.timeclock.hr.domain.port.out;

import com.condor.nexussoft.timeclock.hr.domain.ContractFilter;
import com.condor.nexussoft.timeclock.hr.domain.EmploymentContract;
import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.ProjectRef;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public interface ContractRepositoryPort {

    PagedResult<EmploymentContract> search(UUID tenantId, ContractFilter filter, int page, int size);

    List<EmploymentContract> findByUser(UUID tenantId, UUID userId);

    Optional<EmploymentContract> find(UUID tenantId, UUID id);

    /** Contrato no cancelado del colaborador que cubre la fecha. */
    Optional<EmploymentContract> findCovering(UUID tenantId, UUID userId, LocalDate date);

    EmploymentContract save(EmploymentContract contract);

    /**
     * Verdadero si otro contrato no cancelado del colaborador se traslapa con el periodo.
     * {@code end} nulo = indefinido; {@code excludeId} (opcional) se ignora, para editar.
     */
    boolean overlaps(UUID tenantId, UUID userId, LocalDate start, LocalDate end, UUID excludeId);

    /** Verdadero si el usuario pertenece al tenant y no es administrador de plataforma. */
    boolean isCollaborator(UUID tenantId, UUID userId);

    Optional<ProjectRef> findProject(UUID tenantId, UUID projectId);

    Map<UUID, ProjectRef> findProjects(UUID tenantId, Collection<UUID> projectIds);

    boolean workSiteExists(UUID tenantId, UUID workSiteId);
}
