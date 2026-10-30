import 'package:flutter/material.dart';

import '../../app/tokens.g.dart';
import 'nx_tone.dart';

/// Variantes del Aviso (DS/09 n.º 16).
enum NxAvisoVariant {
  /// En línea, con borde y radio.
  inline,

  /// Banner fijo a todo el ancho: solo borde inferior, sin radio.
  banner,

  /// En una fila centrada verticalmente (ícono · texto · cifra o acción).
  fila,

  /// Instrucción destacada: ícono xl, relleno space-5 y space-4 entre ícono y texto.
  instruccion,
}

/// Aviso (n.º 16): mensaje con tono de estado, ícono, y acciones opcionales. Los de error se
/// anuncian al lector de pantalla como región viva.
class NxAviso extends StatelessWidget {
  const NxAviso({
    super.key,
    required this.tone,
    required this.message,
    this.icon,
    this.variant = NxAvisoVariant.inline,
    this.trailing,
    this.action,
    this.liveRegion,
  });

  final NxTone tone;
  final String message;
  final IconData? icon;
  final NxAvisoVariant variant;

  /// Al final de la fila (cifra o botón de ícono).
  final Widget? trailing;

  /// Botón bajo el texto (p. ej. "Reintentar").
  final Widget? action;

  /// Por defecto, solo los de error y advertencia se anuncian.
  final bool? liveRegion;

  static IconData defaultIcon(NxTone tone) => switch (tone) {
        NxTone.success => Icons.check_circle_outline,
        NxTone.warning => Icons.warning_amber_outlined,
        NxTone.error => Icons.error_outline,
        _ => Icons.info_outline,
      };

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    final text = Theme.of(context).textTheme;
    final fg = tone.fg(c);
    final instruccion = variant == NxAvisoVariant.instruccion;
    final banner = variant == NxAvisoVariant.banner;
    final centered = variant != NxAvisoVariant.inline;

    final body = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(message, style: text.bodyLarge?.copyWith(color: c.textPrimary)),
        if (action != null) ...[
          const SizedBox(height: NxTokens.spaceGapInline),
          action!,
        ],
      ],
    );

    final content = Container(
      width: double.infinity,
      padding: instruccion
          ? const EdgeInsets.all(NxTokens.space5)
          : const EdgeInsets.symmetric(horizontal: NxTokens.space4, vertical: NxTokens.space3),
      decoration: BoxDecoration(
        color: tone.bg(c),
        borderRadius: banner ? null : const BorderRadius.all(Radius.circular(NxTokens.radiusMd)),
        border: banner
            ? Border(bottom: BorderSide(color: fg, width: NxTokens.borderWidthDefault))
            : Border.all(color: fg, width: NxTokens.borderWidthDefault),
      ),
      child: Row(
        crossAxisAlignment: centered ? CrossAxisAlignment.center : CrossAxisAlignment.start,
        children: [
          Icon(icon ?? defaultIcon(tone),
              color: fg, size: instruccion ? NxTokens.iconSizeXl : NxTokens.iconSizeMd,),
          SizedBox(width: instruccion ? NxTokens.space4 : NxTokens.spaceGapRelated),
          Expanded(child: body),
          if (trailing != null) ...[
            const SizedBox(width: NxTokens.spaceGapInline),
            trailing!,
          ],
        ],
      ),
    );

    return Semantics(
      liveRegion: liveRegion ?? (tone == NxTone.error || tone == NxTone.warning),
      container: true,
      child: NxAparece(child: content),
    );
  }
}

/// Fundido de entrada (`motion.duration.medium`, `easing.enter`); con animaciones reducidas,
/// en `fast` (DS/11).
class NxAparece extends StatelessWidget {
  const NxAparece({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final reduced = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: reduced ? NxTokens.motionDurationFast : NxTokens.motionDurationMedium,
      curve: NxTokens.motionEasingEnter,
      builder: (context, value, child) => Opacity(opacity: value, child: child),
      child: child,
    );
  }
}

