import 'package:flutter_test/flutter_test.dart';
import 'package:nexus_time_clock/src/features/attendance/application/today_attendance.dart';
import 'package:nexus_time_clock/src/features/attendance/domain/break_type.dart';

void main() {
  test('BreakOption lee la disponibilidad de /attendance/me/break-options', () {
    final o = BreakOption.fromJson(const {
      'id': 'b1',
      'code': 'ALMUERZO',
      'label': 'Almuerzo',
      'paid': false,
      'available': false,
      'availability': 'ALREADY_USED',
    });
    expect(o.type.label, 'Almuerzo');
    expect(o.available, isFalse);
    expect(o.availability, 'ALREADY_USED');
  });

  test('sin red, los descansos de hoy aún en cola cuentan como usados', () {
    final now = DateTime(2026, 11, 27, 13);
    final used = breakTypesUsedOfflineToday([
      LocalPendingRecord(eventType: 'INICIO_DESCANSO', deviceTime: DateTime(2026, 11, 27, 10), breakTypeId: 'almuerzo'),
      LocalPendingRecord(eventType: 'FIN_DESCANSO', deviceTime: DateTime(2026, 11, 27, 10, 30)),
      // De ayer: no cuenta para hoy.
      LocalPendingRecord(eventType: 'INICIO_DESCANSO', deviceTime: DateTime(2026, 11, 26, 12), breakTypeId: 'comida'),
    ], now);
    expect(used, {'almuerzo'});
  });
}
