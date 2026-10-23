import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'l10n.dart';
import 'locale_controller.dart';

/// Hoja inferior para elegir el idioma: sistema, español o inglés.
Future<void> showLanguagePicker(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) {
      final l10n = sheetContext.l10n;
      final current = ref.read(localeControllerProvider);
      final options = <(Locale?, String)>[
        (null, l10n.languageSystem),
        (const Locale('es'), l10n.languageSpanish),
        (const Locale('en'), l10n.languageEnglish),
      ];
      return SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
              child: Text(l10n.languageTitle, style: Theme.of(sheetContext).textTheme.titleMedium),
            ),
            for (final (locale, label) in options)
              ListTile(
                title: Text(label),
                trailing: locale?.languageCode == current?.languageCode ? const Icon(Icons.check) : null,
                onTap: () {
                  ref.read(localeControllerProvider.notifier).set(locale);
                  Navigator.of(sheetContext).pop();
                },
              ),
          ],
        ),
      );
    },
  );
}

/// Botón con el ícono de idioma que abre [showLanguagePicker] (AppBar y pantalla de login).
class LanguageButton extends ConsumerWidget {
  const LanguageButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return IconButton(
      icon: const Icon(Icons.translate),
      tooltip: context.l10n.languageTitle,
      onPressed: () => showLanguagePicker(context, ref),
    );
  }
}
