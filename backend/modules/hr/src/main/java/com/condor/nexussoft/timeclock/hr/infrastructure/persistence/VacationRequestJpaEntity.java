package com.condor.nexussoft.timeclock.hr.infrastructure.persistence;

import com.condor.nexussoft.timeclock.hr.domain.VacationRequest;
import com.condor.nexussoft.timeclock.hr.domain.VacationStatus;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "vacation_requests")
@Getter
@Setter
@NoArgsConstructor
public class VacationRequestJpaEntity {

    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private LocalDate startDate;

    @Column(nullable = false)
    private LocalDate endDate;

    @Column(nullable = false)
    private int days;

    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private VacationStatus status;

    private String resolutionNote;
    private UUID resolvedBy;
    private OffsetDateTime resolvedAt;

    @Enumerated(EnumType.STRING)
    private VacationRequest.CancellationStatus cancelRequestStatus;
    private String cancelRequestReason;
    private OffsetDateTime cancelRequestedAt;
    private UUID cancelResolvedBy;
    private OffsetDateTime cancelResolvedAt;
    private String cancelResolutionNote;

    @Column(updatable = false)
    private OffsetDateTime createdAt;
}
