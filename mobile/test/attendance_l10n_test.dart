import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus_time_clock/l10n/app_localizations.dart';
import 'package:nexus_time_clock/src/features/attendance/application/attendance_message.dart';
import 'package:nexus_time_clock/src/features/attendance/presentation/attendance_l10n.dart';

void main() {
  final es = lookupAppLocalizations(const Locale('es'));
  final en = lookupAppLocalizations(const Locale('en'));

  test('los mensajes del controller se traducen al idioma activo', () {
    final at = DateTime(2026, 10, 30, 8, 2);
    final late = AcceptedMessage(eventType: 'ENTRADA', serverTime: at, lateMinutes: '7');
    expect(es.attendanceMessageText(late), 'Entrada registrada a las 08:02. Con 7 min de retardo.');
    expect(en.attendanceMessageText(late), 'Clock in recorded at 08:02. 7 min late.');
    expect(
      es.attendanceMessageText(AcceptedMessage(eventType: 'INICIO_DESCANSO', serverTime: at)),
      'Inicio de descanso registrado a las 08:02.',
    );

    const rejected = RejectedMessage('OUT_OF_GEOFENCE', eventType: 'ENTRADA', distanceM: 120.4);
    expect(
      es.attendanceMessageText(rejected),
      'Estás a 120 m del centro, fuera del área permitida. Acércate e inténtalo de nuevo.',
    );
    expect(
      en.attendanceMessageText(const RejectedMessage('OUT_OF_GEOFENCE')),
      "You're outside the site's allowed area. Move closer and try again.",
    );
  });

  test('registro en revisión: hora, bandera y nota del supervisor (RN-29)', () {
    final review = InReviewMessage(
      eventType: 'ENTRADA',
      serverTime: DateTime(2026, 10, 30, 8, 2),
      flags: const ['MOCK_LOCATION'],
    );
    expect(
      es.attendanceMessageText(review),
      'Entrada registrada a las 08:02. Se detectó ubicación simulada. Tu supervisor revisará este registro.',
    );
    expect(review.persistent, isTrue);
    expect(const SavedOfflineMessage().persistent, isFalse);
  });

  test('cada motivo de rechazo tiene su mensaje completo', () {
    const reasons = [
      'OUT_OF_GEOFENCE', 'LOW_GPS_ACCURACY', 'GPS_UNAVAILABLE', 'INVALID_QR', 'OUT_OF_SCHEDULE',
      'INVALID_SEQUENCE', 'UNTRUSTED_DEVICE', 'FRAUD_MOCK_LOCATION', 'FRAUD_GPS_SPOOF_APP',
      'FRAUD_ROOTED_DEVICE', 'REPLAY_DETECTED', 'PHOTO_REQUIRED', 'BIOMETRIC_REQUIRED',
      'EVENT_TYPE_DISABLED', 'SITELESS_NOT_ALLOWED',
    ];
    for (final reason in reasons) {
      expect(es.rejectionMessage(reason), isNot(contains(reason)), reason: reason);
    }
    expect(es.rejectionMessage('INVALID_SEQUENCE', eventType: 'ENTRADA'),
        'Ya registraste tu entrada. Lo siguiente es la salida.',);
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

  test('tipos de evento: el nombre sembrado se traduce, uno propio de la empresa se respeta', () {
    expect(en.eventTypeLabel('INICIO_DESCANSO', 'Inicio de descanso'), 'Break start');
    expect(es.eventTypeLabel('INICIO_DESCANSO', 'Inicio de descanso'), 'Inicio de descanso');
    expect(en.eventTypeLabel('INICIO_DESCANSO', 'Comida'), 'Comida');
    expect(en.eventTypeLabel('CAMBIO_SITIO', ''), en.eventCambioSitio);
  });

  test('plurales de vacaciones', () {
    expect(en.vacationsDays(1), '1 day');
    expect(es.vacationsDays(12), '12 días');
    expect(en.vacationsYearsOfService(3), '3 years at the company');
  });
}
