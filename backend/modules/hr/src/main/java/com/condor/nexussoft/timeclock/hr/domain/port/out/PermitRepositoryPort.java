package com.condor.nexussoft.timeclock.hr.domain.port.out;

import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.Permit;
import com.condor.nexussoft.timeclock.hr.domain.PermitFilter;
import com.condor.nexussoft.timeclock.hr.domain.PermitType;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PermitRepositoryPort {
    PagedResult<Permit> search(UUID tenantId, PermitFilter filter, int page, int size);

    List<Permit> findAll(UUID tenantId, PermitFilter filter, int limit);

    List<Permit> findByUser(UUID tenantId, UUID userId);

    Optional<Permit> find(UUID tenantId, UUID id);

    Permit save(Permit permit);

    /** Verdadero si ya hay un permiso APPROVED del mismo tipo que se traslapa con el periodo. */
    boolean overlaps(UUID tenantId, UUID userId, PermitType type, LocalDate start, LocalDate end);

    /** Verdadero si el usuario pertenece al tenant y no es administrador de plataforma. */
    boolean isCollaborator(UUID tenantId, UUID userId);
}
