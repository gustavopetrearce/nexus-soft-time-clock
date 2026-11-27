import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus_time_clock/l10n/app_localizations.dart';
import 'package:nexus_time_clock/src/app/theme.dart';
import 'package:nexus_time_clock/src/features/permits/data/permit_repository.dart';
import 'package:nexus_time_clock/src/features/permits/domain/permit_models.dart';
import 'package:nexus_time_clock/src/features/permits/presentation/permits_screen.dart';

/// Repositorio falso: registra lo que se envía en vez de llamar a la API.
class _FakeRepo implements PermitRepository {
  final sent = <Map<String, String>>[];

  @override
  Future<List<MyPermit>> myPermits() async => const [];

  @override
  Future<MyPermit> requestIncapacity({required String startDate, required String endDate, required String notes}) async {
    sent.add({'startDate': startDate, 'endDate': endDate, 'notes': notes});
    return MyPermit(
      id: 'n1',
      type: 'ABSENCE',
      reason: 'INCAPACIDAD',
      startDate: startDate,
      endDate: endDate,
      days: 1,
      status: 'PENDING',
      payStatus: 'PENDING_REVIEW',
      notes: notes,
      requestedByEmployee: true,
    );
  }
}

Widget _app(List<MyPermit> permits, {PermitRepository? repo}) => ProviderScope(
      overrides: [
        myPermitsProvider.overrideWith((ref) async => permits),
        if (repo != null) permitRepositoryProvider.overrideWithValue(repo),
      ],
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

  testWidgets('una solicitud pendiente muestra su estatus y el motivo, sin goce', (tester) async {
    await tester.pumpWidget(_app(const [
      MyPermit(
        id: 'p3',
        type: 'ABSENCE',
        reason: 'INCAPACIDAD',
        startDate: '2026-11-16',
        endDate: '2026-11-16',
        days: 1,
        status: 'PENDING',
        payStatus: 'PENDING_REVIEW',
        notes: 'Gripe, folio 123',
        requestedByEmployee: true,
      ),
      MyPermit(
        id: 'p4',
        type: 'ABSENCE',
        reason: 'INCAPACIDAD',
        startDate: '2026-11-18',
        endDate: '2026-11-18',
        days: 1,
        status: 'REJECTED',
        payStatus: 'PENDING_REVIEW',
        notes: 'Migraña',
        resolvedByName: 'Sara López',
        resolutionNote: 'Sin comprobante',
        requestedByEmployee: true,
      ),
    ]));
    await tester.pumpAndSettle();

    expect(find.text('Pendiente'), findsOneWidget);
    expect(find.text('Rechazado'), findsOneWidget);
    expect(find.text('Observaciones: Gripe, folio 123'), findsOneWidget);
    expect(find.text('Nota: Sin comprobante'), findsOneWidget);
    expect(find.text('Rechazado por Sara López'), findsOneWidget);
    expect(find.text('Goce pendiente'), findsNothing);
  });

  testWidgets('solicitar incapacidad exige fechas y observaciones', (tester) async {
    final repo = _FakeRepo();
    await tester.pumpWidget(_app(const [], repo: repo));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Solicitar incapacidad').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Enviar solicitud'));
    await tester.pumpAndSettle();

    expect(find.text('Escribe el motivo exacto de la incapacidad.'), findsOneWidget);
    expect(repo.sent, isEmpty);

    // Elegir hoy en ambos selectores y escribir el motivo.
    for (var i = 0; i < 2; i++) {
      // Tras elegir la primera, solo queda un marcador "Elige una fecha".
      await tester.tap(find.text('Elige una fecha').first);
      await tester.pumpAndSettle();
      final ok = MaterialLocalizations.of(tester.element(find.byType(DatePickerDialog))).okButtonLabel;
      await tester.tap(find.text(ok));
      await tester.pumpAndSettle();
    }
    await tester.enterText(find.byType(TextField).last, '  Infección, folio 99  ');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Enviar solicitud'));
    await tester.pumpAndSettle();

    expect(repo.sent, hasLength(1));
    expect(repo.sent.single['notes'], 'Infección, folio 99');
    expect(find.text('Solicitud de incapacidad enviada.'), findsOneWidget);
  });
}
