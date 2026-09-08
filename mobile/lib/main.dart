import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/app/app.dart';

/// Punto de entrada de la app de empleados.
///
/// En la Iteración 12 aquí se inicializan Firebase (Core/Messaging/Crashlytics).
/// Analytics queda fuera a propósito: ver la nota del `pubspec.yaml`. La base de
/// datos local (Drift) y la cola de sincronización offline-first se conectan en la
/// Iteración 9.
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: NexusTimeClockApp()));
}
