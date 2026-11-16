package com.condor.nexussoft.timeclock.reporting.application;

/**
 * Fila del desglose de horas por proyecto (CU-09): un colaborador aparece tantas veces como proyectos
 * en los que haya trabajado dentro del rango. {@code projectCode}/{@code projectName} nulos agrupan las
 * horas sin proyecto (contrato por turno o sin contrato).
 */
public record ProjectHoursRow(
        String employeeNumber,
        String employeeName,
        String projectCode,
        String projectName,
        double workedHours,
        double overtimeHours,
        double totalHours) {

    /** Construye la fila a partir de los agregados crudos (minutos), con el mismo redondeo que por centro. */
    public static ProjectHoursRow of(String employeeNumber, String employeeName, String projectCode,
                                     String projectName, double workedMinutes, double overtimeMinutes) {
        SiteHoursRow h = SiteHoursRow.of(employeeNumber, employeeName, null, workedMinutes, overtimeMinutes);
        return new ProjectHoursRow(employeeNumber, employeeName, projectCode, projectName,
                h.workedHours(), h.overtimeHours(), h.totalHours());
    }
}
