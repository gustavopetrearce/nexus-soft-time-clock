package com.condor.nexussoft.timeclock.attendance.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BreakTypeJpaRepository extends JpaRepository<BreakTypeJpaEntity, UUID> {

    List<BreakTypeJpaEntity> findByTenantIdOrderBySortOrderAscLabelAsc(UUID tenantId);

    Optional<BreakTypeJpaEntity> findByTenantIdAndId(UUID tenantId, UUID id);

    Optional<BreakTypeJpaEntity> findByTenantIdAndCode(UUID tenantId, String code);
}