/// Chip de estado (n.º 11).
class NxChip extends StatelessWidget {
  const NxChip({super.key, required this.label, required this.tone});

  final String label;
  final NxTone tone;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: NxTokens.spaceInsetChipX, vertical: NxTokens.spaceInsetChipY),
      decoration: BoxDecoration(
        color: tone.bg(c),
        borderRadius: const BorderRadius.all(Radius.circular(NxTokens.radiusFull)),
      ),
      child: Text(
        label,
        maxLines: 1,
        style: NxTokens.textSmallStrong.copyWith(color: tone.fg(c)),
      ),
    );
  }
}

/// Indicador (n.º 12): ícono sm + texto small, en secundario o en un tono de estado.
class NxIndicador extends StatelessWidget {
  const NxIndicador({super.key, required this.icon, required this.label, this.tone});

  final IconData icon;
  final String label;
  final NxTone? tone;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    final color = tone?.fg(c) ?? c.textSecondary;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: NxTokens.iconSizeSm, color: color),
        const SizedBox(width: NxTokens.space1),
        Flexible(
          child: Text(
            label,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: color,
                  fontFeatures: const [NxTokens.fontFeatureTabular],
                ),
          ),
        ),
      ],
    );
  }
}

/// Estado vacío o de error (n.º 18): ícono, título heading-3, descripción y acción opcional.
class NxEstadoVacio extends StatelessWidget {
  const NxEstadoVacio({
    super.key,
    required this.icon,
    required this.title,
    this.description,
    this.actionLabel,
    this.onAction,
    this.isError = false,
    this.page = false,
  });

  /// Error al cargar: "No se pudo cargar la información." + Reintentar.
  factory NxEstadoVacio.error({
    Key? key,
    required String title,
    required String description,
    required String retryLabel,
    required VoidCallback onRetry,
  }) =>
      NxEstadoVacio(
        key: key,
        icon: Icons.error_outline,
        title: title,
        description: description,
        actionLabel: retryLabel,
        onAction: onRetry,
        isError: true,
      );

  final IconData icon;
  final String title;
  final String? description;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool isError;

  /// Sin contenedor (ocupa la página, p. ej. sobre el visor del escáner).
  final bool page;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    final text = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: page
          ? const EdgeInsets.symmetric(horizontal: NxTokens.spaceInsetPage, vertical: NxTokens.space16)
          : const EdgeInsets.symmetric(horizontal: NxTokens.spaceInsetCard, vertical: NxTokens.space8),
      decoration: page
          ? null
          : BoxDecoration(
              color: c.surfaceDefault,
              borderRadius: const BorderRadius.all(Radius.circular(NxTokens.radiusLg)),
              border: Border.all(color: c.borderDefault, width: NxTokens.borderWidthDefault),
            ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon,
              size: page ? NxTokens.iconSize2xl : NxTokens.iconSizeXl,
              color: isError ? c.statusErrorFg : c.textSecondary,),
          const SizedBox(height: NxTokens.spaceGapRelated),
          Text(title, textAlign: TextAlign.center, style: text.titleMedium),
          if (description != null) ...[
            const SizedBox(height: NxTokens.spaceGapRelated),
            Text(description!,
                textAlign: TextAlign.center, style: text.bodyLarge?.copyWith(color: c.textSecondary),),
          ],
          if (actionLabel != null) ...[
            const SizedBox(height: NxTokens.spaceGapRelated),
            OutlinedButton(onPressed: onAction, child: Text(actionLabel!)),
          ],
        ],
      ),
    );
  }
}

/// Carga de datos (n.º 19): barra de progreso de space-1 encima del contenido, sin moverlo.
class NxConCarga extends StatelessWidget {
  const NxConCarga({super.key, required this.loading, required this.child, this.label});

  final bool loading;
  final Widget child;
  final String? label;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        child,
        if (loading)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: LinearProgressIndicator(semanticsLabel: label),
          ),
      ],
    );
  }
}
