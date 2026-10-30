import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/i18n/l10n.dart';
import '../core/i18n/locale_controller.dart';
import '../core/theme/theme_mode_controller.dart';
import 'router.dart';
import 'theme.dart';

/// Widget raíz. Material 3 con el tema del design system (claro/oscuro: el del sistema o el
/// elegido en Inicio, [themeModeControllerProvider]) e i18n (es/en). El idioma sale de
/// [localeControllerProvider]: el elegido por el usuario o, si no eligió, el del sistema (con
/// español como respaldo si el del sistema no es es/en).
/// El árbol de rutas y el redirect de sesión provienen de [routerProvider].
class NexusTimeClockApp extends ConsumerWidget {
  const NexusTimeClockApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      onGenerateTitle: (context) => context.l10n.appTitle,
      debugShowCheckedModeBanner: false,
      theme: buildLightTheme(),
      darkTheme: buildDarkTheme(),
      themeMode: ref.watch(themeModeControllerProvider),
      scrollBehavior: const NxScrollBehavior(),
      routerConfig: router,
      locale: ref.watch(localeControllerProvider),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      localeResolutionCallback: resolveLocale,
    );
  }
}

/// Idioma del sistema si está soportado; si no, español (el idioma base del producto).
Locale resolveLocale(Locale? device, Iterable<Locale> supported) {
  for (final locale in supported) {
    if (locale.languageCode == device?.languageCode) return locale;
  }
  return const Locale('es');
}
