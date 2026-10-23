import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'src/app/app.dart';
import 'src/core/i18n/locale_controller.dart';

/// Punto de entrada de la app de empleados.
///
/// En la Iteración 12 aquí se inicializan Firebase (Core/Messaging/Crashlytics).
/// Analytics queda fuera a propósito: ver la nota del `pubspec.yaml`. La base de
/// datos local (Drift) y la cola de sincronización offline-first se conectan en la
/// Iteración 9.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Las preferencias (idioma elegido) se leen antes del primer frame.
  final prefs = await SharedPreferences.getInstance();
  // Nombres de meses y formatos de fecha de los idiomas de la app para `DateFormat`.
  await initializeDateFormatting();
  runApp(
    ProviderScope(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
      child: const NexusTimeClockApp(),
    ),
  );
}
