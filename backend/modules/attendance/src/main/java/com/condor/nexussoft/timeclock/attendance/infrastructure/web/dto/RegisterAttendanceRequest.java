package com.condor.nexussoft.timeclock.attendance.infrastructure.web.dto;

import com.condor.nexussoft.timeclock.attendance.domain.port.in.RegisterAttendanceCommand;
import jakarta.validation.constraints.*;

import java.util.UUID;

/** Solicitud de registro de asistencia (CU-02). */
public record RegisterAttendanceRequest(
        @NotNull UUID operationUuid,
        // Nulo = marcación sin centro. Debe ir acompañado de un QR de empresa: el servicio exige
        // que el ámbito del token y el del comando coincidan, en ambas direcciones.
        UUID workSiteId,
        @NotBlank String qrToken,
        @NotNull @DecimalMin("-90") @DecimalMax("90") Double latitude,
        @NotNull @DecimalMin("-180") @DecimalMax("180") Double longitude,
        @NotNull @PositiveOrZero Double accuracyM,
        @NotNull @Pattern(regexp = "ENTRADA|SALIDA|INICIO_DESCANSO|FIN_DESCANSO|CAMBIO_SITIO") String eventType,
        String deviceId,
        Long deviceTimeEpochMs,
        String source,
        Boolean mockLocation,
        Boolean rootedOrJailbroken,
        Boolean gpsSpoofApp,
        Boolean gpsDisabled,
        Boolean deviceTrusted,
        Boolean biometricVerified,
        String evidenceBucket,
        String evidenceKey,
        String evidenceHash,
        String devicePlatform,
        String deviceModel,
        String deviceOsVersion) {

    public RegisterAttendanceCommand toCommand() {
        return new RegisterAttendanceCommand(
                operationUuid, workSiteId, qrToken, latitude, longitude, accuracyM, eventType,
                deviceId, deviceTimeEpochMs, source,
                Boolean.TRUE.equals(mockLocation),
                Boolean.TRUE.equals(rootedOrJailbroken),
                Boolean.TRUE.equals(gpsSpoofApp),
                Boolean.TRUE.equals(gpsDisabled),
                deviceTrusted == null || deviceTrusted,          // señal antifraude declarada por el cliente
                Boolean.TRUE.equals(biometricVerified),
                evidenceBucket, evidenceKey, evidenceHash,
                devicePlatform, deviceModel, deviceOsVersion);
    }
}
