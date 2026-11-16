package com.condor.nexussoft.timeclock.hr.infrastructure.web.dto;

import java.time.LocalDate;

/** DTOs de la vista propia del colaborador (self, sin permisos de admin). */
public final class MeDtos {

    private MeDtos() {}

    public record MeProfileResponse(
            String userId,
            String fullName,
            String email,
            String employeeCode,
            LocalDate birthDate,
            LocalDate hireDate,
            String gender,
            String phone,
            String address,
            String emergencyContactName,
            String emergencyContactPhone
    ) {}

    /** Resumen de vacaciones del colaborador según su antigüedad y la escalera de la empresa. */
    public record MeVacationSummaryResponse(
            int yearsOfService,
            int entitledDays,   // días que le corresponden por su antigüedad
            int takenDays,      // días aprobados del año en curso
            int pendingDays,    // días en solicitudes pendientes
            int availableDays   // disponibles = max(0, entitled - taken)
    ) {}

    /** Contrato propio: el vigente hoy ({@code current}) o el próximo por empezar. */
    public record MeContractResponse(
            String type,          // PROJECT | SHIFT
            String projectCode,   // solo PROJECT
            String projectName,
            LocalDate startsOn,
            LocalDate endsOn,     // null = indefinido
            boolean current
    ) {}
}
