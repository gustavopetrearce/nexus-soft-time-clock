package com.condor.nexussoft.timeclock.hr.domain.port.in;

import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.VacationRequest;
import com.condor.nexussoft.timeclock.hr.domain.VacationStatus;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface VacationRequestUseCase {
    /** @param cancellationPending solo las que tienen una cancelación pedida por el colaborador sin resolver. */
    PagedResult<VacationRequest> list(UUID tenantId, VacationStatus status, boolean cancellationPending,
                                      String search, int page, int size);

    /** Solicitudes de un colaborador (para su vista "mis vacaciones"). */
    List<VacationRequest> listForUser(UUID tenantId, UUID userId);

    VacationRequest create(CreateCommand command);

    VacationRequest resolve(ResolveCommand command);

    /** El colaborador dueño pide cancelar su solicitud (pendiente, o aprobada que aún no empieza). */
    VacationRequest requestCancellation(RequestCancellationCommand command);

    /** RR. HH. acepta (CANCELLED) o deniega la cancelación pedida. */
    VacationRequest resolveCancellation(ResolveCancellationCommand command);

    record CreateCommand(UUID tenantId, UUID userId, LocalDate startDate, LocalDate endDate, String reason) {}

    /** approve=true → APPROVED; approve=false → REJECTED. */
    record ResolveCommand(UUID tenantId, UUID requestId, UUID resolvedBy, boolean approve, String note) {}

    record RequestCancellationCommand(UUID tenantId, UUID requestId, UUID requestedBy, String reason) {}

    record ResolveCancellationCommand(UUID tenantId, UUID requestId, UUID resolvedBy, boolean accept, String note) {}
}
