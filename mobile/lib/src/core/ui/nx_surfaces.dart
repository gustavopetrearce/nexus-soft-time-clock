import 'package:flutter/material.dart';

import '../../app/tokens.g.dart';

/// Contenido de una pantalla de la app (LOWFI/03 · región Contenido): `space-inset-page`,
/// ancho máximo legible y centrado en tablet.
class NxContenido extends StatelessWidget {
  const NxContenido({super.key, required this.children, this.controller, this.physics});

  final List<Widget> children;
  final ScrollController? controller;
  final ScrollPhysics? physics;

  @override
  Widget build(BuildContext context) {
    return ListView(
      controller: controller,
      physics: physics ?? const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(NxTokens.spaceInsetPage),
      children: [
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: NxTokens.containerMaxReadable),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < children.length; i++) ...[
                  if (i > 0) const SizedBox(height: NxTokens.spaceGapGroup),
                  children[i],
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Contenedor de superficie con borde (tarjeta, lista, grupo de datos).
class NxContenedor extends StatelessWidget {
  const NxContenedor({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(NxTokens.spaceInsetCard),
    this.radius = NxTokens.radiusLg,
    this.shadow = true,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final bool shadow;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    return Container(
      padding: padding,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: c.surfaceDefault,
        borderRadius: BorderRadius.all(Radius.circular(radius)),
        border: Border.all(color: c.borderDefault, width: NxTokens.borderWidthDefault),
        boxShadow: shadow ? c.shadow1 : null,
      ),
      child: child,
    );
  }
}

/// Tarjeta de acceso (DS/09 n.º 15): ícono lg en acción, título heading-4, subtítulo small y
/// chevron. Superficie al reposo, hover en `surface-hover`, al tocar `action-primary-subtle`.
class NxTarjetaAcceso extends StatelessWidget {
  const NxTarjetaAcceso({
    super.key,
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.trailing,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  /// Reemplaza al chevron (p. ej. en una tarjeta que abre un menú).
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    final text = Theme.of(context).textTheme;
    const radius = BorderRadius.all(Radius.circular(NxTokens.radiusLg));
    return DecoratedBox(
      decoration: BoxDecoration(borderRadius: radius, boxShadow: c.shadow1),
      child: Material(
        color: c.surfaceDefault,
        shape: RoundedRectangleBorder(
          borderRadius: radius,
          side: BorderSide(color: c.borderDefault, width: NxTokens.borderWidthDefault),
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
              padding: const EdgeInsets.all(NxTokens.spaceInsetCard),
              child: Row(
                children: [
                  Icon(icon, size: NxTokens.iconSizeLg, color: c.actionPrimary),
                  const SizedBox(width: NxTokens.spaceGapRelated),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: text.titleSmall),
                        if (subtitle != null)
                          Text(subtitle!, style: text.bodyMedium?.copyWith(color: c.textSecondary)),
                      ],
                    ),
                  ),
                  const SizedBox(width: NxTokens.spaceGapRelated),
                  trailing ?? Icon(Icons.chevron_right, size: NxTokens.iconSizeMd, color: c.textSecondary),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Superficie de marca no interactiva (cabecera de Inicio, HIFI/03).
class NxCabeceraMarca extends StatelessWidget {
  const NxCabeceraMarca({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(NxTokens.spaceInsetCard),
      decoration: BoxDecoration(
        color: c.surfaceBrand,
        borderRadius: const BorderRadius.all(Radius.circular(NxTokens.radiusLg)),
      ),
      child: DefaultTextStyle.merge(
        style: TextStyle(color: c.onSurfaceBrand),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) const SizedBox(height: NxTokens.space1),
              children[i],
            ],
          ],
        ),
      ),
    );
  }
}

/// Isotipo provisional de la marca (el reloj índigo, IDENT/03). Recurso intercambiable: si el
/// logotipo cambia, cambia solo este widget.
class NxIsotipo extends StatelessWidget {
  const NxIsotipo({super.key, this.size = NxTokens.iconSizeXl});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      excludeSemantics: true,
      child: CustomPaint(size: Size.square(size), painter: const _IsotipoPainter()),
    );
  }
}

class _IsotipoPainter extends CustomPainter {
  const _IsotipoPainter();

  @override
  void paint(Canvas canvas, Size size) {
    // Lienzo de 64 × 64 como el SVG de la maqueta.
    final k = size.width / 64;
    canvas.drawRRect(
      RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(16 * k)),
      Paint()..color = NxTokens.colorIndigo500,
    );
    final stroke = Paint()
      ..color = NxTokens.colorWhite
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.5 * k
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawCircle(Offset(32 * k, 32 * k), 18 * k, stroke);
    canvas.drawPath(
      Path()
        ..moveTo(32 * k, 22 * k)
        ..lineTo(32 * k, 33 * k)
        ..lineTo(39 * k, 38 * k),
      stroke,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Isotipo + nombre de la app (lockup de la maqueta).
class NxLockup extends StatelessWidget {
  const NxLockup({super.key, required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const NxIsotipo(size: NxTokens.iconSizeXl),
        const SizedBox(width: NxTokens.spaceGapRelated),
        Flexible(
          child: Text(
            name,
            style: NxTokens.textHeading3.copyWith(
              fontWeight: NxTokens.fontWeightBold,
              color: NxColors.of(context).textPrimary,
            ),
          ),
        ),
      ],
    );
  }
}
