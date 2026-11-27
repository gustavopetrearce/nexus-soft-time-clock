package com.condor.nexussoft.timeclock.hr.domain.port.in;

import com.condor.nexussoft.timeclock.hr.domain.PagedResult;
import com.condor.nexussoft.timeclock.hr.domain.Sanction;
import com.condor.nexussoft.timeclock.hr.domain.SanctionFilter;
import com.condor.nexussoft.timeclock.hr.domain.SanctionReason;
import com.condor.nexussoft.timeclock.hr.domain.SanctionType;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Sanciones: alta por el personal, anulación y vista del colaborador. */
public interface SanctionUseCase {

    PagedResult<Sanction> search(UUID tenantId, SanctionFilter filter, int page, int size);

    /** Lista completa (acotada) para exportar en el cliente. */
    List<Sanction> report(UUID tenantId, SanctionFilter filter);

    /** Sanciones de un colaborador (su vista "mis sanciones"). */
    List<Sanction> listForUser(UUID tenantId, UUID userId);

    Sanction create(CreateCommand command);

    Sanction voidSanction(VoidCommand command);

    record CreateCommand(UUID tenantId, UUID userId, UUID issuedBy, SanctionType type, SanctionReason reason,
                         LocalDate incidentDate, String description, LocalDate suspensionStart,
                         Integer suspensionDays) {}

    record VoidCommand(UUID tenantId, UUID sanctionId, UUID voidedBy, String reason) {}
}
