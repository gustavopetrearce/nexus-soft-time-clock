package com.condor.nexussoft.timeclock.hr.domain.port.out;

import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.VacationRequest;
import com.condor.nexussoft.timeclock.hr.domain.VacationStatus;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface VacationRequestRepositoryPort {
    PagedResult<VacationRequest> search(UUID tenantId, VacationStatus status, boolean cancellationPending,
                                        String search, int page, int size);
    List<VacationRequest> findByUser(UUID tenantId, UUID userId);
    Optional<VacationRequest> find(UUID tenantId, UUID id);
    VacationRequest save(VacationRequest request);
    /** Verdadero si el colaborador ya tiene una solicitud vigente (PENDING/APPROVED) que se traslapa. */
    boolean overlaps(UUID tenantId, UUID userId, LocalDate start, LocalDate end);
    /** Verdadero si el usuario pertenece al tenant (no se aceptan colaboradores de otra empresa). */
    boolean isTenantUser(UUID tenantId, UUID userId);
}
