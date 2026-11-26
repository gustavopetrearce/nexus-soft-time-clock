package com.condor.nexussoft.timeclock.onboarding.domain;

/**
 * Error de una fila, o del archivo completo con {@code row = 0}.
 *
 * @param column columna del archivo implicada (nombre del encabezado), o {@code null}
 * @param code   código estable para el portal (p. ej. {@code DUPLICATE_EMAIL})
 */
public record ImportIssue(int row, String column, String code, String message) {

    public static ImportIssue global(String code, String message) {
        return new ImportIssue(0, null, code, message);
    }
}
