/// Registro de asistencia devuelto por el historial propio (RF-05, HU-16).
///
/// Refleja el DTO `AttendanceSummaryResponse` del backend (`GET /attendance/me`): no trae
/// ids ni coordenadas, solo fecha/hora de servidor, tipo de evento, estado (+ motivo de
/// rechazo) y el nombre del centro de trabajo.
class AttendanceRecord {
  const AttendanceRecord({
    required this.eventType,
    required this.status,
    required this.serverTime,
    required this.workCenter,
    this.rejectionReason,
  });

  final String eventType;
  final String status;
  final DateTime serverTime;
  final String workCenter;
  final String? rejectionReason;

  bool get isAccepted => status == 'ACCEPTED';
  bool get isRejected => status == 'REJECTED';

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) => AttendanceRecord(
        eventType: json['eventType'] as String,
        status: json['status'] as String,
        serverTime: DateTime.parse(json['serverTime'] as String).toLocal(),
        workCenter: (json['workCenter'] as String?) ?? '—',
        rejectionReason: json['rejectionReason'] as String?,
      );
}

/// Convierte un código enum (`OUT_OF_GEOFENCE`) en texto legible (`Out of geofence`) como respaldo
/// para códigos sin traducción. Las etiquetas traducidas están en `attendance_l10n.dart`.
String prettifyCode(String code) {
  final words = code.toLowerCase().replaceAll('_', ' ').trim();
  return words.isEmpty ? code : words[0].toUpperCase() + words.substring(1);
}
