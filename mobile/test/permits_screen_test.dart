import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus_time_clock/l10n/app_localizations.dart';
import 'package:nexus_time_clock/src/app/theme.dart';
import 'package:nexus_time_clock/src/features/permits/data/permit_repository.dart';
import 'package:nexus_time_clock/src/features/permits/domain/permit_models.dart';
import 'package:nexus_time_clock/src/features/permits/presentation/permits_screen.dart';

Widget _app(List<MyPermit> permits) => ProviderScope(
      overrides: [myPermitsProvider.overrideWith((ref) async => permits)],
      child: MaterialApp(
        locale: const Locale('es'),
        theme: buildLightTheme(),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        home: const PermitsScreen(),
      ),
    );

void main() {
  test('MyPermit.fromJson lee el permiso y acorta la hora', () {
    final p = MyPermit.fromJson(const {
      'id': 'p1',
      'type': 'LATE_ARRIVAL',
      'reason': 'MEDICO',
      'startDate': '2026-11-16',
      'endDate': '2026-11-16',
      'days': 1,
      'timeAt': '10:30:00',
      'status': 'APPROVED',
      'payStatus': 'WITH_PAY',
    });
    expect(p.isAbsence, isFalse);
    expect(p.shortTime, '10:30');
    expect(p.payStatus, 'WITH_PAY');
  });

  testWidgets('muestra tipo, motivo, goce y estatus de cada permiso', (tester) async {
    await tester.pumpWidget(_app(const [
      MyPermit(
        id: 'p1',
        type: 'ABSENCE',
        reason: 'INCAPACIDAD',
        startDate: '2026-11-16',
        endDate: '2026-11-20',
        days: 5,
        status: 'APPROVED',
        payStatus: 'PENDING_REVIEW',
        grantedByName: 'Sara López',
      ),
      MyPermit(
        id: 'p2',
        type: 'EARLY_DEPARTURE',
        reason: 'PERSONAL',
        startDate: '2026-11-23',
        endDate: '2026-11-23',
        days: 1,
        timeAt: '15:00:00',
        status: 'CANCELLED',
        payStatus: 'WITHOUT_PAY',
      ),
    ]));
    await tester.pumpAndSettle();

    expect(find.text('Falta · Incapacidad'), findsOneWidget);
    expect(find.text('Goce pendiente'), findsOneWidget);
    expect(find.text('Aprobado'), findsOneWidget);
    expect(find.text('Otorgado por Sara López'), findsOneWidget);
    expect(find.text('Salida temprano · Personal'), findsOneWidget);
    expect(find.textContaining('15:00'), findsOneWidget);
    expect(find.text('Sin goce'), findsOneWidget);
    expect(find.text('Cancelado'), findsOneWidget);
  });

  testWidgets('sin permisos muestra el estado vacío', (tester) async {
    await tester.pumpWidget(_app(const []));
    await tester.pumpAndSettle();
    expect(find.text('No tienes permisos registrados.'), findsOneWidget);
  });
}
