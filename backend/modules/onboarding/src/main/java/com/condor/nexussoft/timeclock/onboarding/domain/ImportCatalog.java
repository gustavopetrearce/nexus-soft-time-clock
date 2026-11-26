package com.condor.nexussoft.timeclock.onboarding.domain;

import com.condor.nexussoft.timeclock.identity.domain.port.in.GranterAuthority;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Foto del tenant contra la que se valida un archivo: lo que ya existe y lo que el operador puede
 * hacer. Se arma una vez por importación para que validar 1000 filas no sean 1000 consultas.
 *
 * @param existingEmails        correos (normalizados) del archivo que ya usa el tenant
 * @param existingEmployeeCodes números de empleado del archivo que ya usa el tenant
 * @param systemRoleCodes       roles plantilla existentes (distingue "no existe" de "no otorgable")
 * @param seatRoleCodes         roles que habilitan registrar asistencia: consumen cupo (RN-35)
 * @param availableSeats        asientos libres del cupo del tenant (RF-29)
 * @param shifts                turnos del tenant
 * @param workSites             centros activos del tenant, por código
 * @param granter               potestad de delegación de roles del operador
 * @param canAssignShifts       ¿tiene el operador {@code schedule:manage}?
 * @param today                 fecha de referencia (la de nacimiento no puede ser futura)
 */
public record ImportCatalog(
        Set<String> existingEmails,
        Set<String> existingEmployeeCodes,
        Set<String> systemRoleCodes,
        Set<String> seatRoleCodes,
        long availableSeats,
        List<ShiftRef> shifts,
        Map<String, UUID> workSites,
        GranterAuthority granter,
        boolean canAssignShifts,
        LocalDate today) {
}
