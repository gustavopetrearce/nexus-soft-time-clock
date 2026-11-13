import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus_time_clock/l10n/app_localizations.dart';
import 'package:nexus_time_clock/src/features/attendance/domain/attendance_record.dart';
import 'package:nexus_time_clock/src/features/attendance/presentation/attendance_l10n.dart';

AttendanceRecord _record(String status, {String? cancelReason}) => AttendanceRecord.fromJson({
      'eventType': 'ENTRADA',
      'status': status,
      'serverTime': '2026-11-13T13:05:00Z',
      'workCenter': 'Planta Norte',
      'cancelReason': cancelReason,
    });

void main() {
  test('solo aceptada o en revisión cuenta para la jornada; cancelada y rechazada no', () {
    expect(_record('ACCEPTED').countsAsAttendance, isTrue);
    expect(_record('PENDING_REVIEW').countsAsAttendance, isTrue);
    expect(_record('REJECTED').countsAsAttendance, isFalse);
    expect(_record('CANCELLED', cancelReason: 'Emergencia').countsAsAttendance, isFalse);
  });

  test('marca cancelada: estado y causa traducidos', () {
    final es = lookupAppLocalizations(const Locale('es'));
    final en = lookupAppLocalizations(const Locale('en'));
    final cancelled = _record('CANCELLED', cancelReason: 'Emergencia');

    expect(cancelled.isCancelled, isTrue);
    expect(cancelled.cancelReason, 'Emergencia');
    expect(es.recordStatus(cancelled), 'Cancelada');
    expect(en.recordStatus(cancelled), 'Cancelled');
    expect(es.recordCancelReason('Emergencia'), 'Cancelada: Emergencia');
  });
}
