package com.condor.nexussoft.timeclock.hr.infrastructure.persistence;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SanctionJpaRepository extends JpaRepository<SanctionJpaEntity, UUID> {

    List<SanctionJpaEntity> findByTenantIdAndUserIdOrderByIncidentDateDescCreatedAtDesc(UUID tenantId, UUID userId);
}
