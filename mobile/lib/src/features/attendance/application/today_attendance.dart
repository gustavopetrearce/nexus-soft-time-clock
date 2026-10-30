import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/db/app_database.dart';
import '../data/attendance_history_service.dart';
import '../domain/attendance_record.dart';

/// Marcación que sigue en la cola local («Pendiente de enviar», RN-53): aún no tiene hora del
/// servidor, así que se muestra con la del dispositivo al registrarla.
class LocalPendingRecord {
  const LocalPendingRecord({required this.eventType, required this.deviceTime});

  final String eventType;
  final DateTime deviceTime;
}

/// Operaciones aún por enviar, de la más reciente a la más antigua.
Future<List<LocalPendingRecord>> localPendingRecords(AppDatabase db) async {
  final rows = await db.pending();
  final out = <LocalPendingRecord>[];
  for (final row in rows) {
    try {
      final json = jsonDecode(row.payload) as Map<String, dynamic>;
      final epoch = json['deviceTimeEpochMs'] as int?;
      out.add(LocalPendingRecord(
        eventType: json['eventType'] as String,
        deviceTime: epoch == null ? row.createdAt : DateTime.fromMillisecondsSinceEpoch(epoch),
      ),);
    } catch (_) {
      // Una fila ilegible no debe tumbar la pantalla: el sync la resolverá o la marcará.
    }
  }
  out.sort((a, b) => b.deviceTime.compareTo(a.deviceTime));
  return out;
}

/// Lo registrado hoy: el último registro válido del servidor (cabecera de P03) y el evento que
/// toca ahora (botón primary de P04).
class TodayAttendance {
  const TodayAttendance({this.lastRecord, this.lastPending, this.serverAvailable = true});

  /// Último registro del día que cuenta para la secuencia (aceptado o en revisión).
  final AttendanceRecord? lastRecord;

  /// Última marcación de hoy que sigue en la cola local.
  final LocalPendingRecord? lastPending;

  /// `false` si no se pudo consultar el historial (sin red): solo se conoce la cola local.
  final bool serverAvailable;

  /// Evento más reciente de hoy, contando la cola local.
  String? get lastEventType {
    final pending = lastPending;
    final record = lastRecord;
    if (pending != null && (record == null || pending.deviceTime.isAfter(record.serverTime))) {
      return pending.eventType;
    }
    return record?.eventType;
  }

  /// Lo siguiente es la salida si hay una entrada (o un evento intermedio) sin cerrar.
  String get nextEvent {
    final last = lastEventType;
    return last == null || last == 'SALIDA' ? 'ENTRADA' : 'SALIDA';
  }
}

final todayAttendanceProvider = FutureProvider<TodayAttendance>((ref) async {
  final now = DateTime.now();
  final startOfDay = DateTime(now.year, now.month, now.day);
  final pending = (await localPendingRecords(ref.read(appDatabaseProvider)))
      .where((p) => !p.deviceTime.isBefore(startOfDay))
      .toList();
  try {
    final records = await ref.read(attendanceHistoryServiceProvider).myHistory(from: startOfDay, to: now, limit: 50);
    final valid = records.where((r) => !r.isRejected && !r.serverTime.isBefore(startOfDay)).toList()
      ..sort((a, b) => b.serverTime.compareTo(a.serverTime));
    return TodayAttendance(
      lastRecord: valid.isEmpty ? null : valid.first,
      lastPending: pending.isEmpty ? null : pending.first,
    );
  } catch (_) {
    return TodayAttendance(lastPending: pending.isEmpty ? null : pending.first, serverAvailable: false);
  }
});
