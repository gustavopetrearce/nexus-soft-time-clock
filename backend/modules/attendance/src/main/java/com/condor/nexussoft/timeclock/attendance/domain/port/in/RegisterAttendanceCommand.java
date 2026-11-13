package com.condor.nexussoft.timeclock.attendance.domain.port.in;

import java.util.UUID;

/**
 * Comando de registro de asistencia. Incluye la operación idempotente (UUID cliente),
 * el QR firmado, la lectura GPS, el tipo de evento, y las señales antifraude del dispositivo.
 * {@code breakTypeId} es la categoría elegida al iniciar un descanso (V30); opcional.
 */
public record RegisterAttendanceCommand(
        UUID operationUuid,
        UUID workSiteId,
        String qrToken,
        double latitude,
        double longitude,
        double accuracyM,
        String eventType,
        String deviceId,
        Long deviceTimeEpochMs,
        String source,
        boolean mockLocation,
        boolean rootedOrJailbroken,
        boolean gpsSpoofApp,
        boolean gpsDisabled,
        boolean deviceTrusted,
        boolean biometricVerified,
        String evidenceBucket,
        String evidenceKey,
        String evidenceHash,
        String devicePlatform,
        String deviceModel,
        String deviceOsVersion,
        UUID breakTypeId) {

    /** Sin categoría de descanso: la forma previa a V30. */
    public RegisterAttendanceCommand(UUID operationUuid, UUID workSiteId, String qrToken, double latitude,
                                     double longitude, double accuracyM, String eventType, String deviceId,
                                     Long deviceTimeEpochMs, String source, boolean mockLocation,
                                     boolean rootedOrJailbroken, boolean gpsSpoofApp, boolean gpsDisabled,
                                     boolean deviceTrusted, boolean biometricVerified, String evidenceBucket,
                                     String evidenceKey, String evidenceHash, String devicePlatform,
                                     String deviceModel, String deviceOsVersion) {
        this(operationUuid, workSiteId, qrToken, latitude, longitude, accuracyM, eventType, deviceId,
                deviceTimeEpochMs, source, mockLocation, rootedOrJailbroken, gpsSpoofApp, gpsDisabled,
                deviceTrusted, biometricVerified, evidenceBucket, evidenceKey, evidenceHash, devicePlatform,
                deviceModel, deviceOsVersion, null);
    }
}
