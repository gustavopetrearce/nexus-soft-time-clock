import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/locale_controller.dart';

/// Tema elegido con el botón de la barra de Inicio (P03); `system` = seguir al teléfono.
///
/// Como el idioma, es una preferencia del dispositivo: no se borra al cerrar sesión.
class ThemeModeController extends Notifier<ThemeMode> {
  static const _key = 'app.themeMode';

  @override
  ThemeMode build() {
    final stored = ref.watch(sharedPreferencesProvider).getString(_key);
    return ThemeMode.values.firstWhere((m) => m.name == stored, orElse: () => ThemeMode.system);
  }

  /// Alterna entre claro y oscuro partiendo del brillo que se ve ahora (el del sistema si no
  /// se había elegido ninguno).
  Future<void> toggle(Brightness current) => set(current == Brightness.dark ? ThemeMode.light : ThemeMode.dark);

  Future<void> set(ThemeMode mode) async {
    state = mode;
    final prefs = ref.read(sharedPreferencesProvider);
    if (mode == ThemeMode.system) {
      await prefs.remove(_key);
    } else {
      await prefs.setString(_key, mode.name);
    }
  }
}

final themeModeControllerProvider =
    NotifierProvider<ThemeModeController, ThemeMode>(ThemeModeController.new);
