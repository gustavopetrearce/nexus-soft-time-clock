import 'package:flutter/material.dart';

import '../../app/tokens.g.dart';

/// Lista (DS/09 n.º 21): contenedor con borde y filas de al menos 48 separadas por una línea.
class NxLista extends StatelessWidget {
  const NxLista({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: c.surfaceDefault,
        borderRadius: const BorderRadius.all(Radius.circular(NxTokens.radiusMd)),
        border: Border.all(color: c.borderDefault, width: NxTokens.borderWidthDefault),
      ),
      child: ClipRRect(
        borderRadius: const BorderRadius.all(Radius.circular(NxTokens.radiusMd)),
        child: Column(
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) const Divider(),
              children[i],
            ],
          ],
        ),
      ),
    );
  }
}

/// Fila de lista: ícono inicial opcional, texto principal y secundario, y lo de la derecha (chip).
/// Con [onTap] es un botón con chevron (abre su detalle).
class NxListaFila extends StatelessWidget {
  const NxListaFila({
    super.key,
    required this.title,
    this.leading,
    this.subtitle,
    this.trailing,
    this.onTap,
  });

  final Widget title;
  final IconData? leading;

  /// Líneas bajo el principal, en small y texto secundario.
  final List<Widget>? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    final text = Theme.of(context).textTheme;
    final row = ConstrainedBox(
      constraints: const BoxConstraints(minHeight: NxTokens.space12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: NxTokens.space4, vertical: NxTokens.space3),
        child: Row(
          children: [
            if (leading != null) ...[
              Icon(leading, size: NxTokens.iconSizeLg, color: c.textSecondary),
              const SizedBox(width: NxTokens.spaceGapRelated),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  DefaultTextStyle.merge(
                    style: text.bodyLarge?.copyWith(color: c.textPrimary),
                    child: title,
                  ),
                  if (subtitle != null)
                    DefaultTextStyle.merge(
                      style: text.bodyMedium?.copyWith(color: c.textSecondary),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: subtitle!),
                    ),
                ],
              ),
            ),
            if (trailing != null) ...[
              const SizedBox(width: NxTokens.spaceGapInline),
              trailing!,
            ],
            if (onTap != null) ...[
              const SizedBox(width: NxTokens.spaceGapInline),
              Icon(Icons.chevron_right, size: NxTokens.iconSizeMd, color: c.textSecondary),
            ],
          ],
        ),
      ),
    );
    if (onTap == null) return row;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        hoverColor: c.surfaceHover,
        highlightColor: c.actionPrimarySubtle,
        splashFactory: NoSplash.splashFactory,
        child: row,
      ),
    );
  }
}

/// Dato en bloque (n.º 13): etiqueta `text-heading-6` en mayúsculas y valor en `text-body`.
class NxDatoBloque extends StatelessWidget {
  const NxDatoBloque({super.key, required this.label, this.value, this.child});

  final String label;
  final String? value;

  /// En lugar de [value] (p. ej. un chip).
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    final text = Theme.of(context).textTheme;
    final shown = (value == null || value!.trim().isEmpty) ? '—' : value!;
    return MergeSemantics(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            NxTokens.textHeading6Uppercase ? label.toUpperCase() : label,
            style: text.labelSmall?.copyWith(color: c.textPrimary),
          ),
          const SizedBox(height: NxTokens.space1),
          child ?? Text(shown, style: text.bodyLarge?.copyWith(color: c.textPrimary)),
        ],
      ),
    );
  }
}

/// Grupo de datos (P31): título `text-heading-6` en acción y caja con filas.
class NxGrupo extends StatelessWidget {
  const NxGrupo({super.key, required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: NxTokens.space1),
          child: Semantics(
            header: true,
            child: Text(
              NxTokens.textHeading6Uppercase ? title.toUpperCase() : title,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(color: c.actionPrimary),
            ),
          ),
        ),
        const SizedBox(height: NxTokens.space2),
        Container(
          padding: const EdgeInsets.symmetric(vertical: NxTokens.space1),
          decoration: BoxDecoration(
            color: c.surfaceDefault,
            borderRadius: const BorderRadius.all(Radius.circular(NxTokens.radiusLg)),
            border: Border.all(color: c.borderDefault, width: NxTokens.borderWidthDefault),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
        ),
      ],
    );
  }
}

