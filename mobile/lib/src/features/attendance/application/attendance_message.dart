/// Resultado de una acción de asistencia, sin texto: el controller no tiene `BuildContext`
/// y no conoce el idioma. La UI lo traduce con `attendanceMessageText` (attendance_l10n.dart).
sealed class AttendanceMessage {
  const AttendanceMessage();
}

/// No se pudo obtener un fix de GPS; la marcación no se encoló.
class GpsUnavailableMessage extends AttendanceMessage {
  const GpsUnavailableMessage();
}

/// El servidor aceptó la marcación; [lateMinutes] si llegó con retardo.
class AcceptedMessage extends AttendanceMessage {
  const AcceptedMessage({this.lateMinutes});
  final String? lateMinutes;
}

/// Rechazo de negocio por precisión de GPS insuficiente; [accuracyM] es la precisión enviada.
class RejectedLowAccuracyMessage extends AttendanceMessage {
  const RejectedLowAccuracyMessage(this.accuracyM);
  final double accuracyM;
}

/// Rechazo de negocio; [reason] es el código `RejectionReason` del backend.
class RejectedMessage extends AttendanceMessage {
  const RejectedMessage(this.reason);
  final String? reason;
}

/// El servidor rechazó la operación en firme (no se reintenta); [failure] es el motivo crudo.
class NotRegisteredMessage extends AttendanceMessage {
  const NotRegisteredMessage(this.failure);
  final String? failure;
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
