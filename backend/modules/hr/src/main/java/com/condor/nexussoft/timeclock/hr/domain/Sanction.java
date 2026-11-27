package com.condor.nexussoft.timeclock.hr.domain;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Sanción a un colaborador (V39). La abre RR. HH., un supervisor o el administrador y nace
 * {@link SanctionStatus#ACTIVE}; puede anularse con motivo, de forma definitiva.
 */
public record Sanction(
        UUID id,
        UUID tenantId,
        UUID userId,
        SanctionType type,
        SanctionReason reason,
        LocalDate incidentDate,
        String description,
        LocalDate suspensionStart,
        Integer suspensionDays,
        SanctionStatus status,
        UUID issuedBy,
        UUID voidedBy,
        OffsetDateTime voidedAt,
        String voidReason,
        OffsetDateTime createdAt
) {

    public Sanction voided(UUID by, String why, OffsetDateTime at) {
        return new Sanction(id, tenantId, userId, type, reason, incidentDate, description, suspensionStart,
                suspensionDays, SanctionStatus.VOIDED, issuedBy, by, at, why, createdAt);
    }

    /** Último día de la suspensión (inclusive); {@code null} si no es suspensión. */
    public LocalDate suspensionEnd() {
        return suspensionStart == null || suspensionDays == null ? null : suspensionStart.plusDays(suspensionDays - 1L);
    }
}
