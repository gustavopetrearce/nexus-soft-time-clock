package com.condor.nexussoft.timeclock.hr.infrastructure.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/** DTOs de sanciones (V39). */
public final class SanctionDtos {

    private SanctionDtos() {}

    public record SanctionResponse(
            String id,
            String userId,
            String userName,
            String employeeCode,
            String type,             // VERBAL_WARNING | WRITTEN_WARNING | ADMINISTRATIVE_RECORD | SUSPENSION
            String reason,           // TARDINESS | UNJUSTIFIED_ABSENCE | MISCONDUCT | POLICY_VIOLATION | NEGLIGENCE | OTHER
            LocalDate incidentDate,
            String description,
            LocalDate suspensionStart,
            Integer suspensionDays,
            LocalDate suspensionEnd,
            String status,           // ACTIVE | VOIDED
            String issuedByName,
            String voidedByName,
            OffsetDateTime voidedAt,
            String voidReason,
            OffsetDateTime createdAt
    ) {}

    public record CreateSanctionRequest(
            @NotNull String userId,
            @NotNull String type,
            @NotNull String reason,
            @NotNull LocalDate incidentDate,
            @NotBlank @Size(max = 1000) String description,
            /** Solo para SUSPENSION. */
            LocalDate suspensionStart,
            Integer suspensionDays
    ) {}

    public record VoidSanctionRequest(@NotBlank @Size(max = 500) String reason) {}
}
