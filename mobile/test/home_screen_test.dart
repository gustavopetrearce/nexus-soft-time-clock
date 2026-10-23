import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus_time_clock/l10n/app_localizations.dart';
import 'package:nexus_time_clock/src/features/auth/data/auth_repository.dart';
import 'package:nexus_time_clock/src/features/auth/domain/auth_models.dart';
import 'package:nexus_time_clock/src/features/home/presentation/home_screen.dart';

Widget _app(Locale locale) => ProviderScope(
      // Sin override, meProvider dispara la llamada real a /auth/me (dio), cuyo timer
      // queda pendiente tras disponer el árbol. Lo fijamos a un usuario sin permisos admin.
      overrides: [
        meProvider.overrideWith(
          (ref) => const Me(
            userId: 'u1',
            tenantId: 't1',
            platformAdmin: false,
            roles: [],
            permissions: [],
          ),
        ),
      ],
      child: MaterialApp(
        locale: locale,
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        home: const HomeScreen(),
      ),
    );

void main() {
  testWidgets('HomeScreen muestra el título, los accesos y permite cerrar sesión', (tester) async {
    await tester.pumpWidget(_app(const Locale('es')));
    await tester.pumpAndSettle();

    expect(find.text('Nexus Soft Time Clock'), findsOneWidget);
    expect(find.text('Registrar asistencia'), findsOneWidget);
    expect(find.text('Mi perfil'), findsOneWidget);
    expect(find.text('Mis vacaciones'), findsOneWidget);
    expect(find.byIcon(Icons.schedule), findsOneWidget);
    expect(find.byIcon(Icons.logout), findsOneWidget);
  });

  testWidgets('HomeScreen en inglés', (tester) async {
    await tester.pumpWidget(_app(const Locale('en')));
    await tester.pumpAndSettle();

    expect(find.text('Clock in / out'), findsOneWidget);
    expect(find.text('My profile'), findsOneWidget);
    expect(find.text('My vacations'), findsOneWidget);
    expect(find.text('Registrar asistencia'), findsNothing);
  });
}
