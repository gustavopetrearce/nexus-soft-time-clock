package com.condor.nexussoft.timeclock.attendance.domain.port.in;

import com.condor.nexussoft.timeclock.attendance.domain.BreakAllowancePolicy.Availability;
import com.condor.nexussoft.timeclock.attendance.domain.BreakType;

import java.util.List;
import java.util.UUID;

/**
 * Categorías de descanso que el colaborador puede usar ahora (V38): las habilitadas de la empresa,
 * cada una con su disponibilidad según el turno de la jornada abierta y lo ya usado ese día. La app
 * la usa para ofrecer solo las disponibles; el registro sigue siendo quien decide.
 */
public interface BreakOptionsUseCase {

    record BreakOption(BreakType breakType, Availability availability) {
    }

    List<BreakOption> optionsFor(UUID tenantId, UUID userId);
}
