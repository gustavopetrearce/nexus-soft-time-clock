package com.condor.nexussoft.timeclock.hr.domain.port.out;

import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.Sanction;
import com.condor.nexussoft.timeclock.hr.domain.SanctionFilter;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SanctionRepositoryPort {
    PagedResult<Sanction> search(UUID tenantId, SanctionFilter filter, int page, int size);

    List<Sanction> findAll(UUID tenantId, SanctionFilter filter, int limit);

    List<Sanction> findByUser(UUID tenantId, UUID userId);

    Optional<Sanction> find(UUID tenantId, UUID id);

    Sanction save(Sanction sanction);

    /** Verdadero si el usuario pertenece al tenant y no es administrador de plataforma. */
    boolean isCollaborator(UUID tenantId, UUID userId);
}
