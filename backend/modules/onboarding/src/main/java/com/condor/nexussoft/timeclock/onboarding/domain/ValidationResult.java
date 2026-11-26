package com.condor.nexussoft.timeclock.onboarding.domain;

import java.util.List;

/**
 * Resultado de validar el archivo completo.
 *
 * @param rows        filas válidas (si {@code issues} no está vacío, el archivo no se importa)
 * @param seatsNeeded asientos del cupo que consumiría la importación
 */
public record ValidationResult(List<ValidatedRow> rows, List<ImportIssue> issues, int seatsNeeded) {

    public boolean valid() {
        return issues.isEmpty();
    }
}
