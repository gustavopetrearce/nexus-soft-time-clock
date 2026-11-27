package com.condor.nexussoft.timeclock.hr.domain;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Solicitud de vacaciones y su resolución. Aparte, el colaborador puede pedir que se cancele
 * ({@code cancelRequest*}); RR. HH. la acepta (status CANCELLED) o la deniega. REJECTED es una
 * negativa de la empresa; CANCELLED, una cancelación a petición del colaborador.
 */
public record VacationRequest(
        UUID id,
        UUID tenantId,
        UUID userId,
        LocalDate startDate,
        LocalDate endDate,
        int days,
        String reason,
        VacationStatus status,
        String resolutionNote,
        UUID resolvedBy,
        OffsetDateTime resolvedAt,
        CancellationStatus cancelRequestStatus,
        String cancelRequestReason,
        OffsetDateTime cancelRequestedAt,
        UUID cancelResolvedBy,
        OffsetDateTime cancelResolvedAt,
        String cancelResolutionNote,
        OffsetDateTime createdAt
) {

    /** Estado de la solicitud de cancelación del colaborador; {@code null} si nunca la pidió. */
    public enum CancellationStatus { PENDING, ACCEPTED, DENIED }

    public boolean cancellationPending() {
        return cancelRequestStatus == CancellationStatus.PENDING;
    }

    /**
     * El colaborador puede pedir cancelarla si sigue pendiente, o si está aprobada y aún no empieza;
     * nunca con otra solicitud de cancelación en curso.
     */
    public boolean canRequestCancellation(LocalDate today) {
        if (cancellationPending()) return false;
        return status == VacationStatus.PENDING
                || (status == VacationStatus.APPROVED && startDate.isAfter(today));
    }

    public VacationRequest requestCancellation(String reason, OffsetDateTime at) {
        return new VacationRequest(id, tenantId, userId, startDate, endDate, days, this.reason, status,
                resolutionNote, resolvedBy, resolvedAt,
                CancellationStatus.PENDING, reason, at, null, null, null, createdAt);
    }

    /**
     * Aprobar o rechazar la solicitud pendiente. Si había una cancelación en curso, decidir sobre las
     * vacaciones la deniega implícitamente.
     */
    public VacationRequest resolve(boolean approve, UUID by, String note, OffsetDateTime at) {
        boolean pendingCancel = cancellationPending();
        return new VacationRequest(id, tenantId, userId, startDate, endDate, days, reason,
                approve ? VacationStatus.APPROVED : VacationStatus.REJECTED, note, by, at,
                pendingCancel ? CancellationStatus.DENIED : cancelRequestStatus, cancelRequestReason, cancelRequestedAt,
                pendingCancel ? by : cancelResolvedBy, pendingCancel ? at : cancelResolvedAt,
                cancelResolutionNote, createdAt);
    }

    /** Aceptar (status CANCELLED) o denegar (status sin cambio) la cancelación pedida. */
    public VacationRequest resolveCancellation(boolean accept, UUID by, String note, OffsetDateTime at) {
        return new VacationRequest(id, tenantId, userId, startDate, endDate, days, reason,
                accept ? VacationStatus.CANCELLED : status, resolutionNote, resolvedBy, resolvedAt,
                accept ? CancellationStatus.ACCEPTED : CancellationStatus.DENIED, cancelRequestReason,
                cancelRequestedAt, by, at, note, createdAt);
    }
}
