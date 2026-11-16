package com.condor.nexussoft.timeclock.hr.domain;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Permiso de un colaborador. Lo registra un administrador, RR. HH. o supervisor y nace
 * {@link PermitStatus#APPROVED}; el goce de sueldo es una decisión aparte de RR. HH.
 */
public record Permit(
        UUID id,
        UUID tenantId,
        UUID userId,
        PermitType type,
        PermitReason reason,
        String notes,
        LocalDate startDate,
        LocalDate endDate,
        int days,
        LocalTime timeAt,
        PermitStatus status,
        UUID grantedBy,
        UUID cancelledBy,
        OffsetDateTime cancelledAt,
        String cancelNote,
        PayStatus payStatus,
        UUID payDecidedBy,
        OffsetDateTime payDecidedAt,
        String payNote,
        OffsetDateTime createdAt
) {

    public Permit cancel(UUID by, String note, OffsetDateTime at) {
        return new Permit(id, tenantId, userId, type, reason, notes, startDate, endDate, days, timeAt,
                PermitStatus.CANCELLED, grantedBy, by, at, note, payStatus, payDecidedBy, payDecidedAt, payNote, createdAt);
    }

    public Permit decidePay(PayStatus pay, UUID by, String note, OffsetDateTime at) {
        return new Permit(id, tenantId, userId, type, reason, notes, startDate, endDate, days, timeAt,
                status, grantedBy, cancelledBy, cancelledAt, cancelNote, pay, by, at, note, createdAt);
    }
}
