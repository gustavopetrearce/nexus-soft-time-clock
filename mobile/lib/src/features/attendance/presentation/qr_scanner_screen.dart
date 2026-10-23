import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../core/i18n/l10n.dart';

/// Escáner de cámara para leer el QR firmado del centro. Devuelve por [Navigator.pop]
/// el valor crudo del primer código detectado, o `null` si el usuario cancela.
class QrScannerScreen extends StatefulWidget {
  const QrScannerScreen({super.key});

  @override
  State<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<QrScannerScreen> {
  final _controller = MobileScannerController(formats: const [BarcodeFormat.qrCode]);
  bool _handled = false;

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
    _handled = true; // evita lecturas duplicadas mientras se cierra la pantalla
    Navigator.of(context).pop(raw);
  }

  static const double _frameSize = 260;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        title: Text(context.l10n.qrTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.flash_on),
            tooltip: context.l10n.qrTorch,
            onPressed: () => _controller.toggleTorch(),
          ),
        ],
      ),
      body: Stack(
        alignment: Alignment.center,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
            errorBuilder: (context, error, child) => _ScannerError(error: error),
          ),
          // Scrim oscuro con una ventana recortada sobre el marco guía.
          IgnorePointer(
            child: ColorFiltered(
              colorFilter: ColorFilter.mode(
                Colors.black.withValues(alpha: 0.55),
                BlendMode.srcOut,
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Container(
                    decoration: const BoxDecoration(
                      color: Colors.black,
                      backgroundBlendMode: BlendMode.dstOut,
                    ),
                  ),
                  Container(
                    width: _frameSize,
                    height: _frameSize,
                    decoration: BoxDecoration(
                      color: Colors.black,
                      borderRadius: BorderRadius.circular(24),
                    ),
                  ),
                ],
              ),
            ),
          ),
          // Marcadores de esquina del marco guía.
          const IgnorePointer(
            child: SizedBox(
              width: _frameSize,
              height: _frameSize,
              child: Stack(
                children: [
                  Positioned(top: 0, left: 0, child: _Corner(Alignment.topLeft)),
                  Positioned(top: 0, right: 0, child: _Corner(Alignment.topRight)),
                  Positioned(bottom: 0, left: 0, child: _Corner(Alignment.bottomLeft)),
                  Positioned(bottom: 0, right: 0, child: _Corner(Alignment.bottomRight)),
                ],
              ),
            ),
          ),
          Positioned(
            bottom: 64,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.55),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Text(
                context.l10n.qrHint,
                style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w500),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Marcador de esquina en forma de "L" para el marco guía del escáner.
class _Corner extends StatelessWidget {
  const _Corner(this.alignment);

  final Alignment alignment;

  @override
  Widget build(BuildContext context) {
    const side = BorderSide(color: Colors.white, width: 4);
    final isTop = alignment.y < 0;
    final isLeft = alignment.x < 0;
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        border: Border(
          top: isTop ? side : BorderSide.none,
          bottom: isTop ? BorderSide.none : side,
          left: isLeft ? side : BorderSide.none,
          right: isLeft ? BorderSide.none : side,
        ),
      ),
    );
  }
}

class _ScannerError extends StatelessWidget {
  const _ScannerError({required this.error});

  final MobileScannerException error;

  @override
  Widget build(BuildContext context) {
    final denied = error.errorCode == MobileScannerErrorCode.permissionDenied;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.no_photography, size: 48, color: Colors.white70),
            const SizedBox(height: 16),
            Text(
              denied ? context.l10n.qrPermissionDenied : context.l10n.qrCameraError,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white),
            ),
          ],
        ),
      ),
    );
  }
}
