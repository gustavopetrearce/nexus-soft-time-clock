import 'package:flutter/material.dart';

import '../../app/tokens.g.dart';

enum NxBotonVariant { primary, secondary, tertiary }

/// Botón (DS/09 n.º 1). Nunca se deshabilita antes del primer intento: con [busy] muestra el
/// progreso circular (icon-size-md) y, si hay, [busyLabel], e ignora los toques para bloquear el
/// doble envío sin cambiar de color.
class NxBoton extends StatelessWidget {
  const NxBoton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = NxBotonVariant.primary,
    this.icon,
    this.busy = false,
    this.busyLabel,
    this.block = false,
    this.style,
  });

  final String label;
  final VoidCallback? onPressed;
  final NxBotonVariant variant;
  final IconData? icon;
  final bool busy;
  final String? busyLabel;

  /// Ancho completo.
  final bool block;
  final ButtonStyle? style;

  @override
  Widget build(BuildContext context) {
    final Widget? leading = busy
        ? const SizedBox.square(
            dimension: NxTokens.iconSizeMd,
            child: _Spinner(),
          )
        : icon == null
            ? null
            : Icon(icon);
    final text = Text(busy && busyLabel != null ? busyLabel! : label, overflow: TextOverflow.ellipsis);
    final Widget child = leading == null
        ? text
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              leading,
              const SizedBox(width: NxTokens.spaceGapInline),
              Flexible(child: text),
            ],
          );
    final VoidCallback? handler = onPressed == null ? null : (busy ? () {} : onPressed);
    final button = switch (variant) {
      NxBotonVariant.primary => FilledButton(onPressed: handler, style: style, child: child),
      NxBotonVariant.secondary => OutlinedButton(onPressed: handler, style: style, child: child),
      NxBotonVariant.tertiary => TextButton(onPressed: handler, style: style, child: child),
    };
    return Semantics(
      liveRegion: busy,
      child: block ? SizedBox(width: double.infinity, child: button) : button,
    );
  }
}

/// Progreso circular que toma el color del texto del botón.
class _Spinner extends StatelessWidget {
  const _Spinner();

  @override
  Widget build(BuildContext context) {
    final color = DefaultTextStyle.of(context).style.color ?? IconTheme.of(context).color;
    return CircularProgressIndicator(
      strokeWidth: NxTokens.borderWidthFocus,
      color: color,
    );
  }
}

/// Acción principal fija abajo (LOWFI/03 · región Acción principal): superficie, borde superior
/// y `space-inset-page`, por encima del área segura del sistema.
class NxAccionFija extends StatelessWidget {
  const NxAccionFija({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: c.surfaceDefault,
        border: Border(top: BorderSide(color: c.borderDefault, width: NxTokens.borderWidthDefault)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(NxTokens.spaceInsetPage),
          child: Center(
            heightFactor: 1,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: NxTokens.containerMaxReadable),
              child: child,
            ),
          ),
        ),
      ),
    );
  }
}
