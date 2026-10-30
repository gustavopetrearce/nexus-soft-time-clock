import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus_time_clock/l10n/app_localizations.dart';
import 'package:nexus_time_clock/src/app/theme.dart';
import 'package:nexus_time_clock/src/core/i18n/locale_controller.dart';
import 'package:nexus_time_clock/src/features/attendance/application/attendance_controller.dart';
import 'package:nexus_time_clock/src/features/attendance/application/today_attendance.dart';
import 'package:nexus_time_clock/src/features/attendance/domain/attendance_record.dart';
import 'package:nexus_time_clock/src/features/auth/data/auth_repository.dart';
import 'package:nexus_time_clock/src/features/auth/domain/auth_models.dart';
import 'package:nexus_time_clock/src/features/home/presentation/home_screen.dart';
import 'package:nexus_time_clock/src/features/profile/data/profile_repository.dart';
import 'package:nexus_time_clock/src/features/profile/domain/my_profile.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Cola local vacía, sin tocar la base de datos.
class _IdleAttendance extends AttendanceController {
  _IdleAttendance(this._pending);

  final int _pending;

  @override
  AttendanceUiState build() => AttendanceUiState(pendingCount: _pending);
}

Future<Widget> _app(
  Locale locale, {
  List<String> permissions = const [],
  TodayAttendance today = const TodayAttendance(),
  int pending = 0,
}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  return ProviderScope(
    // Sin overrides, los providers dispararían llamadas reales (dio) y la base local, cuyos
    // timers quedan pendientes tras disponer el árbol.
    overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      meProvider.overrideWith(
        (ref) => Me(
          userId: 'u1',
          tenantId: 't1',
          platformAdmin: false,
          roles: const [],
          permissions: permissions,
        ),
      ),
      myProfileProvider.overrideWith(
        (ref) => MyProfile.fromJson(const {'fullName': 'Ana López Hernández', 'email': 'ana@example.com'}),
      ),
      todayAttendanceProvider.overrideWith((ref) => today),
      attendanceControllerProvider.overrideWith(() => _IdleAttendance(pending)),
    ],
    child: MaterialApp(
      locale: locale,
      theme: buildLightTheme(),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      home: const HomeScreen(),
    ),
  );
}

void main() {
  testWidgets('Inicio: barra, saludo, accesos y acción principal', (tester) async {
    await tester.pumpWidget(await _app(const Locale('es')));
    await tester.pumpAndSettle();

    expect(find.text('Inicio'), findsOneWidget);
    expect(find.text('Hola'), findsOneWidget);
    expect(find.text('Ana López Hernández'), findsOneWidget);
    // "Registrar asistencia" es tarjeta y botón fijo.
    expect(find.text('Registrar asistencia'), findsNWidgets(2));
    expect(find.text('Mi perfil'), findsOneWidget);
    expect(find.text('Mis vacaciones'), findsOneWidget);
    expect(find.text('Aprobar vacaciones'), findsNothing);
    expect(find.byIcon(Icons.translate), findsOneWidget);
    expect(find.byIcon(Icons.dark_mode_outlined), findsOneWidget);
    expect(find.byIcon(Icons.account_circle_outlined), findsOneWidget);
    // Sin registros hoy.
    expect(find.text('Aún no registras asistencia hoy.'), findsOneWidget);
    // El cierre de sesión está en Mi perfil (P31), no en Inicio.
    expect(find.byIcon(Icons.logout), findsNothing);
  });

  testWidgets('Inicio: último registro del día, cola local y acceso de aprobación', (tester) async {
    final today = TodayAttendance(
      lastRecord: AttendanceRecord(
        eventType: 'ENTRADA',
        status: 'ACCEPTED',
        serverTime: DateTime(2026, 10, 30, 8, 2),
        workCenter: 'Almacén Norte',
      ),
    );
    await tester.pumpWidget(await _app(
      const Locale('es'),
      permissions: const ['vacation:approve'],
      today: today,
      pending: 2,
    ),);
    await tester.pumpAndSettle();

    expect(find.text('Último registro: Entrada · 08:02 · Almacén Norte'), findsOneWidget);
    expect(find.text('Aún no registras asistencia hoy.'), findsNothing);
    expect(find.text('Sin señal. 2 registros guardados en tu teléfono.'), findsOneWidget);
    expect(find.text('Aprobar vacaciones'), findsOneWidget);
  });

  testWidgets('Inicio en inglés', (tester) async {
    await tester.pumpWidget(await _app(const Locale('en')));
    await tester.pumpAndSettle();

    expect(find.text('Home'), findsOneWidget);
    expect(find.text('My profile'), findsOneWidget);
    expect(find.text('My vacations'), findsOneWidget);
    expect(find.text('Registrar asistencia'), findsNothing);
  });
}
