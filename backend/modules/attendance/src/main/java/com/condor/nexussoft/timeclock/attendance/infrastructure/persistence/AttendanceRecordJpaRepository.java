package com.condor.nexussoft.timeclock.attendance.infrastructure.persistence;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AttendanceRecordJpaRepository extends JpaRepository<AttendanceRecordJpaEntity, UUID> {

    List<AttendanceRecordJpaEntity> findByTenantIdAndUserIdOrderByServerTimeDesc(
            UUID tenantId, UUID userId, Pageable pageable);

    Optional<AttendanceRecordJpaEntity>
    findFirstByTenantIdAndUserIdAndStatusAndServerTimeGreaterThanEqualOrderByServerTimeDesc(
            UUID tenantId, UUID userId, String status, Instant since);
}
