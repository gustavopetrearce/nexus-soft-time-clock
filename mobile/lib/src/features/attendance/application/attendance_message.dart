/// Resultado de una acción de asistencia, sin texto: el controller no tiene `BuildContext`
/// y no conoce el idioma. La UI lo traduce con `attendanceMessageText` (attendance_l10n.dart).
///
/// [persistent] separa los dos canales de P04 (HIFI/08 R6): lo que se resolvió bien o quedó a
/// salvo va en un Snackbar; un rechazo o un registro en revisión queda como Aviso en la pantalla
/// (con "Reintentar" si se puede volver a intentar) hasta el siguiente intento.
sealed class AttendanceMessage {
  const AttendanceMessage();

  bool get persistent => false;
}

/// No se pudo obtener un fix de GPS; la marcación no se encoló.
class GpsUnavailableMessage extends AttendanceMessage {
  const GpsUnavailableMessage();

  @override
  bool get persistent => true;
}

/// El servidor aceptó la marcación de [eventType] a la hora [serverTime] (la del servidor,
/// RN-11); [lateMinutes] si llegó con retardo.
class AcceptedMessage extends AttendanceMessage {
  const AcceptedMessage({required this.eventType, this.serverTime, this.lateMinutes});
  final String eventType;
  final DateTime? serverTime;
  final String? lateMinutes;
}

/// Registrada, pero queda en revisión por una bandera antifraude aceptada por política (RN-29).
class InReviewMessage extends AttendanceMessage {
  const InReviewMessage({required this.eventType, this.serverTime, this.flags = const []});
  final String eventType;
  final DateTime? serverTime;

  /// Banderas del servidor (`fraud_flags.flag_type`): MOCK_LOCATION, GPS_SPOOF_APP…
  final List<String> flags;

  @override
  bool get persistent => true;
}

/// Rechazo de negocio por precisión de GPS insuficiente; [accuracyM] es la precisión enviada.
class RejectedLowAccuracyMessage extends AttendanceMessage {
  const RejectedLowAccuracyMessage(this.accuracyM);
  final double accuracyM;

  @override
  bool get persistent => true;
}

/// Rechazo de negocio; [reason] es el código `RejectionReason` del backend. [distanceM] es la
/// distancia al centro que midió el servidor (fuera de geocerca) y [eventType] el evento
/// intentado (secuencia inválida).
class RejectedMessage extends AttendanceMessage {
  const RejectedMessage(this.reason, {this.eventType, this.distanceM});
  final String? reason;
  final String? eventType;
  final double? distanceM;

  @override
  bool get persistent => true;
}

/// El servidor rechazó la operación en firme (no se reintenta); [failure] es el motivo crudo.
class NotRegisteredMessage extends AttendanceMessage {
  const NotRegisteredMessage(this.failure);
  final String? failure;

  @override
  bool get persistent => true;
}

/// Encolada sin conexión: se sincronizará más tarde.
class SavedOfflineMessage extends AttendanceMessage {
  const SavedOfflineMessage();
}

/// Encolada; el servidor respondió con un fallo transitorio y se reintentará.
class SavedRetryingMessage extends AttendanceMessage {
  const SavedRetryingMessage(this.failure);
  final String failure;
}

/// Sincronización manual sin nada pendiente.
class SyncCompletedMessage extends AttendanceMessage {
  const SyncCompletedMessage();
}

/// Sincronización manual que dejó [count] operaciones pendientes (sin un fallo concreto).
class SyncPendingMessage extends AttendanceMessage {
  const SyncPendingMessage(this.count);
  final int count;
}

/// Sincronización manual fallida por [failure].
class SyncFailedMessage extends AttendanceMessage {
  const SyncFailedMessage(this.failure);
  final String failure;
}
