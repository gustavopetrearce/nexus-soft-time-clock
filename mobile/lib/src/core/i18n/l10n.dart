import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';

import '../../../l10n/app_localizations.dart';

export '../../../l10n/app_localizations.dart';

/// Atajo para los textos traducidos: `context.l10n.homeLogout`.
extension L10nContext on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);

  /// Locale activo en el formato que espera `intl` (`es`, `en`).
  String get intlLocale => Localizations.localeOf(this).toLanguageTag();
}

/// Fecha completa con día y mes a dos cifras (`dd/mm/aaaa` en español, HIFI/08 Formatos).
String fullDate(BuildContext context, DateTime date) =>
    DateFormat(context.intlLocale.startsWith('es') ? 'dd/MM/yyyy' : 'MM/dd/yyyy').format(date);

/// Fecha ISO de la API (`yyyy-MM-dd…`) en formato completo; el texto original si no es fecha.
String fullIsoDate(BuildContext context, String iso) {
  final date = iso.length >= 10 ? DateTime.tryParse(iso.substring(0, 10)) : null;
  return date == null ? iso : fullDate(context, date);
}

/// Fecha ISO de la API (`yyyy-MM-dd…`) como día y mes en el orden del idioma activo
/// (23/10 en español, 10/23 en inglés). Devuelve el texto original si no es una fecha.
String shortIsoDate(BuildContext context, String iso) {
  final date = iso.length >= 10 ? DateTime.tryParse(iso.substring(0, 10)) : null;
  return date == null ? iso : DateFormat.Md(context.intlLocale).format(date);
}
