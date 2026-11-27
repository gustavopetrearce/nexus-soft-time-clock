package com.condor.nexussoft.timeclock.hr.domain;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Permiso de un colaborador. Si lo registra un administrador, RR. HH. o supervisor nace
 * {@link PermitStatus#APPROVED}. Si lo solicita el propio colaborador (incapacidad desde la app,
 * {@code requestedBy} no nulo) nace {@link PermitStatus#PENDING} hasta que el personal lo aprueba
 * o rechaza. El goce de sueldo es una decisión aparte de RR. HH.
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
        UUID requestedBy,
        UUID resolvedBy,
        OffsetDateTime resolvedAt,
        String resolutionNote,
        OffsetDateTime createdAt
) {

    public Permit cancel(UUID by, String note, OffsetDateTime at) {
        return new Permit(id, tenantId, userId, type, reason, notes, startDate, endDate, days, timeAt,
                PermitStatus.CANCELLED, grantedBy, by, at, note, payStatus, payDecidedBy, payDecidedAt, payNote,
                requestedBy, resolvedBy, resolvedAt, resolutionNote, createdAt);
    }

    public Permit decidePay(PayStatus pay, UUID by, String note, OffsetDateTime at) {
        return new Permit(id, tenantId, userId, type, reason, notes, startDate, endDate, days, timeAt,
                status, grantedBy, cancelledBy, cancelledAt, cancelNote, pay, by, at, note,
                requestedBy, resolvedBy, resolvedAt, resolutionNote, createdAt);
    }

    /** Resuelve una solicitud pendiente: aprobada (quien aprueba queda como otorgante) o rechazada. */
    public Permit resolve(boolean approve, UUID by, String note, OffsetDateTime at) {
        return new Permit(id, tenantId, userId, type, reason, notes, startDate, endDate, days, timeAt,
                approve ? PermitStatus.APPROVED : PermitStatus.REJECTED, approve ? by : grantedBy,
                cancelledBy, cancelledAt, cancelNote, payStatus, payDecidedBy, payDecidedAt, payNote,
                requestedBy, by, at, note, createdAt);
    }

    /** Solicitado por el colaborador (no registrado por el personal). */
    public boolean isRequest() {
        return requestedBy != null;
    }
}
