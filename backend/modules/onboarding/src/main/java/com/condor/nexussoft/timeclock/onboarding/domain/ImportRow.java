package com.condor.nexussoft.timeclock.onboarding.domain;

import java.util.List;

/**
 * Una fila del archivo de importación, tal como la entrega el portal tras leer el CSV/XLSX.
 * Todo llega como texto (fechas en {@code AAAA-MM-DD}): la validación autoritativa es la del
 * servidor ({@link ImportValidator}); el portal solo adelanta errores de forma.
 *
 * @param row número de fila en el archivo (la 1 es el encabezado), para señalar errores
 */
public record ImportRow(
        int row,
        String email,
        String firstName,
        String lastName,
        String employeeCode,
        List<String> roles,
        String phone,
        String birthDate,
        String hireDate,
        String gender,
        String address,
        String emergencyContactName,
        String emergencyContactPhone,
        String scheduleCode,
        String shiftName,
        String workSiteCode,
        String shiftFrom,
        String shiftTo) {
}
