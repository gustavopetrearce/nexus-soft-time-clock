import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus_time_clock/l10n/app_localizations.dart';
import 'package:nexus_time_clock/src/app/theme.dart';
import 'package:nexus_time_clock/src/features/admin_vacations/application/admin_vacations_controller.dart';
import 'package:nexus_time_clock/src/features/admin_vacations/data/admin_vacation_repository.dart';
import 'package:nexus_time_clock/src/features/admin_vacations/domain/admin_vacation_models.dart';
import 'package:nexus_time_clock/src/features/vacations/domain/vacation_models.dart';
import 'package:nexus_time_clock/src/features/vacations/presentation/vacations_screen.dart';

/// Bandeja simulada: guarda el filtro pedido y responde 409 al resolver.
class _FakeAdminRepo extends AdminVacationRepository {
  _FakeAdminRepo() : super(Dio());

  final statuses = <String?>[];
  final cancellationFlags = <bool>[];

  @override
  Future<PagedVacations> list({int page = 0, int size = 20, String? status, bool cancellationPending = false}) async {
    statuses.add(status);
    cancellationFlags.add(cancellationPending);
    return PagedVacations.fromJson(const {'content': [], 'page': 0, 'totalElements': 0, 'totalPages': 0});
  }

  @override
  Future<void> resolve(String id, {required bool approve, String? note}) async {
    final options = RequestOptions(path: '/vacations/requests/$id/resolve');
    throw DioException(requestOptions: options, response: Response(requestOptions: options, statusCode: 409));
  }

  final cancellationDecisions = <bool>[];

  @override
  Future<void> resolveCancellation(String id, {required bool accept, String? note}) async {
    cancellationDecisions.add(accept);
  }
}

Widget _wrap(Widget child, {List<Override> overrides = const []}) => ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        locale: const Locale('es'),
        theme: buildLightTheme(),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        home: Scaffold(body: child),
      ),
    );

void main() {
  testWidgets('P09: enviar sin fechas marca ambas como obligatorias y no envía', (tester) async {
    await tester.pumpWidget(_wrap(const VacationRequestSheet()));
    await tester.tap(find.text('Enviar solicitud'));
    await tester.pump();

    expect(find.text('Este campo es obligatorio.'), findsNWidgets(2));
    expect(find.text('0/500'), findsOneWidget);
  });

  test('P10: la bandeja pide solo PENDING y un 409 se informa como ya resuelta', () async {
    final repo = _FakeAdminRepo();
    final container = ProviderContainer(overrides: [adminVacationRepositoryProvider.overrideWithValue(repo)]);
    addTearDown(container.dispose);

    final controller = container.read(adminVacationsControllerProvider.notifier);
    await controller.load();
    expect(repo.statuses, everyElement('PENDING'));

    final request = AdminVacationRequest.fromJson(const {'id': 'r1', 'status': 'PENDING'});
    expect(await controller.resolve(request, approve: true), ResolveOutcome.alreadyResolved);
  });

  test('P10: la pestaña Cancelaciones pide las cancelaciones pendientes y las resuelve', () async {
    final repo = _FakeAdminRepo();
    final container = ProviderContainer(overrides: [adminVacationRepositoryProvider.overrideWithValue(repo)]);
    addTearDown(container.dispose);

    final controller = container.read(adminVacationsControllerProvider.notifier);
    await controller.load();
    await controller.selectTab(AdminVacationsTab.cancellations);
    expect(repo.cancellationFlags.last, isTrue);
    expect(repo.statuses.last, isNull);

    final request = AdminVacationRequest.fromJson(const {
      'id': 'r2',
      'status': 'APPROVED',
      'cancelRequestStatus': 'PENDING',
      'cancelRequestReason': 'Reagendar',
    });
    expect(request.cancellationPending, isTrue);
    expect(await controller.resolveCancellation(request, accept: true), ResolveOutcome.resolved);
    expect(repo.cancellationDecisions, [true]);
  });

  testWidgets('cancelación: sin motivo no se envía', (tester) async {
    const request = MyVacationRequest(
      id: 'v1',
      startDate: '2026-12-21',
      endDate: '2026-12-24',
      days: 4,
      status: 'APPROVED',
      canRequestCancellation: true,
    );
    await tester.pumpWidget(_wrap(const VacationCancelSheet(request: request)));
    await tester.tap(find.text('Enviar solicitud de cancelación'));
    await tester.pump();

    expect(find.text('Indica el motivo de la cancelación.'), findsOneWidget);
    expect(find.text('Cancelada a petición del colaborador'), findsNothing);
    expect(find.text('Aprobada'), findsOneWidget);
  });

  test('MyVacationRequest lee la cancelación pedida', () {
    final r = MyVacationRequest.fromJson(const {
      'id': 'v1',
      'status': 'PENDING',
      'cancelRequestStatus': 'PENDING',
      'cancelRequestReason': 'Ya no viajo',
      'canRequestCancellation': false,
    });
    expect(r.cancellationPending, isTrue);
    expect(r.canRequestCancellation, isFalse);
  });
}
