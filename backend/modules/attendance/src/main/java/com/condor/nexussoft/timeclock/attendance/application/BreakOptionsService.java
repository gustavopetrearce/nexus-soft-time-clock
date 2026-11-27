package com.condor.nexussoft.timeclock.attendance.application;

import com.condor.nexussoft.timeclock.attendance.domain.BreakAllowancePolicy;
import com.condor.nexussoft.timeclock.attendance.domain.BreakType;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.BreakOptionsUseCase;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.BreakAllowancePort;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.BreakTypePort;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.CompanyPolicyPort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

/** Disponibilidad de las categorías de descanso para la jornada abierta (V38). */
@Service
public class BreakOptionsService implements BreakOptionsUseCase {

    private final BreakTypePort breakTypes;
    private final BreakAllowancePort breakAllowance;
    private final CompanyPolicyPort companyPolicy;
    private final Clock clock;

    public BreakOptionsService(BreakTypePort breakTypes, BreakAllowancePort breakAllowance,
                               CompanyPolicyPort companyPolicy, Clock clock) {
        this.breakTypes = breakTypes;
        this.breakAllowance = breakAllowance;
        this.companyPolicy = companyPolicy;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public List<BreakOption> optionsFor(UUID tenantId, UUID userId) {
        List<BreakType> enabled = breakTypes.findByTenant(tenantId).stream().filter(BreakType::enabled).toList();
        if (enabled.isEmpty()) {
            return List.of();
        }
        Instant now = clock.instant();
        // Misma ventana de jornada abierta que el registro (RN-12).
        Instant since = now.minus(companyPolicy.find(tenantId).openShiftMaxHours(), ChronoUnit.HOURS);
        BreakAllowancePolicy.Allowance allowance = breakAllowance.find(tenantId, userId, since, now);
        return enabled.stream()
                .map(b -> new BreakOption(b, BreakAllowancePolicy.availability(b.id(), allowance)))
                .toList();
    }
}
