package com.condor.nexussoft.timeclock.hr.infrastructure.persistence;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EmploymentContractJpaRepository extends JpaRepository<EmploymentContractJpaEntity, UUID> {

    List<EmploymentContractJpaEntity> findByTenantIdAndUserIdOrderByStartsOnDesc(UUID tenantId, UUID userId);
}
