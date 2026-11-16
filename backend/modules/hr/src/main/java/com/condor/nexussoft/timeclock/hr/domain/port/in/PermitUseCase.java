package com.condor.nexussoft.timeclock.hr.domain.port.in;

import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.PayStatus;
import com.condor.nexussoft.timeclock.hr.domain.Permit;
import com.condor.nexussoft.timeclock.hr.domain.PermitFilter;
import com.condor.nexussoft.timeclock.hr.domain.PermitReason;
import com.condor.nexussoft.timeclock.hr.domain.PermitType;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

/** Permisos: alta por el personal, cancelación y decisión de goce de sueldo (RR. HH.). */
public interface PermitUseCase {

    PagedResult<Permit> search(UUID tenantId, PermitFilter filter, int page, int size);

    /** Lista completa (acotada) para reportes que se exportan en el cliente, p. ej. incapacidades. */
    List<Permit> report(UUID tenantId, PermitFilter filter);

    /** Permisos de un colaborador (su vista "mis permisos"). */
    List<Permit> listForUser(UUID tenantId, UUID userId);

    Permit create(CreateCommand command);

    Permit cancel(CancelCommand command);

    Permit decidePay(DecidePayCommand command);

    /**
     * @param payStatus     goce fijado en el alta; {@code null} = pendiente de revisión.
     * @param canDecidePay  si quien registra tiene {@code permit:pay}; sin él, {@code payStatus} debe ser nulo.
     */
    record CreateCommand(UUID tenantId, UUID userId, UUID grantedBy, PermitType type, PermitReason reason,
                         LocalDate startDate, LocalDate endDate, LocalTime timeAt, String notes,
                         PayStatus payStatus, boolean canDecidePay) {}

    record CancelCommand(UUID tenantId, UUID permitId, UUID cancelledBy, String note) {}

    /** {@code payStatus} debe ser WITH_PAY o WITHOUT_PAY. */
    record DecidePayCommand(UUID tenantId, UUID permitId, UUID decidedBy, PayStatus payStatus, String note) {}
}
