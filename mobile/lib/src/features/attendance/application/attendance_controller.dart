import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/db/app_database.dart';
import '../../../core/services/location_service.dart';
import '../../../core/storage/device_identity_store.dart';
import '../data/attendance_sync_service.dart';
import '../domain/attendance_operation.dart';
import 'attendance_message.dart';
import 'today_attendance.dart';

class AttendanceUiState {
  const AttendanceUiState({
    this.busy = false,
    this.message,
    this.pendingCount = 0,
    this.failedCount = 0,
    this.lastIssue,
  });

  final bool busy;

  /// Resultado de la última acción, para avisar al colaborador; la UI lo traduce.
  final AttendanceMessage? message;
  final int pendingCount;

  /// Marcaciones que el servidor rechazó en firme: no se reintentan y hay que actuar sobre ellas.
  final int failedCount;

  /// Último motivo de fallo distinto de «sin conexión», para no disfrazar de falta de red lo
  /// que en realidad fue una respuesta del servidor.
  final String? lastIssue;

  AttendanceUiState copyWith({
    bool? busy,
    AttendanceMessage? message,
    int? pendingCount,
    int? failedCount,
    String? lastIssue,
  }) =>
      AttendanceUiState(
        busy: busy ?? this.busy,
        message: message,
        pendingCount: pendingCount ?? this.pendingCount,
        failedCount: failedCount ?? this.failedCount,
        lastIssue: lastIssue ?? this.lastIssue,
      );
}

/// Orquesta el registro offline-first: captura GPS → construye la operación (UUID) →
/// la encola localmente (nunca se pierde) → intenta sincronizar. La validación real
/// (geocerca, antifraude, hora) la resuelve el servidor (RN-53).
class AttendanceController extends Notifier<AttendanceUiState> {
  static const _uuid = Uuid();

  @override
  AttendanceUiState build() {
    _refreshCount();
    return const AttendanceUiState();
  }

  /// [evidencePath] y [evidenceSha256] son la foto ya capturada y comprimida (RF-18). No se sube
  /// aquí: viaja con la cola, para que una marcación sin conexión no dependa de la red.
  ///
  /// [workSiteId] nulo = marcación con QR de empresa: sin centro y sin validación de geocerca.
  Future<void> register({
    required String eventType,
    required String qrToken,
    String? workSiteId,
    bool biometricVerified = false,
    String? evidencePath,
    String? evidenceSha256,
  }) async {
    state = state.copyWith(busy: true, message: null);

    final gpsEnabled = await ref.read(locationServiceProvider).isGpsEnabled();
    final position = await ref.read(locationServiceProvider).current();
    if (position == null) {
      state = state.copyWith(busy: false, message: const GpsUnavailableMessage());
      return;
    }

    // Identidad estable del dispositivo (RF-28): el backend la usa para reconocer/enrolar (TOFU).
    final device = await ref.read(deviceIdentityStoreProvider).current();

    final op = AttendanceOperation(
      operationUuid: _uuid.v4(),
      workSiteId: workSiteId,
      qrToken: qrToken,
      latitude: position.latitude,
      longitude: position.longitude,
      accuracyM: position.accuracy,
      eventType: eventType,
      source: 'ONLINE',
      deviceId: device.deviceId,
      devicePlatform: device.platform,
      deviceModel: device.model,
      deviceOsVersion: device.osVersion,
      deviceTimeEpochMs: DateTime.now().millisecondsSinceEpoch,
      mockLocation: position.isMocked,
      gpsDisabled: !gpsEnabled,
      biometricVerified: biometricVerified,
    );

    final db = ref.read(appDatabaseProvider);
    await db.enqueue(
      op.operationUuid,
      jsonEncode(op.toJson()),
      evidencePath: evidencePath,
      evidenceSha256: evidenceSha256,
    );

    // La marcación ya está a salvo en la cola; a partir de aquí nada puede dejar la pantalla
    // girando ni sin mensaje, así que el veredicto se fija siempre, también si sincronizar falla.
    try {
      await ref.read(attendanceSyncServiceProvider).syncPending();
    } finally {
      await _refreshCount();
      // El mensaje refleja el veredicto autoritativo del servidor aplicado por el sync a la
      // fila local (HU-10 CA3, HU-15 CA4). Se fija DESPUÉS de _refreshCount porque copyWith
      // resetea message en cada llamada.
      final row = await db.findByUuid(op.operationUuid);
      state = state.copyWith(busy: false, message: _messageFor(row, eventType, position.accuracy));
      ref.invalidate(todayAttendanceProvider);
    }
  }

