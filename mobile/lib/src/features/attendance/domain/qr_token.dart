import 'dart:convert';

/// Ámbito de un QR ya reconocido: el centro al que pertenece, o ninguno.
///
/// Distinguir «QR de empresa» de «QR ilegible» importa: ambos casos carecen de centro, pero el
/// primero es un registro válido sin geocerca y el segundo hay que rechazarlo antes de encolar.
class QrScope {
  const QrScope(this.workSiteId);

  /// Centro del QR; `null` en un QR de empresa (registro sin centro de trabajo).
  final String? workSiteId;

  bool get isCompanyWide => workSiteId == null;
}

/// Lee el ámbito del QR firmado (ADR-006). El token tiene el formato
/// `base64url(body).base64url(sig)` donde `body = tenantId|workSiteId|nonce|exp`, y en un QR de
/// empresa el segundo campo va vacío. Aquí solo se decodifica el cuerpo; la firma y la vigencia
/// las valida el servidor. Devuelve `null` si el formato no es reconocible.
QrScope? scopeFromQrToken(String rawToken) {
  final dot = rawToken.indexOf('.');
  if (dot <= 0) {
    return null;
  }
  try {
    final body = utf8.decode(base64Url.decode(base64Url.normalize(rawToken.substring(0, dot))));
    final parts = body.split('|');
    if (parts.length != 4 || parts[0].isEmpty) {
      return null;
    }
    return QrScope(parts[1].isEmpty ? null : parts[1]);
  } catch (_) {
    return null;
  }
}
