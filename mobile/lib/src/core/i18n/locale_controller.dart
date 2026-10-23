import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../l10n/app_localizations.dart';

/// Preferencias del dispositivo. Se abre en `main` antes de `runApp` y se inyecta con override,
/// así el idioma elegido está disponible en el primer frame (sin parpadeo de idioma).
final sharedPreferencesProvider = Provider<SharedPreferences>(
  (ref) => throw UnimplementedError('sharedPreferencesProvider se inyecta en main()'),
);

/// Idioma de la interfaz elegido por el usuario; `null` = seguir el idioma del sistema.
///
/// Es una preferencia del dispositivo, no del colaborador: no se borra al cerrar sesión
/// (no pertenece a `_clearUserScopedState`).
class LocaleController extends Notifier<Locale?> {
  static const _key = 'app.locale';

  @override
  Locale? build() {
    final code = ref.watch(sharedPreferencesProvider).getString(_key);
    final supported = AppLocalizations.supportedLocales.any((l) => l.languageCode == code);
    return supported ? Locale(code!) : null;
  }

  Future<void> set(Locale? locale) async {
    state = locale;
    final prefs = ref.read(sharedPreferencesProvider);
    if (locale == null) {
      await prefs.remove(_key);
    } else {
      await prefs.setString(_key, locale.languageCode);
    }
  }
}

final localeControllerProvider =
    NotifierProvider<LocaleController, Locale?>(LocaleController.new);