  /// Traduce el estado final de la operación (tras sincronizar) a un aviso para el colaborador.
  /// [accuracyM] es la precisión del fix enviado; se muestra en el rechazo por GPS para dar
  /// contexto accionable (saber cuán lejos quedó del umbral) y como dato de diagnóstico. El
  /// veredicto en memoria del sync aporta la hora del servidor, la distancia y las banderas.
  AttendanceMessage _messageFor(PendingAttendanceOp? row, String eventType, double accuracyM) {
    final verdict = row == null ? null : ref.read(attendanceSyncServiceProvider).verdictFor(row.operationUuid);
    switch (row?.status) {
      case 'SYNCED':
        if (verdict?.status == 'PENDING_REVIEW') {
          return InReviewMessage(eventType: eventType, serverTime: verdict?.serverTime, flags: verdict!.flags);
        }
        // Para SYNCED, lastError se reutiliza como nota del servidor: 'LATE:<min>' si hubo retardo.
        final note = row?.lastError;
        return AcceptedMessage(
          eventType: eventType,
          serverTime: verdict?.serverTime,
          lateMinutes: note != null && note.startsWith('LATE:') ? note.substring(5) : null,
        );
      case 'REJECTED':
        final reason = row?.lastError;
        if (reason == 'LOW_GPS_ACCURACY') {
          return RejectedLowAccuracyMessage(accuracyM);
        }
        return RejectedMessage(reason, eventType: eventType, distanceM: verdict?.distanceToSiteM);
      case 'ERROR':
        // El servidor contestó y rechazó la operación en firme: anunciarlo como falta de
        // conexión dejaba al colaborador esperando una sincronización que nunca iba a ocurrir.
        return NotRegisteredMessage(row?.lastError);
      default:
        // PENDING o fila ausente: no se perdió, se reintentará.
        final reason = row?.lastError;
        if (reason == null || reason == AttendanceSyncService.offlineMarker) {
          return const SavedOfflineMessage();
        }
        return SavedRetryingMessage(reason);
    }
  }

  Future<void> syncNow() async {
    state = state.copyWith(busy: true);
    try {
      await ref.read(attendanceSyncServiceProvider).syncPending();
    } finally {
      await _refreshCount();
      // No se anuncia éxito a ciegas: si algo quedó sin subir, el mensaje dice qué pasó.
      final issue = state.lastIssue;
      final AttendanceMessage message = state.pendingCount == 0 && state.failedCount == 0
          ? const SyncCompletedMessage()
          : issue == null
              ? SyncPendingMessage(state.pendingCount)
              : SyncFailedMessage(issue);
      state = state.copyWith(busy: false, message: message);
      ref.invalidate(todayAttendanceProvider);
    }
  }

  Future<void> _refreshCount() async {
    final status = await ref.read(appDatabaseProvider).queueStatus();
    state = AttendanceUiState(
      busy: state.busy,
      message: state.message,
      pendingCount: status.pending,
      failedCount: status.failed,
      // Se reconstruye el estado en vez de usar copyWith porque lastIssue debe poder volver a
      // null cuando la cola se resuelve; con `??` el motivo antiguo quedaría pegado en pantalla.
      lastIssue: status.lastIssue,
    );
  }
}

final attendanceControllerProvider =
    NotifierProvider<AttendanceController, AttendanceUiState>(AttendanceController.new);
