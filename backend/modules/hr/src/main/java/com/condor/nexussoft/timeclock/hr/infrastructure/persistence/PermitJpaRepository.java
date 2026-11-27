package com.condor.nexussoft.timeclock.hr.infrastructure.persistence;

import com.condor.nexussoft.timeclock.hr.domain.PermitStatus;
import com.condor.nexussoft.timeclock.hr.domain.PermitType;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PermitJpaRepository extends JpaRepository<PermitJpaEntity, UUID> {

    List<PermitJpaEntity> findByTenantIdAndUserIdOrderByStartDateDesc(UUID tenantId, UUID userId);

    @Query("""
            select count(p) > 0 from PermitJpaEntity p
            where p.tenantId = :tenantId and p.userId = :userId and p.type = :type
              and p.status in :statuses
              and p.startDate <= :end and p.endDate >= :start
            """)
    boolean overlaps(@Param("tenantId") UUID tenantId,
                     @Param("userId") UUID userId,
                     @Param("type") PermitType type,
                     @Param("start") LocalDate start,
                     @Param("end") LocalDate end,
                     @Param("statuses") Collection<PermitStatus> statuses);
}
