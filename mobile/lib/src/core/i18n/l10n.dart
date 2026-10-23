import 'package:flutter/widgets.dart';

import '../../../l10n/app_localizations.dart';

export '../../../l10n/app_localizations.dart';

/// Atajo para los textos traducidos: `context.l10n.homeLogout`.
extension L10nContext on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
}
