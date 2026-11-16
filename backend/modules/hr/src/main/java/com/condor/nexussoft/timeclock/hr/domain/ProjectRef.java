package com.condor.nexussoft.timeclock.hr.domain;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Lectura mínima de un proyecto (módulo organization) para validar contratos, sin dependencia de
 * compilación entre módulos. {@code status}: ACTIVE | INACTIVE | CLOSED.
 */
public record ProjectRef(UUID id, String code, String name, String status, LocalDate startsOn, LocalDate endsOn) {

    public boolean isActive() {
        return "ACTIVE".equals(status);
    }
}
