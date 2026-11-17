package com.condor.nexussoft.timeclock.hr.infrastructure.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/** DTOs de contratos de colaboradores (RF-30). */
public final class ContractDtos {

    private ContractDtos() {}

    public record ContractResponse(
            String id,
            String userId,
            String userName,
            String employeeCode,
            String type,              // PROJECT | SHIFT
            String projectId,
            String projectCode,
            String projectName,
            String projectStatus,     // ACTIVE | INACTIVE | CLOSED
            LocalDate projectStartsOn,
            LocalDate projectEndsOn,
            String workSiteId,
            LocalDate startsOn,
            LocalDate endsOn,         // null = indefinido
            String status,            // ACTIVE | ENDED | CANCELLED
            boolean needsReview,      // RN-65: ya no cabe en el proyecto o el proyecto no está activo
            String notes,
            String createdByName,
            String endedByName,
            OffsetDateTime endedAt,
            String cancelledByName,
            OffsetDateTime cancelledAt,
            String cancelReason,
            OffsetDateTime createdAt
    ) {}

    public record CreateContractRequest(
            @NotNull String userId,
            @NotNull String type,
            String projectId,
            String workSiteId,
            @NotNull LocalDate startsOn,
            LocalDate endsOn,
            @Size(max = 500) String notes
    ) {}

    public record UpdateContractRequest(
            String workSiteId,
            @NotNull LocalDate startsOn,
            LocalDate endsOn,
            @Size(max = 500) String notes
    ) {}

    public record EndContractRequest(@NotNull LocalDate endDate) {}

    public record CancelContractRequest(@NotBlank @Size(max = 500) String reason) {}
}
