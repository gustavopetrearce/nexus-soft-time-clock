package com.condor.nexussoft.timeclock.attendance.infrastructure.web.dto;

import com.condor.nexussoft.timeclock.attendance.domain.port.in.RegisterExternalAttendanceUseCase.ExternalAttendanceCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Marcación de un sistema externo (ADR-013). {@code eventTime} exige desfase horario: sin él sería ambigua. */
public record RegisterExternalAttendanceRequest(
        @NotNull UUID operationUuid,
        @NotBlank String employeeCode,
        @NotNull UUID workSiteId,
        @NotNull @Pattern(regexp = "ENTRADA|SALIDA|INICIO_DESCANSO|FIN_DESCANSO|CAMBIO_SITIO") String eventType,
        @NotNull OffsetDateTime eventTime) {

    public ExternalAttendanceCommand toCommand() {
        return new ExternalAttendanceCommand(operationUuid, employeeCode, workSiteId, eventType, eventTime.toInstant());
    }
}
