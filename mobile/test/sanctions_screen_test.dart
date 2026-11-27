import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus_time_clock/l10n/app_localizations.dart';
import 'package:nexus_time_clock/src/app/theme.dart';
import 'package:nexus_time_clock/src/features/sanctions/data/sanction_repository.dart';
import 'package:nexus_time_clock/src/features/sanctions/domain/sanction_models.dart';
import 'package:nexus_time_clock/src/features/sanctions/presentation/sanctions_screen.dart';

Widget _app(List<MySanction> sanctions) => ProviderScope(
      overrides: [mySanctionsProvider.overrideWith((ref) async => sanctions)],
      child: MaterialApp(
        locale: const Locale('es'),
        theme: buildLightTheme(),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        home: const SanctionsScreen(),
      ),
    );

void main() {
  test('MySanction.fromJson lee la suspensión', () {
    final s = MySanction.fromJson(const {
      'id': 's1',
      'type': 'SUSPENSION',
      'reason': 'MISCONDUCT',
      'incidentDate': '2026-11-21',
      'description': 'Riña',
      'status': 'ACTIVE',
      'suspensionStart': '2026-11-23',
      'suspensionEnd': '2026-11-25',
      'suspensionDays': 3,
    });
    expect(s.isSuspension, isTrue);
    expect(s.suspensionDays, 3);
    expect(s.isVoided, isFalse);
  });

  testWidgets('muestra tipo, motivo, estado, hechos y anulación', (tester) async {
    await tester.pumpWidget(_app(const [
      MySanction(
        id: 's1',
        type: 'WRITTEN_WARNING',
        reason: 'TARDINESS',
        incidentDate: '2026-11-20',
        description: 'Tres retardos en la semana',
        status: 'ACTIVE',
        issuedByName: 'Sara López',
      ),
      MySanction(
        id: 's2',
        type: 'SUSPENSION',
        reason: 'MISCONDUCT',
        incidentDate: '2026-11-21',
        description: 'Riña en el área de trabajo',
        status: 'VOIDED',
        suspensionStart: '2026-11-23',
        suspensionEnd: '2026-11-25',
        suspensionDays: 3,
        voidReason: 'Se revisó el video',
      ),
    ]));
    await tester.pumpAndSettle();

    expect(find.text('Amonestación por escrito · Retardos'), findsOneWidget);
    expect(find.text('Vigente'), findsOneWidget);
    expect(find.text('Tres retardos en la semana'), findsOneWidget);
    expect(find.text('Abierta por Sara López'), findsOneWidget);
    expect(find.text('Suspensión · Mala conducta'), findsOneWidget);
    expect(find.textContaining('(3 días)'), findsOneWidget);
    expect(find.text('Anulada'), findsOneWidget);
    expect(find.text('Anulada: Se revisó el video'), findsOneWidget);
  });

  testWidgets('sin sanciones muestra el estado vacío', (tester) async {
    await tester.pumpWidget(_app(const []));
    await tester.pumpAndSettle();
    expect(find.text('No tienes sanciones registradas.'), findsOneWidget);
  });
}
