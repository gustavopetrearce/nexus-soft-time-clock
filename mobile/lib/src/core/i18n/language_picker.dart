import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../ui/nx_ui.dart';
import 'l10n.dart';
import 'locale_controller.dart';

/// Opciones de idioma: sistema, español o inglés (el nombre de cada idioma, en su lengua).
List<(Locale?, String)> _languageOptions(AppLocalizations l10n) => [
      (null, l10n.languageSystem),
      (const Locale('es'), l10n.languageSpanish),
      (const Locale('en'), l10n.languageEnglish),
    ];

/// Nombre de la opción de idioma activa (subtítulo de la fila Idioma de P31).
String currentLanguageName(AppLocalizations l10n, Locale? chosen) => switch (chosen?.languageCode) {
      'es' => l10n.languageSpanish,
      'en' => l10n.languageEnglish,
      _ => l10n.languageSystem,
    };

/// Menú de idioma (DS/09 n.º 23): Predeterminado del sistema · Español · English, con el activo
/// marcado. Es la misma preferencia en P02, P03 (botón de la barra) y P31 (tarjeta).
class LanguageMenu extends ConsumerWidget {
  const LanguageMenu({super.key, required this.builder});

  /// Lo que abre el menú; recibe el controlador para abrirlo y cerrarlo.
  final Widget Function(BuildContext context, MenuController controller) builder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final current = ref.watch(localeControllerProvider);
    return MenuAnchor(
      alignmentOffset: const Offset(0, NxTokens.space1),
      menuChildren: [
        for (final (locale, label) in _languageOptions(l10n))
          MenuItemButton(
            leadingIcon: locale?.languageCode == current?.languageCode
                ? const Icon(Icons.check)
                : const SizedBox.square(dimension: NxTokens.iconSizeMd),
            onPressed: () => ref.read(localeControllerProvider.notifier).set(locale),
            child: Semantics(
              selected: locale?.languageCode == current?.languageCode,
              child: Text(label),
            ),
          ),
      ],
      builder: (context, controller, _) => builder(context, controller),
    );
  }
}

/// Botón de ícono de idioma para la barra superior (P02, P03).
class LanguageButton extends StatelessWidget {
  const LanguageButton({super.key});

  @override
  Widget build(BuildContext context) {
    return LanguageMenu(
      builder: (context, controller) => IconButton(
        icon: const Icon(Icons.translate),
        tooltip: context.l10n.languageTitle,
        onPressed: () => controller.isOpen ? controller.close() : controller.open(),
      ),
    );
  }
}