/// Dato en fila con ícono (P31): ícono lg secundario, etiqueta small y valor body semibold.
/// Vacío → "—".
class NxDatoFila extends StatelessWidget {
  const NxDatoFila({super.key, required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    final text = Theme.of(context).textTheme;
    final shown = (value == null || value!.trim().isEmpty) ? '—' : value!;
    return MergeSemantics(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: NxTokens.space4, vertical: NxTokens.space3),
        child: Row(
          children: [
            Icon(icon, size: NxTokens.iconSizeLg, color: c.textSecondary),
            const SizedBox(width: NxTokens.space4),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: text.bodyMedium?.copyWith(color: c.textSecondary)),
                  Text(
                    shown,
                    style: text.bodyLarge?.copyWith(
                      color: c.textPrimary,
                      fontWeight: NxTokens.fontWeightSemibold,
                      // Cifras tabulares solo en valores numéricos (fechas, teléfonos): en texto
                      // separan los guiones.
                      fontFeatures: RegExp(r'^[\d\s/+()-]+$').hasMatch(shown)
                          ? const [NxTokens.fontFeatureTabular]
                          : null,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Avatar con iniciales (n.º 24), grande: 80 (space-16 + space-4), `action-primary`.
class NxAvatar extends StatelessWidget {
  const NxAvatar({super.key, required this.initials});

  final String initials;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    return ExcludeSemantics(
      child: Container(
        width: NxTokens.space16 + NxTokens.space4,
        height: NxTokens.space16 + NxTokens.space4,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: c.actionPrimary, shape: BoxShape.circle),
        child: Text(
          initials,
          style: NxTokens.textHeading2.copyWith(color: c.onActionPrimary),
        ),
      ),
    );
  }
}

/// Campo de fecha (n.º 7): caja con el valor y el ícono `event`; al tocar abre el selector.
class NxCampoFecha extends StatelessWidget {
  const NxCampoFecha({
    super.key,
    required this.label,
    required this.text,
    required this.onTap,
    this.required = false,
    this.placeholder,
    this.errorText,
  });

  final String label;

  /// Fecha ya formateada; `null` si no hay.
  final String? text;
  final VoidCallback onTap;
  final bool required;
  final String? placeholder;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    final theme = Theme.of(context);
    final error = errorText != null;
    return Semantics(
      button: true,
      label: label,
      value: text ?? placeholder,
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text.rich(
            TextSpan(text: label, children: [if (required) const TextSpan(text: ' *')]),
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: NxTokens.fontWeightMedium,
              color: c.textPrimary,
            ),
          ),
          const SizedBox(height: NxTokens.space1),
          Material(
            color: c.surfaceDefault,
            shape: RoundedRectangleBorder(
              borderRadius: const BorderRadius.all(Radius.circular(NxTokens.radiusMd)),
              side: BorderSide(
                color: error ? c.statusErrorFg : c.borderInput,
                width: NxTokens.borderWidthDefault,
              ),
            ),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onTap,
              hoverColor: c.surfaceHover,
              highlightColor: c.actionPrimarySubtle,
              splashFactory: NoSplash.splashFactory,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: NxTokens.sizeTargetMinApp),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: NxTokens.space3, vertical: NxTokens.space2),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          text ?? placeholder ?? '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyLarge?.copyWith(
                            color: text == null ? c.textPlaceholder : c.textPrimary,
                            fontFeatures: const [NxTokens.fontFeatureTabular],
                          ),
                        ),
                      ),
                      const SizedBox(width: NxTokens.spaceGapInline),
                      Icon(Icons.event_outlined, size: NxTokens.iconSizeMd, color: c.textSecondary),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (error) ...[
            const SizedBox(height: NxTokens.space1),
            Text(errorText!, style: theme.textTheme.bodySmall?.copyWith(color: c.statusErrorFg)),
          ],
        ],
      ),
    );
  }
}

/// Hoja inferior (DS/09, LOWFI/03 estructura D): encabezado con título y cerrar, cuerpo
/// desplazable y pie con las acciones. Se abre con [showNxHoja].
class NxHoja extends StatelessWidget {
  const NxHoja({
    super.key,
    required this.title,
    required this.closeLabel,
    required this.body,
    this.subtitle,
    this.footer,
  });

  final String title;
  final Widget? subtitle;
  final String closeLabel;
  final List<Widget> body;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    final divider = BorderSide(color: c.borderDefault, width: NxTokens.borderWidthDefault);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(
              NxTokens.spaceInsetCard,
              NxTokens.space4,
              NxTokens.space2,
              NxTokens.space4,
            ),
            decoration: BoxDecoration(border: Border(bottom: divider)),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Semantics(
                        header: true,
                        focused: true,
                        child: Text(title, style: Theme.of(context).textTheme.titleLarge),
                      ),
                      if (subtitle != null) subtitle!,
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: NxTokens.iconSizeLg),
                  tooltip: closeLabel,
                  onPressed: () => Navigator.of(context).maybePop(),
                ),
              ],
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(NxTokens.spaceInsetCard),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var i = 0; i < body.length; i++) ...[
                    if (i > 0) const SizedBox(height: NxTokens.spaceGapGroup),
                    body[i],
                  ],
                ],
              ),
            ),
          ),
          if (footer != null)
            DecoratedBox(
              decoration: BoxDecoration(border: Border(top: divider)),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: NxTokens.spaceInsetCard,
                    vertical: NxTokens.space4,
                  ),
                  child: footer,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Abre una [NxHoja] modal con el velo del sistema; se cierra con la X, el velo o al resolver.
Future<T?> showNxHoja<T>(BuildContext context, WidgetBuilder builder) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: builder,
  );
}
