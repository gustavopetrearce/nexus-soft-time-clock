import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus_time_clock/l10n/app_localizations.dart';
import 'package:nexus_time_clock/src/features/attendance/application/attendance_message.dart';
import 'package:nexus_time_clock/src/features/attendance/presentation/attendance_l10n.dart';

void main() {
  final es = lookupAppLocalizations(const Locale('es'));
  final en = lookupAppLocalizations(const Locale('en'));

  test('los mensajes del controller se traducen al idioma activo', () {
    const late = AcceptedMessage(lateMinutes: '7');
    expect(es.attendanceMessageText(late), 'Registro aceptado (retardo de 7 min).');
    expect(en.attendanceMessageText(late), 'Record accepted (7 min late).');

    const rejected = RejectedMessage('OUT_OF_GEOFENCE');
    expect(es.attendanceMessageText(rejected), 'Registro rechazado: fuera del área permitida.');
    expect(en.attendanceMessageText(rejected), 'Record rejected: outside the allowed area.');
  });

  test('plural de operaciones pendientes', () {
    expect(en.attendanceMessageText(const SyncPendingMessage(1)), '1 operation left to sync.');
    expect(es.attendanceMessageText(const SyncPendingMessage(3)), 'Quedan 3 operaciones por sincronizar.');
  });

  test('motivos de fallo: permisos, servidor y código desconocido', () {
    expect(en.failurePhrase('HTTP_403'), 'your account is not allowed to record attendance');
    expect(en.failurePhrase('SYNC_ERROR'), 'internal server error');
    expect(en.rejectionPhrase('SOMETHING_NEW'), 'SOMETHING_NEW');
    expect(en.rejectionPhrase(null), 'unknown reason');
  });
}
