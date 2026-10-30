import 'package:flutter/material.dart';

import 'tokens.g.dart';

/// Tema Material 3 de la app construido solo con los tokens del design system (DS/01–DS/07,
/// `tokens.g.dart`). No hay colores, medidas ni radios escritos a mano: si falta un valor, se
/// agrega a `design-tokens/tokens/*.json` y se regenera.
ThemeData buildLightTheme() => _themeFor(NxColors.light, Brightness.light);

ThemeData buildDarkTheme() => _themeFor(NxColors.dark, Brightness.dark);

/// Superficie de las capas elevadas (menú, hoja inferior, diálogo): en oscuro sube un nivel para
/// separarse del fondo, como `--nx-elevation-2/3-surface` del portal.
Color nxElevatedSurface(NxColors c, Brightness brightness) =>
    brightness == Brightness.dark ? c.surfaceHover : c.surfaceDefault;

/// Escala tipográfica de la app sobre los roles de Material (descripciones de `text.*`).
TextTheme _textTheme(Color color) => const TextTheme(
      headlineSmall: NxTokens.textHeading1,
      titleLarge: NxTokens.textHeading2,
      titleMedium: NxTokens.textHeading3,
      titleSmall: NxTokens.textHeading4,
      labelMedium: NxTokens.textHeading5,
      labelSmall: NxTokens.textHeading6,
      bodyLarge: NxTokens.textBody,
      bodyMedium: NxTokens.textSmall,
      bodySmall: NxTokens.textCaption,
      labelLarge: NxTokens.textLabel,
    ).apply(bodyColor: color, displayColor: color);

