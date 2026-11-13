package com.condor.nexussoft.timeclock.incidents.infrastructure.persistence;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface IncidentJpaRepository extends JpaRepository<IncidentJpaEntity, UUID> {

    Optional<IncidentJpaEntity> findByIdAndTenantId(UUID id, UUID tenantId);

    Page<IncidentJpaEntity> findByTenantId(UUID tenantId, Pageable pageable);

    Page<IncidentJpaEntity> findByTenantIdAndStatus(UUID tenantId, String status, Pageable pageable);

    List<IncidentJpaEntity> findByTenantIdAndRelatedAttendanceIdAndStatus(
            UUID tenantId, UUID relatedAttendanceId, String status);
}
