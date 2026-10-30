import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../core/i18n/l10n.dart';
import '../../../core/ui/nx_ui.dart';
import '../domain/qr_token.dart';

/// Escáner de QR (P05): visor de cámara con velo y marco guía. Devuelve por [Navigator.pop] el
/// valor crudo del primer QR reconocible, o `null` si el colaborador cancela. Un QR ilegible no
/// cierra el visor: se avisa y se sigue escaneando.
class QrScannerScreen extends StatefulWidget {
  const QrScannerScreen({super.key});

  @override
  State<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<QrScannerScreen> {
  final _controller = MobileScannerController(formats: const [BarcodeFormat.qrCode]);
  bool _handled = false;
  bool _invalid = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handled) {
      return;
    }
    final raw = capture.barcodes
        .map((b) => b.rawValue)
        .firstWhere((v) => v != null && v.isNotEmpty, orElse: () => null);
    if (raw == null) {
      return;
    }
    if (scopeFromQrToken(raw) == null) {
      if (!_invalid) setState(() => _invalid = true);
      return;
    }
    _handled = true; // evita lecturas duplicadas mientras se cierra la pantalla
    Navigator.of(context).pop(raw);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      backgroundColor: NxTokens.colorNeutral950,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: NxTokens.colorWhite,
        shape: const Border(),
        automaticallyImplyLeading: false,
        title: Semantics(header: true, child: Text(l10n.qrTitle, style: const TextStyle(color: NxTokens.colorWhite))),
        actions: [
          IconButton(
            icon: const Icon(Icons.flashlight_on_outlined),
            color: NxTokens.colorWhite,
            tooltip: l10n.qrTorch,
            onPressed: () => _controller.toggleTorch(),
          ),
          const SizedBox(width: NxTokens.space2),
        ],
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          // Marco: 70 % del ancho con tope de space-16 × 4, como la maqueta.
          final frame = math.min(constraints.maxWidth * 0.7, NxTokens.space16 * 4);
          return Stack(
            alignment: Alignment.center,
            children: [
              Positioned.fill(
                child: Semantics(
                  label: l10n.qrCameraView,
                  image: true,
                  child: MobileScanner(
                    controller: _controller,
                    onDetect: _onDetect,
                    // El error se pinta encima del velo (más abajo).
                    errorBuilder: (context, error, child) => const SizedBox.shrink(),
                  ),
                ),
              ),
              Positioned.fill(child: IgnorePointer(child: CustomPaint(painter: _ScrimPainter(frame)))),
              // Instrucción y aviso, debajo del marco (centrado en la pantalla).
              Positioned(
                top: constraints.maxHeight / 2 + frame / 2 + NxTokens.spaceGapSection,
                left: NxTokens.spaceInsetPage,
                right: NxTokens.spaceInsetPage,
                child: Column(
                  children: [
                    Text(
                      l10n.qrHint,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: NxTokens.colorWhite),
                    ),
                    if (_invalid) ...[
                      const SizedBox(height: NxTokens.spaceGapRelated),
                      NxAviso(tone: NxTone.error, message: l10n.attendanceInvalidQr),
                    ],
                  ],
                ),
              ),
              Positioned.fill(
                child: ValueListenableBuilder<MobileScannerState>(
                  valueListenable: _controller,
                  builder: (context, scanner, _) => scanner.error == null
                      ? const SizedBox.shrink()
                      : ColoredBox(
                          color: NxTokens.colorNeutral950,
                          child: _ScannerError(error: scanner.error!),
                        ),
                ),
              ),
              Positioned(
                left: NxTokens.spaceInsetPage,
                right: NxTokens.spaceInsetPage,
                bottom: NxTokens.spaceInsetPage + MediaQuery.paddingOf(context).bottom,
                child: Center(
                  child: NxBoton(
                    label: l10n.commonCancel,
                    icon: Icons.close,
                    variant: NxBotonVariant.secondary,
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Velo `overlay-scrim` con una ventana recortada y el marco blanco de `border-width-focus`.
class _ScrimPainter extends CustomPainter {
  const _ScrimPainter(this.frame);

  final double frame;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final rect = RRect.fromRectAndRadius(
      Rect.fromCenter(center: center, width: frame, height: frame),
      const Radius.circular(NxTokens.radiusLg),
    );
    final scrim = Path()
      ..addRect(Offset.zero & size)
      ..addRRect(rect)
      ..fillType = PathFillType.evenOdd;
    canvas.drawPath(scrim, Paint()..color = NxColors.dark.overlayScrim);
    canvas.drawRRect(
      rect,
      Paint()
        ..color = NxTokens.colorWhite
        ..style = PaintingStyle.stroke
        ..strokeWidth = NxTokens.borderWidthFocus,
    );
  }

  @override
  bool shouldRepaint(covariant _ScrimPainter oldDelegate) => oldDelegate.frame != frame;
}

/// Sin permiso de cámara (o cámara no disponible): estado vacío con "Abrir ajustes".
class _ScannerError extends StatelessWidget {
  const _ScannerError({required this.error});

  final MobileScannerException error;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final denied = error.errorCode == MobileScannerErrorCode.permissionDenied;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(NxTokens.spaceInsetPage),
        child: Container(
          decoration: BoxDecoration(
            color: NxColors.of(context).surfaceDefault,
            borderRadius: const BorderRadius.all(Radius.circular(NxTokens.radiusLg)),
          ),
          child: NxEstadoVacio(
            page: true,
            icon: Icons.no_photography_outlined,
            title: denied ? l10n.qrPermissionDenied : l10n.qrCameraError,
            actionLabel: denied ? l10n.qrOpenSettings : null,
            onAction: denied ? Geolocator.openAppSettings : null,
          ),
        ),
      ),
    );
  }
}
