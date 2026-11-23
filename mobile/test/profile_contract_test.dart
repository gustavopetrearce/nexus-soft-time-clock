import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus_time_clock/l10n/app_localizations.dart';
import 'package:nexus_time_clock/src/app/theme.dart';
import 'package:nexus_time_clock/src/core/i18n/locale_controller.dart';
import 'package:nexus_time_clock/src/features/auth/data/auth_repository.dart';
import 'package:nexus_time_clock/src/features/auth/domain/auth_models.dart';
import 'package:nexus_time_clock/src/features/profile/data/profile_repository.dart';
import 'package:nexus_time_clock/src/features/profile/domain/my_contract.dart';
import 'package:nexus_time_clock/src/features/profile/domain/my_profile.dart';
import 'package:nexus_time_clock/src/features/profile/presentation/profile_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<Widget> _app(MyContract? contract) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  return ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        myProfileProvider.overrideWith(
          (ref) async => const MyProfile(userId: 'u1', fullName: 'Ada Lovelace', hireDate: '2026-01-05'),
        ),
        myContractProvider.overrideWith((ref) async => contract),
        meProvider.overrideWith(
          (ref) async => const Me(
            userId: 'u1',
            tenantId: 't1',
            tenantName: 'Constructora Norte',
            platformAdmin: false,
            roles: ['EMPLOYEE'],
            permissions: [],
          ),
        ),
      ],
      child: MaterialApp(
        locale: const Locale('es'),
        theme: buildLightTheme(),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        home: const ProfileScreen(),
      ),
    );
}

/// Pantalla alta: la ficha de la empresa queda bajo el pliegue y el ListView no la construiría.
void _tall(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 4000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  test('MyContract.fromJson lee el contrato por proyecto', () {
    final c = MyContract.fromJson(const {
      'type': 'PROJECT',
      'projectCode': 'OBRA',
      'projectName': 'Obra norte',
      'startsOn': '2026-11-01',
      'endsOn': null,
      'current': true,
    });
    expect(c.isProject, isTrue);
    expect(c.projectLabel, 'OBRA · Obra norte');
    expect(c.endsOn, isNull);
  });

  testWidgets('muestra el contrato por proyecto y su proyecto', (tester) async {
    _tall(tester);
    await tester.pumpWidget(await _app(const MyContract(
      type: 'PROJECT',
      projectCode: 'OBRA',
      projectName: 'Obra norte',
      startsOn: '2026-11-01',
      current: true,
    ),),);
    await tester.pumpAndSettle();

    expect(find.text('Constructora Norte'), findsOneWidget);
    expect(find.text('Por proyecto'), findsOneWidget);
    expect(find.text('OBRA · Obra norte'), findsOneWidget);
    expect(find.textContaining('indefinido'), findsOneWidget);
  });

  testWidgets('el próximo contrato por turno se señala como próximo', (tester) async {
    _tall(tester);
    await tester.pumpWidget(await _app(const MyContract(type: 'SHIFT', startsOn: '2027-01-01', endsOn: '2027-06-30'),),);
    await tester.pumpAndSettle();

    expect(find.text('Por turno (próximo)'), findsOneWidget);
    expect(find.text('Proyecto'), findsNothing);
  });

  testWidgets('sin contrato lo dice', (tester) async {
    _tall(tester);
    await tester.pumpWidget(await _app(null));
    await tester.pumpAndSettle();

    expect(find.text('Sin contrato registrado'), findsOneWidget);
  });
}
