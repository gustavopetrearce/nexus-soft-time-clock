package com.condor.nexussoft.timeclock.onboarding.domain;

import java.util.List;
import java.util.UUID;

/**
 * Resultado de una importación (vista previa o definitiva).
 *
 * @param dryRun         true si solo se validó
 * @param totalRows      filas recibidas
 * @param seatsNeeded    asientos del cupo que consume (o consumió) la importación
 * @param seatsAvailable asientos libres antes de importar
 * @param issues         errores; si hay alguno no se escribió nada
 * @param created        usuarios creados (vacío en vista previa o con errores)
 */
public record ImportReport(
        boolean dryRun,
        int totalRows,
        int seatsNeeded,
        long seatsAvailable,
        List<ImportIssue> issues,
        List<ImportedUser> created) {

    public boolean valid() {
        return issues.isEmpty();
    }

    /**
     * Usuario creado. {@code temporaryPassword} es la única copia en claro: el servidor guarda solo
     * el hash, así que el portal debe entregarla en el archivo de resultados.
     */
    public record ImportedUser(int row, UUID userId, String email, String employeeCode, String firstName,
                               String lastName, List<String> roles, String temporaryPassword) {
    }
}
