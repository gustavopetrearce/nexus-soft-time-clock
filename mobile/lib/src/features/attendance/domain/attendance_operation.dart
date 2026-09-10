/// Operación de registro creada en el dispositivo. Su JSON es el cuerpo de
/// RegisterAttendanceRequest del backend (idempotente por operationUuid).
class AttendanceOperation {
  const AttendanceOperation({
    required this.operationUuid,
    this.workSiteId,
    required this.qrToken,
    required this.latitude,
    required this.longitude,
    required this.accuracyM,
    required this.eventType,
    required this.source,
    this.deviceId,
    this.devicePlatform,
    this.deviceModel,
    this.deviceOsVersion,
    this.deviceTimeEpochMs,
    this.mockLocation = false,
    this.rootedOrJailbroken = false,
    this.gpsSpoofApp = false,
    this.gpsDisabled = false,
    this.deviceTrusted = true,
    this.biometricVerified = false,
    this.evidenceBucket,
    this.evidenceKey,
    this.evidenceHash,
  });

  final String operationUuid;

  /// Centro de la marcación; nulo con un QR de empresa (registro sin centro ni geocerca).
  final String? workSiteId;
  final String qrToken;
  final double latitude;
  final double longitude;
  final double accuracyM;
  final String eventType;
  final String source;
  final String? deviceId;
  final String? devicePlatform;
  final String? deviceModel;
  final String? deviceOsVersion;
  final int? deviceTimeEpochMs;
  final bool mockLocation;
  final bool rootedOrJailbroken;
  final bool gpsSpoofApp;
  final bool gpsDisabled;
  final bool deviceTrusted;
  final bool biometricVerified;

  /// Referencia de la evidencia ya subida (RF-18). La clave la emite el servidor al prefirmar la
  /// subida; se envía para que la asocie al registro tras verificar que el objeto existe.
  final String? evidenceBucket;
  final String? evidenceKey;
  final String? evidenceHash;

  Map<String, dynamic> toJson() => {
        'operationUuid': operationUuid,
        if (workSiteId != null) 'workSiteId': workSiteId,
        'qrToken': qrToken,
        'latitude': latitude,
        'longitude': longitude,
        'accuracyM': accuracyM,
        'eventType': eventType,
        'source': source,
        if (deviceId != null) 'deviceId': deviceId,
        if (devicePlatform != null) 'devicePlatform': devicePlatform,
        if (deviceModel != null) 'deviceModel': deviceModel,
        if (deviceOsVersion != null) 'deviceOsVersion': deviceOsVersion,
        if (deviceTimeEpochMs != null) 'deviceTimeEpochMs': deviceTimeEpochMs,
        'mockLocation': mockLocation,
        'rootedOrJailbroken': rootedOrJailbroken,
        'gpsSpoofApp': gpsSpoofApp,
        'gpsDisabled': gpsDisabled,
        'deviceTrusted': deviceTrusted,
        'biometricVerified': biometricVerified,
        if (evidenceBucket != null) 'evidenceBucket': evidenceBucket,
        if (evidenceKey != null) 'evidenceKey': evidenceKey,
        if (evidenceHash != null) 'evidenceHash': evidenceHash,
      };
}
