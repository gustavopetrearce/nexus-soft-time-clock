import '../../../core/i18n/l10n.dart';
import '../application/attendance_message.dart';
import '../domain/attendance_record.dart';

/// Textos de asistencia en el idioma activo: mensajes del controller, motivos de rechazo y
/// etiquetas de los registros del historial. Los códigos vienen del backend.
extension AttendanceL10n on AppLocalizations {
  String attendanceMessageText(AttendanceMessage message) => switch (message) {
        GpsUnavailableMessage() => attendanceGpsUnavailable,
        AcceptedMessage(lateMinutes: final m?) => attendanceAcceptedLate(m),
        AcceptedMessage() => attendanceAccepted,
        RejectedLowAccuracyMessage(:final accuracyM) => attendanceRejectedLowAccuracy(accuracyM.round()),
        RejectedMessage(:final reason) => attendanceRejected(rejectionPhrase(reason)),
        NotRegisteredMessage(:final failure) => attendanceNotRegistered(failurePhrase(failure)),
        SavedOfflineMessage() => attendanceSavedOffline,
        SavedRetryingMessage(:final failure) => attendanceSavedRetrying(failurePhrase(failure)),
        SyncCompletedMessage() => syncCompleted,
        SyncPendingMessage(:final count) => syncPending(count),
        SyncFailedMessage(:final failure) => syncFailed(failurePhrase(failure)),
      };

  /// Motivo de un envío fallido (no de un rechazo de negocio), en minúsculas para insertar en frase.
  String failurePhrase(String? reason) {
    if (reason == null) return failureUnknown;
    if (reason.startsWith('HTTP_401') || reason.startsWith('HTTP_403')) return failureForbidden;
    if (reason == 'SYNC_ERROR') return failureServer;
    if (reason.startsWith('HTTP_') || reason.startsWith('evidencia:')) return reason;
    return rejectionPhrase(reason);
  }

  /// Motivo de rechazo (código `RejectionReason` del backend), en minúsculas para insertar en frase.
  String rejectionPhrase(String? reason) => switch (reason) {
        'INVALID_QR' => rejectInvalidQr,
        'OUT_OF_GEOFENCE' => rejectOutOfGeofence,
        'LOW_GPS_ACCURACY' => rejectLowGpsAccuracy,
        'GPS_UNAVAILABLE' => rejectGpsUnavailable,
        'OUT_OF_SCHEDULE' => rejectOutOfSchedule,
        'FRAUD_MOCK_LOCATION' => rejectMockLocation,
        'FRAUD_ROOTED_DEVICE' => rejectRootedDevice,
        'FRAUD_GPS_SPOOF_APP' => rejectGpsSpoofApp,
        'REPLAY_DETECTED' => rejectReplay,
        'INVALID_SEQUENCE' => rejectInvalidSequence,
        'UNTRUSTED_DEVICE' => rejectUntrustedDevice,
        'PHOTO_REQUIRED' => rejectPhotoRequired,
        'BIOMETRIC_REQUIRED' => rejectBiometricRequired,
        'EVENT_TYPE_DISABLED' => rejectEventTypeDisabled,
        'SITELESS_NOT_ALLOWED' => rejectSitelessNotAllowed,
        null => failureUnknown,
        _ => reason,
      };

  /// Nombre del tipo de evento; `null` si el código no es uno de los conocidos.
  String? eventTypeName(String code) => switch (code) {
        'ENTRADA' => eventEntrada,
        'SALIDA' => eventSalida,
        'INICIO_DESCANSO' => eventInicioDescanso,
        'FIN_DESCANSO' => eventFinDescanso,
        'CAMBIO_SITIO' => eventCambioSitio,
        _ => null,
      };

  /// Nombre a mostrar de un tipo de evento configurado por la empresa. Si la empresa le puso un
  /// nombre propio se respeta tal cual; si conserva el nombre sembrado por defecto (en español),
  /// se traduce por código.
  String eventTypeLabel(String code, String serverLabel) {
    final label = serverLabel.trim();
    final custom = label.isNotEmpty && label != code && label != _defaultEventTypeLabels[code];
    return custom ? label : eventTypeName(code) ?? (label.isEmpty ? prettifyCode(code) : label);
  }

  String recordEventType(AttendanceRecord r) => eventTypeName(r.eventType) ?? prettifyCode(r.eventType);

  String recordStatus(AttendanceRecord r) => switch (r.status) {
        'ACCEPTED' => recordStatusAccepted,
        'REJECTED' => recordStatusRejected,
        'PENDING_REVIEW' => recordStatusPendingReview,
        _ => prettifyCode(r.status),
      };

  /// Motivo de rechazo del registro como etiqueta (con mayúscula inicial); `null` si no aplica.
  String? recordRejectionReason(AttendanceRecord r) {
    final reason = r.rejectionReason;
    if (reason == null) return null;
    return switch (reason) {
      'INVALID_QR' => reasonInvalidQr,
      'OUT_OF_GEOFENCE' => reasonOutOfGeofence,
      'LOW_GPS_ACCURACY' => reasonLowGpsAccuracy,
      'GPS_UNAVAILABLE' => reasonGpsUnavailable,
      'OUT_OF_SCHEDULE' => reasonOutOfSchedule,
      'FRAUD_MOCK_LOCATION' => reasonMockLocation,
      'FRAUD_ROOTED_DEVICE' => reasonRootedDevice,
      'FRAUD_GPS_SPOOF_APP' => reasonGpsSpoofApp,
      'REPLAY_DETECTED' => reasonReplay,
      'INVALID_SEQUENCE' => reasonInvalidSequence,
      'UNTRUSTED_DEVICE' => reasonUntrustedDevice,
      'PHOTO_REQUIRED' => reasonPhotoRequired,
      'BIOMETRIC_REQUIRED' => reasonBiometricRequired,
      'EVENT_TYPE_DISABLED' => reasonEventTypeDisabled,
      _ => prettifyCode(reason),
    };
  }
}

/// Nombres con los que el backend siembra los tipos de evento de cada empresa.
const _defaultEventTypeLabels = {
  'ENTRADA': 'Entrada',
  'SALIDA': 'Salida',
  'INICIO_DESCANSO': 'Inicio de descanso',
  'FIN_DESCANSO': 'Fin de descanso',
  'CAMBIO_SITIO': 'Cambio de sitio',
};
