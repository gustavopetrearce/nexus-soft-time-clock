package com.condor.nexussoft.timeclock.reporting.application;

/**
 * Fila del desglose de horas por centro de trabajo: un colaborador aparece tantas veces como centros
 * en los que haya trabajado dentro del rango. Los nombres de campo son camelCase para serializar
 * directamente al contrato del front.
 */
public record SiteHoursRow(
        String employeeNumber,
        String employeeName,
        String workCenter,
        double workedHours,
        double overtimeHours,
        double totalHours) {

    /** Construye la fila a partir de los agregados crudos (minutos), centralizando el redondeo. */
    public static SiteHoursRow of(String employeeNumber, String employeeName, String workCenter,
                                  double workedMinutes, double overtimeMinutes) {

        double workedHours = round1(workedMinutes / 60.0);
        double overtimeHours = round1(overtimeMinutes / 60.0);

        return new SiteHoursRow(employeeNumber, employeeName, workCenter,
                workedHours, overtimeHours, round1(workedHours + overtimeHours));
    }

    private static double round1(double value) {
        return Math.round(value * 10.0) / 10.0;
    }
}