ThemeData _themeFor(NxColors c, Brightness brightness) {
  final elevated = nxElevatedSurface(c, brightness);
  final scheme = ColorScheme(
    brightness: brightness,
    primary: c.actionPrimary,
    onPrimary: c.onActionPrimary,
    primaryContainer: c.actionPrimarySubtle,
    onPrimaryContainer: c.actionPrimary,
    secondary: c.actionPrimary,
    onSecondary: c.onActionPrimary,
    secondaryContainer: c.actionPrimarySubtle,
    onSecondaryContainer: c.actionPrimary,
    tertiary: c.statusInfoFg,
    onTertiary: c.textInverse,
    tertiaryContainer: c.statusInfoBg,
    onTertiaryContainer: c.statusInfoFg,
    error: c.statusErrorFg,
    onError: c.textInverse,
    errorContainer: c.statusErrorBg,
    onErrorContainer: c.statusErrorFg,
    surface: c.surfaceDefault,
    onSurface: c.textPrimary,
    onSurfaceVariant: c.textSecondary,
    surfaceDim: c.surfaceSubtle,
    surfaceBright: c.surfaceDefault,
    surfaceContainerLowest: c.surfaceDefault,
    surfaceContainerLow: c.surfaceDefault,
    surfaceContainer: elevated,
    surfaceContainerHigh: elevated,
    surfaceContainerHighest: c.surfaceHover,
    outline: c.borderInput,
    outlineVariant: c.borderDefault,
    shadow: NxTokens.colorNeutral900,
    scrim: c.overlayScrim,
    inverseSurface: c.textPrimary,
    onInverseSurface: c.textInverse,
    inversePrimary: c.actionPrimarySubtle,
    surfaceTint: Colors.transparent,
  );
  final text = _textTheme(c.textPrimary);

  const shapeMd = RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(NxTokens.radiusMd)));
  const shapeLg = RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(NxTokens.radiusLg)));
  const buttonPadding = EdgeInsets.symmetric(horizontal: NxTokens.space4, vertical: NxTokens.space3);
  const buttonMin = Size(NxTokens.sizeTargetMinApp, NxTokens.sizeTargetMinApp);

  Color? pressedOr(Set<WidgetState> s, Color pressed, Color? rest) =>
      s.contains(WidgetState.pressed) || s.contains(WidgetState.hovered) ? pressed : rest;

  OutlineInputBorder field(Color color, [double width = NxTokens.borderWidthDefault]) => OutlineInputBorder(
        borderRadius: const BorderRadius.all(Radius.circular(NxTokens.radiusMd)),
        borderSide: BorderSide(color: color, width: width),
      );

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    textTheme: text,
    fontFamily: NxTokens.fontFamilySans,
    fontFamilyFallback: NxTokens.fontFamilySansFallback,
    scaffoldBackgroundColor: c.bgApp,
    canvasColor: c.bgApp,
    dividerColor: c.borderDefault,
    visualDensity: VisualDensity.standard,
    materialTapTargetSize: MaterialTapTargetSize.padded,
    extensions: [c],
    iconTheme: IconThemeData(color: c.textSecondary, size: NxTokens.iconSizeLg),

    // Barra superior (LOWFI/03 estructura B): superficie, título a la izquierda, borde inferior.
    appBarTheme: AppBarTheme(
      backgroundColor: c.surfaceDefault,
      foregroundColor: c.textPrimary,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      toolbarHeight: NxTokens.space12 + NxTokens.space2,
      titleSpacing: NxTokens.space2,
      titleTextStyle: text.titleLarge,
      iconTheme: IconThemeData(color: c.textSecondary, size: NxTokens.iconSizeLg),
      actionsIconTheme: IconThemeData(color: c.textSecondary, size: NxTokens.iconSizeMd),
      shape: Border(bottom: BorderSide(color: c.borderDefault, width: NxTokens.borderWidthDefault)),
    ),

    // Botón primary (DS/09 n.º 1).
    filledButtonTheme: FilledButtonThemeData(
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(buttonMin),
        padding: const WidgetStatePropertyAll(buttonPadding),
        shape: const WidgetStatePropertyAll(shapeMd),
        textStyle: WidgetStatePropertyAll(text.labelLarge),
        iconSize: const WidgetStatePropertyAll(NxTokens.iconSizeMd),
        elevation: const WidgetStatePropertyAll(0),
        backgroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.disabled)
            ? c.surfaceHover
            : pressedOr(s, c.actionPrimaryHover, c.actionPrimary),),
        foregroundColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.disabled) ? c.textDisabled : c.onActionPrimary,),
        iconColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.disabled) ? c.textDisabled : c.onActionPrimary,),
        overlayColor: const WidgetStatePropertyAll(Colors.transparent),
      ),
    ),
    // Botón secondary: superficie, texto de acción y borde de marca.
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(buttonMin),
        padding: const WidgetStatePropertyAll(buttonPadding),
        shape: const WidgetStatePropertyAll(shapeMd),
        textStyle: WidgetStatePropertyAll(text.labelLarge),
        iconSize: const WidgetStatePropertyAll(NxTokens.iconSizeMd),
        backgroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.disabled)
            ? c.surfaceHover
            : pressedOr(s, c.actionPrimarySubtle, c.surfaceDefault),),
        foregroundColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.disabled) ? c.textDisabled : c.actionPrimary,),
        iconColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.disabled) ? c.textDisabled : c.actionPrimary,),
        side: WidgetStateProperty.resolveWith((s) => BorderSide(
              color: s.contains(WidgetState.disabled) ? Colors.transparent : c.borderBrand,
              width: NxTokens.borderWidthDefault,
            ),),
        overlayColor: const WidgetStatePropertyAll(Colors.transparent),
      ),
    ),
    // Botón tertiary: solo texto de acción.
    textButtonTheme: TextButtonThemeData(
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(buttonMin),
        padding: const WidgetStatePropertyAll(buttonPadding),
        shape: const WidgetStatePropertyAll(shapeMd),
        textStyle: WidgetStatePropertyAll(text.labelLarge),
        iconSize: const WidgetStatePropertyAll(NxTokens.iconSizeMd),
        backgroundColor: WidgetStateProperty.resolveWith((s) => pressedOr(s, c.actionPrimarySubtle, null)),
        foregroundColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.disabled) ? c.textDisabled : c.actionPrimary,),
        iconColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.disabled) ? c.textDisabled : c.actionPrimary,),
        overlayColor: const WidgetStatePropertyAll(Colors.transparent),
      ),
    ),
    // Botón de ícono (n.º 2): área de 48, circular, en texto secundario.
    iconButtonTheme: IconButtonThemeData(
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(buttonMin),
        iconSize: const WidgetStatePropertyAll(NxTokens.iconSizeMd),
        shape: const WidgetStatePropertyAll(CircleBorder()),
        foregroundColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.pressed) ? c.actionPrimary : c.textSecondary,),
        backgroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.pressed)
            ? c.actionPrimarySubtle
            : s.contains(WidgetState.hovered)
                ? c.surfaceHover
                : null,),
        overlayColor: const WidgetStatePropertyAll(Colors.transparent),
      ),
    ),

    // Campos (n.º 3–8): la etiqueta va fuera de la caja (NxCampo); aquí, la caja.
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surfaceDefault,
      isDense: true,
      constraints: const BoxConstraints(minHeight: NxTokens.sizeTargetMinApp),
      contentPadding: const EdgeInsets.symmetric(horizontal: NxTokens.space3, vertical: NxTokens.space3),
      hintStyle: text.bodyLarge?.copyWith(color: c.textPlaceholder),
      helperStyle: text.bodySmall?.copyWith(color: c.textSecondary),
      errorStyle: text.bodySmall?.copyWith(color: c.statusErrorFg),
      counterStyle: text.bodySmall?.copyWith(color: c.textSecondary),
      prefixIconColor: c.textSecondary,
      suffixIconColor: c.textSecondary,
      border: field(c.borderInput),
      enabledBorder: field(c.borderInput),
      focusedBorder: field(c.focusRing, NxTokens.borderWidthFocus),
      errorBorder: field(c.statusErrorFg),
      focusedErrorBorder: field(c.statusErrorFg, NxTokens.borderWidthFocus),
      disabledBorder: field(c.borderDefault),
    ),

    // Tarjeta (n.º 15).
    cardTheme: CardThemeData(
      elevation: 0,
      margin: EdgeInsets.zero,
      color: c.surfaceDefault,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.all(Radius.circular(NxTokens.radiusLg)),
        side: BorderSide(color: c.borderDefault, width: NxTokens.borderWidthDefault),
      ),
    ),

    // Snackbar (n.º 17).
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: c.textPrimary,
      contentTextStyle: text.bodyMedium?.copyWith(color: c.textInverse),
      actionTextColor: c.textInverse,
      insetPadding: const EdgeInsets.all(NxTokens.spaceInsetPage),
      shape: shapeMd,
      elevation: 0,
    ),

    // Hoja inferior y diálogo (DS/06): capa elevada, velo del sistema.
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: elevated,
      surfaceTintColor: Colors.transparent,
      modalBackgroundColor: elevated,
      modalBarrierColor: c.overlayScrim,
      elevation: 0,
      modalElevation: 0,
      showDragHandle: false,
      constraints: const BoxConstraints(maxWidth: NxTokens.containerMaxReadable),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(NxTokens.radiusLg)),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: elevated,
      surfaceTintColor: Colors.transparent,
      barrierColor: c.overlayScrim,
      shape: shapeLg,
      titleTextStyle: text.titleMedium,
      contentTextStyle: text.bodyLarge,
    ),

    // Menú (n.º 23).
    menuTheme: MenuThemeData(
      style: MenuStyle(
        backgroundColor: WidgetStatePropertyAll(elevated),
        surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
        elevation: const WidgetStatePropertyAll(0),
        padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(vertical: NxTokens.space2)),
        shape: WidgetStatePropertyAll(RoundedRectangleBorder(
          borderRadius: const BorderRadius.all(Radius.circular(NxTokens.radiusMd)),
          side: BorderSide(color: c.borderDefault, width: NxTokens.borderWidthDefault),
        ),),
      ),
    ),
    menuButtonTheme: MenuButtonThemeData(
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(Size(NxTokens.space16 * 4, NxTokens.sizeTargetMinApp)),
        padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(horizontal: NxTokens.space3)),
        textStyle: WidgetStatePropertyAll(text.bodyLarge),
        foregroundColor: WidgetStatePropertyAll(c.textPrimary),
        iconColor: WidgetStatePropertyAll(c.textSecondary),
        iconSize: const WidgetStatePropertyAll(NxTokens.iconSizeMd),
        backgroundColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.hovered) || s.contains(WidgetState.focused) ? c.surfaceHover : null,),
        overlayColor: const WidgetStatePropertyAll(Colors.transparent),
      ),
    ),

    // Carga (n.º 19): barra de space-1 en action-primary sobre action-primary-subtle.
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: c.actionPrimary,
      linearTrackColor: c.actionPrimarySubtle,
      linearMinHeight: NxTokens.space1,
      circularTrackColor: Colors.transparent,
    ),

    badgeTheme: BadgeThemeData(
      backgroundColor: c.actionPrimary,
      textColor: c.onActionPrimary,
      textStyle: text.bodySmall,
    ),

    dividerTheme: DividerThemeData(
      color: c.borderDefault,
      space: NxTokens.borderWidthDefault,
      thickness: NxTokens.borderWidthDefault,
    ),

    listTileTheme: ListTileThemeData(
      iconColor: c.textSecondary,
      textColor: c.textPrimary,
      minTileHeight: NxTokens.sizeTargetMinApp,
    ),

    datePickerTheme: DatePickerThemeData(
      backgroundColor: elevated,
      surfaceTintColor: Colors.transparent,
      shape: shapeLg,
    ),
  );
}

/// Barras de desplazamiento delgadas y ocultas hasta que se desplaza; se ocultan
/// `motion.delay.hide` después de detenerse (DS/09, reglas comunes).
class NxScrollBehavior extends MaterialScrollBehavior {
  const NxScrollBehavior();

  @override
  Widget buildScrollbar(BuildContext context, Widget child, ScrollableDetails details) {
    if (axisDirectionToAxis(details.direction) != Axis.vertical) return child;
    return RawScrollbar(
      controller: details.controller,
      thickness: NxTokens.space1,
      radius: const Radius.circular(NxTokens.radiusFull),
      thumbColor: NxColors.of(context).borderStrong,
      timeToFade: NxTokens.motionDelayHide,
      fadeDuration: NxTokens.motionDurationMedium,
      child: child,
    );
  }
}
