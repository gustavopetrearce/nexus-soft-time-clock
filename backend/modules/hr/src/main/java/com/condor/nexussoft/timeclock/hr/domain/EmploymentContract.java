package com.condor.nexussoft.timeclock.hr.domain;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Contrato de un colaborador (RF-30). Un contrato {@link ContractType#PROJECT} es la asignación del
 * colaborador al proyecto; uno {@link ContractType#SHIFT} es su periodo de empleo por turno.
 * {@code endsOn} nulo = indefinido.
 */
public record EmploymentContract(
        UUID id,
        UUID tenantId,
        UUID userId,
        ContractType type,
        UUID projectId,
        UUID workSiteId,
        LocalDate startsOn,
        LocalDate endsOn,
        ContractStatus status,
        String notes,
        UUID createdBy,
        UUID endedBy,
        OffsetDateTime endedAt,
        UUID cancelledBy,
        OffsetDateTime cancelledAt,
        String cancelReason,
        OffsetDateTime createdAt
) {

    /** Verdadero si el contrato cubre la fecha (sin importar el estado). */
    public boolean covers(LocalDate date) {
        return !date.isBefore(startsOn) && (endsOn == null || !date.isAfter(endsOn));
    }

    /**
     * RN-65: contrato PROJECT no cancelado cuya vigencia ya no cabe en la del proyecto, o cuyo
     * proyecto dejó de estar activo mientras el contrato sigue activo. Se avisa; no se corrige solo.
     */
    public boolean needsReview(ProjectRef project) {
        if (type != ContractType.PROJECT || project == null || status == ContractStatus.CANCELLED) {
            return false;
        }
        if (status == ContractStatus.ACTIVE && !project.isActive()) {
            return true;
        }
        return !fitsIn(project, startsOn, endsOn);
    }

    /** Verdadero si el rango cabe en la vigencia del proyecto (los extremos nulos del proyecto no acotan). */
    public static boolean fitsIn(ProjectRef project, LocalDate start, LocalDate end) {
        if (project.startsOn() != null && start.isBefore(project.startsOn())) {
            return false;
        }
        return project.endsOn() == null || (end != null && !end.isAfter(project.endsOn()));
    }

    public EmploymentContract withTerms(UUID workSite, LocalDate start, LocalDate end, String newNotes) {
        return new EmploymentContract(id, tenantId, userId, type, projectId, workSite, start, end, status,
                newNotes, createdBy, endedBy, endedAt, cancelledBy, cancelledAt, cancelReason, createdAt);
    }

    public EmploymentContract end(LocalDate endDate, UUID by, OffsetDateTime at) {
        return new EmploymentContract(id, tenantId, userId, type, projectId, workSiteId, startsOn, endDate,
                ContractStatus.ENDED, notes, createdBy, by, at, cancelledBy, cancelledAt, cancelReason, createdAt);
    }

    public EmploymentContract cancel(String reason, UUID by, OffsetDateTime at) {
        return new EmploymentContract(id, tenantId, userId, type, projectId, workSiteId, startsOn, endsOn,
                ContractStatus.CANCELLED, notes, createdBy, endedBy, endedAt, by, at, reason, createdAt);
    }
}
