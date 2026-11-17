package com.condor.nexussoft.timeclock.hr.infrastructure.persistence;

import com.condor.nexussoft.timeclock.hr.domain.ContractStatus;
import com.condor.nexussoft.timeclock.hr.domain.ContractType;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "employment_contracts")
@Getter
@Setter
@NoArgsConstructor
public class EmploymentContractJpaEntity {

    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "contract_type", nullable = false)
    private ContractType contractType;

    @Column(name = "project_id")
    private UUID projectId;

    @Column(name = "work_site_id")
    private UUID workSiteId;

    @Column(name = "starts_on", nullable = false)
    private LocalDate startsOn;

    @Column(name = "ends_on")
    private LocalDate endsOn;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ContractStatus status;

    private String notes;
    private UUID createdBy;
    private UUID endedBy;
    private OffsetDateTime endedAt;
    private UUID cancelledBy;
    private OffsetDateTime cancelledAt;
    private String cancelReason;

    @Column(updatable = false)
    private OffsetDateTime createdAt;
}
