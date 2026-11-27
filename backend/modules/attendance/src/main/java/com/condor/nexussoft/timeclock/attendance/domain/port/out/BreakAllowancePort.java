package com.condor.nexussoft.timeclock.attendance.domain.port.out;

import com.condor.nexussoft.timeclock.attendance.domain.BreakAllowancePolicy.Allowance;

import java.time.Instant;
import java.util.UUID;

/** Datos para los límites de descanso (V38): turno de la jornada abierta y categorías ya usadas. */
public interface BreakAllowancePort {

    /**
     * Lo que admite la jornada abierta del colaborador en {@code at}: la que inició su última
     * ENTRADA aceptada en {@code [since, at]}. Sin jornada abierta, sin restricción (la secuencia
     * ya rechaza un descanso fuera de jornada).
     */
    Allowance find(UUID tenantId, UUID userId, Instant since, Instant at);
}
