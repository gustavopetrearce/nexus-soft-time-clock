package com.condor.nexussoft.timeclock.tenancy.infrastructure.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.util.Optional;
import java.util.UUID;

public interface CompanyCapacityJpaRepository extends JpaRepository<CompanyCapacityJpaEntity, UUID> {

    /** {@code SELECT … FOR UPDATE} sobre la fila del tenant: serializa el cupo por empresa (RN-37). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<CompanyCapacityJpaEntity> findByCompanyId(UUID companyId);
}
