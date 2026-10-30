import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus_time_clock/l10n/app_localizations.dart';
import 'package:nexus_time_clock/src/app/theme.dart';
import 'package:nexus_time_clock/src/features/admin_vacations/application/admin_vacations_controller.dart';
import 'package:nexus_time_clock/src/features/admin_vacations/data/admin_vacation_repository.dart';
import 'package:nexus_time_clock/src/features/admin_vacations/domain/admin_vacation_models.dart';
import 'package:nexus_time_clock/src/features/vacations/presentation/vacations_screen.dart';

/// Bandeja simulada: guarda el filtro pedido y responde 409 al resolver.
class _FakeAdminRepo extends AdminVacationRepository {
  _FakeAdminRepo() : super(Dio());

  final statuses = <String?>[];

  @override
  Future<PagedVacations> list({int page = 0, int size = 20, String? status}) async {
    statuses.add(status);
    return PagedVacations.fromJson(const {'content': [], 'page': 0, 'totalElements': 0, 'totalPages': 0});
  }

  @override
  Future<void> resolve(String id, {required bool approve, String? note}) async {
    final options = RequestOptions(path: '/vacations/requests/$id/resolve');
    throw DioException(requestOptions: options, response: Response(requestOptions: options, statusCode: 409));
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
}
