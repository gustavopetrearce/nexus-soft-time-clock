package com.condor.nexussoft.timeclock.hr.infrastructure.persistence;

import com.condor.nexussoft.timeclock.hr.domain.SanctionReason;
import com.condor.nexussoft.timeclock.hr.domain.SanctionStatus;
import com.condor.nexussoft.timeclock.hr.domain.SanctionType;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "sanctions")
@Getter
@Setter
@NoArgsConstructor
public class SanctionJpaEntity {

    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SanctionType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SanctionReason reason;

    @Column(nullable = false)
    private LocalDate incidentDate;

    @Column(nullable = false)
    private String description;

    private LocalDate suspensionStart;
    private Integer suspensionDays;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SanctionStatus status;

    private UUID issuedBy;
    private UUID voidedBy;
    private OffsetDateTime voidedAt;
    private String voidReason;

    @Column(updatable = false)
    private OffsetDateTime createdAt;
}
