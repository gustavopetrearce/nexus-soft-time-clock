package com.condor.nexussoft.timeclock.hr.infrastructure.persistence;

import com.condor.nexussoft.timeclock.hr.domain.PayStatus;
import com.condor.nexussoft.timeclock.hr.domain.PermitReason;
import com.condor.nexussoft.timeclock.hr.domain.PermitStatus;
import com.condor.nexussoft.timeclock.hr.domain.PermitType;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "permits")
@Getter
@Setter
@NoArgsConstructor
public class PermitJpaEntity {

    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PermitType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PermitReason reason;

    private String notes;

    @Column(nullable = false)
    private LocalDate startDate;

    @Column(nullable = false)
    private LocalDate endDate;

    @Column(nullable = false)
    private int days;

    private LocalTime timeAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PermitStatus status;

    private UUID grantedBy;
    private UUID cancelledBy;
    private OffsetDateTime cancelledAt;
    private String cancelNote;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PayStatus payStatus;

    private UUID payDecidedBy;
    private OffsetDateTime payDecidedAt;
    private String payNote;

    @Column(updatable = false)
    private OffsetDateTime createdAt;
}
