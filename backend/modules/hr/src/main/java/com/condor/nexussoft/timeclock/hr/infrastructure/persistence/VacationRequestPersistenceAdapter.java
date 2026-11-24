package com.condor.nexussoft.timeclock.hr.infrastructure.persistence;

import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.VacationRequest;
import com.condor.nexussoft.timeclock.hr.domain.VacationStatus;
import com.condor.nexussoft.timeclock.hr.domain.port.out.VacationRequestRepositoryPort;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;

@Component
public class VacationRequestPersistenceAdapter implements VacationRequestRepositoryPort {

    private static final List<VacationStatus> ACTIVE = List.of(VacationStatus.PENDING, VacationStatus.APPROVED);

    private final VacationRequestJpaRepository repository;
    private final EmployeeDirectoryQuery directory;

    public VacationRequestPersistenceAdapter(VacationRequestJpaRepository repository, EmployeeDirectoryQuery directory) {
        this.repository = repository;
        this.directory = directory;
    }

    @Override
    public boolean isTenantUser(UUID tenantId, UUID userId) {
        return directory.belongsTo(tenantId, userId);
    }

    @Override
    public PagedResult<VacationRequest> search(UUID tenantId, VacationStatus status, String search, int page, int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<VacationRequestJpaEntity> result = (status == null)
                ? repository.findByTenantId(tenantId, pageable)
                : repository.findByTenantIdAndStatus(tenantId, status, pageable);
        List<VacationRequest> content = result.getContent().stream().map(VacationRequestPersistenceAdapter::toDomain).toList();
        return new PagedResult<>(content, result.getTotalElements(), page, size);
    }

    @Override
    public List<VacationRequest> findByUser(UUID tenantId, UUID userId) {
        return repository.findByTenantIdAndUserIdOrderByStartDateDesc(tenantId, userId).stream()
                .map(VacationRequestPersistenceAdapter::toDomain).toList();
    }

    @Override
    public Optional<VacationRequest> find(UUID tenantId, UUID id) {
        return repository.findById(id)
                .filter(e -> e.getTenantId().equals(tenantId))
                .map(VacationRequestPersistenceAdapter::toDomain);
    }

    @Override
    public VacationRequest save(VacationRequest r) {
        VacationRequestJpaEntity e = repository.findById(r.id()).orElseGet(VacationRequestJpaEntity::new);
        e.setId(r.id());
        e.setTenantId(r.tenantId());
        e.setUserId(r.userId());
        e.setStartDate(r.startDate());
        e.setEndDate(r.endDate());
        e.setDays(r.days());
        e.setReason(r.reason());
        e.setStatus(r.status());
        e.setResolutionNote(r.resolutionNote());
        e.setResolvedBy(r.resolvedBy());
        e.setResolvedAt(r.resolvedAt());
        if (e.getCreatedAt() == null) {
            e.setCreatedAt(r.createdAt());
        }
        return toDomain(repository.save(e));
    }

    @Override
    public boolean overlaps(UUID tenantId, UUID userId, LocalDate start, LocalDate end) {
        return repository.overlaps(tenantId, userId, start, end, ACTIVE);
    }

    static VacationRequest toDomain(VacationRequestJpaEntity e) {
        return new VacationRequest(e.getId(), e.getTenantId(), e.getUserId(), e.getStartDate(), e.getEndDate(),
                e.getDays(), e.getReason(), e.getStatus(), e.getResolutionNote(), e.getResolvedBy(),
                e.getResolvedAt(), e.getCreatedAt());
    }
}
