package com.condor.nexussoft.timeclock.hr.infrastructure.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;

/** DTOs de permisos (entradas tarde, salidas temprano, faltas). */
public final class PermitDtos {

    private PermitDtos() {}

    public record PermitResponse(
            String id,
            String userId,
            String userName,
            String employeeCode,
            String type,            // LATE_ARRIVAL | EARLY_DEPARTURE | ABSENCE
            String reason,          // PERSONAL | INCAPACIDAD | MEDICO | FAMILIAR | TRAMITE | OTRO
            String notes,
            LocalDate startDate,
            LocalDate endDate,
            int days,
            LocalTime timeAt,
            String status,          // PENDING | APPROVED | REJECTED | CANCELLED
            String grantedBy,
            String grantedByName,
            String cancelledByName,
            OffsetDateTime cancelledAt,
            String cancelNote,
            String payStatus,       // PENDING_REVIEW | WITH_PAY | WITHOUT_PAY
            String payDecidedByName,
            OffsetDateTime payDecidedAt,
            String payNote,
            boolean requestedByEmployee,   // solicitud del colaborador desde la app
            String resolvedByName,
            OffsetDateTime resolvedAt,
            String resolutionNote,
            OffsetDateTime createdAt
    ) {}

    public record CreatePermitRequest(
            @NotNull String userId,
            @NotNull String type,
            @NotNull String reason,
            @NotNull LocalDate startDate,
            LocalDate endDate,
            LocalTime timeAt,
            @Size(max = 500) String notes,
            /** Opcional y solo con permit:pay: WITH_PAY | WITHOUT_PAY. */
            String payStatus
    ) {}

    /** Solicitud de incapacidad del colaborador; las observaciones (motivo exacto) son obligatorias. */
    public record RequestIncapacityRequest(
            @NotNull LocalDate startDate,
            LocalDate endDate,
            @NotBlank @Size(max = 500) String notes
    ) {}

    public record ResolvePermitRequest(
            @NotNull String resolution,   // APPROVED | REJECTED
            @Size(max = 500) String note
    ) {}

    public record CancelPermitRequest(@Size(max = 500) String note) {}

    public record DecidePayRequest(
            @NotNull String payStatus,   // WITH_PAY | WITHOUT_PAY
            @Size(max = 500) String note
    ) {}
}
