package com.condor.nexussoft.timeclock.onboarding.domain;

import com.condor.nexussoft.timeclock.hr.domain.Gender;

import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

/** Fila ya validada y resuelta (ids en lugar de códigos), lista para escribirse. */
public record ValidatedRow(
        int row,
        String email,
        String firstName,
        String lastName,
        String employeeCode,
        Set<String> roles,
        Profile profile,
        Shift shift) {

    /** Datos de perfil; {@code null} en la fila si no trae ninguno. */
    public record Profile(LocalDate birthDate, LocalDate hireDate, Gender gender, String phone,
                          String address, String emergencyContactName, String emergencyContactPhone) {
    }

    /** Asignación de turno; {@code null} en la fila si no trae columnas de turno. */
    public record Shift(UUID shiftId, UUID workSiteId, LocalDate validFrom, LocalDate validTo) {
    }
}
