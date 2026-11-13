package com.condor.nexussoft.timeclock.attendance.infrastructure.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;

/**
 * Cancelación de una marca. {@code serverTime} es opcional: si el cliente lo conoce (viene en los
 * listados) acota la búsqueda a la partición de la marca.
 */
public record CancelAttendanceRequest(
        @NotBlank @Size(max = 500) String reason,
        Instant serverTime) {
}
