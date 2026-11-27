package com.condor.nexussoft.timeclock.hr.infrastructure.persistence;

import com.condor.nexussoft.timeclock.hr.domain.VacationRequest;
import com.condor.nexussoft.timeclock.hr.domain.VacationStatus;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface VacationRequestJpaRepository extends JpaRepository<VacationRequestJpaEntity, UUID> {

    Page<VacationRequestJpaEntity> findByTenantId(UUID tenantId, Pageable pageable);

    Page<VacationRequestJpaEntity> findByTenantIdAndStatus(UUID tenantId, VacationStatus status, Pageable pageable);

    Page<VacationRequestJpaEntity> findByTenantIdAndCancelRequestStatus(
            UUID tenantId, VacationRequest.CancellationStatus cancelRequestStatus, Pageable pageable);

    Page<VacationRequestJpaEntity> findByTenantIdAndStatusAndCancelRequestStatus(
            UUID tenantId, VacationStatus status, VacationRequest.CancellationStatus cancelRequestStatus, Pageable pageable);

    List<VacationRequestJpaEntity> findByTenantIdAndUserIdOrderByStartDateDesc(UUID tenantId, UUID userId);

    @Query("""
            select count(v) > 0 from VacationRequestJpaEntity v
            where v.tenantId = :tenantId and v.userId = :userId
              and v.status in :statuses
              and v.startDate <= :end and v.endDate >= :start
            """)
    boolean overlaps(@Param("tenantId") UUID tenantId,
                     @Param("userId") UUID userId,
                     @Param("start") LocalDate start,
                     @Param("end") LocalDate end,
                     @Param("statuses") List<VacationStatus> statuses);
}
