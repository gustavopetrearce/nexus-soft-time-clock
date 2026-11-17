package com.condor.nexussoft.timeclock.hr.domain.port.in;

import com.condor.nexussoft.timeclock.hr.domain.ContractFilter;
import com.condor.nexussoft.timeclock.hr.domain.ContractType;
import com.condor.nexussoft.timeclock.hr.domain.ContractView;
import com.condor.nexussoft.timeclock.hr.domain.EmploymentContract;
import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Contratos de colaboradores (RF-30): alta, edición, término, cancelación y consulta. */
public interface ContractUseCase {

    PagedResult<ContractView> search(UUID tenantId, ContractFilter filter, int page, int size);

    /** Historial de contratos de un colaborador, del más reciente al más antiguo. */
    List<ContractView> listForUser(UUID tenantId, UUID userId);

    /** Contrato no cancelado que cubre la fecha (RN-63 garantiza que hay a lo más uno). */
    Optional<EmploymentContract> findActive(UUID tenantId, UUID userId, LocalDate date);

    ContractView create(CreateCommand command);

    ContractView update(UpdateCommand command);

    ContractView end(EndCommand command);

    ContractView cancel(CancelCommand command);

    /** {@code projectId} obligatorio si {@code type} es PROJECT y nulo si es SHIFT. */
    record CreateCommand(UUID tenantId, UUID userId, UUID createdBy, ContractType type, UUID projectId,
                         UUID workSiteId, LocalDate startsOn, LocalDate endsOn, String notes) {}

    /** El tipo y el proyecto no cambian: para eso se cancela y se registra otro. */
    record UpdateCommand(UUID tenantId, UUID contractId, UUID workSiteId, LocalDate startsOn,
                         LocalDate endsOn, String notes) {}

    record EndCommand(UUID tenantId, UUID contractId, UUID endedBy, LocalDate endDate) {}

    record CancelCommand(UUID tenantId, UUID contractId, UUID cancelledBy, String reason) {}
}
