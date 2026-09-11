import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexus_time_clock/src/features/attendance/domain/qr_token.dart';

/// Arma un token con la forma que emite el backend: `base64url(body).base64url(sig)`.
/// La firma no se valida en el cliente, así que basta con que exista.
String token(String body) => '${base64Url.encode(utf8.encode(body)).replaceAll('=', '')}.firma';

void main() {
  const tenant = '11111111-1111-1111-1111-111111111111';
  const site = '22222222-2222-2222-2222-222222222222';

  test('un QR de centro devuelve su centro', () {
    final scope = scopeFromQrToken(token('$tenant|$site|nonce|1790000000'));

    expect(scope, isNotNull);
    expect(scope!.workSiteId, site);
    expect(scope.isCompanyWide, isFalse);
  });

  test('un QR de empresa lleva el centro vacío y no es un token ilegible', () {
    final scope = scopeFromQrToken(token('$tenant||nonce|1790000000'));

    expect(scope, isNotNull);
    expect(scope!.workSiteId, isNull);
    expect(scope.isCompanyWide, isTrue);
  });

  test('un token con menos campos de los debidos se descarta', () {
    expect(scopeFromQrToken(token('$tenant|$site|nonce')), isNull);
  });

  test('un cuerpo sin tenant se descarta aunque tenga cuatro campos', () {
    expect(scopeFromQrToken(token('||nonce|1790000000')), isNull);
  });

  test('basura o texto sin punto separador se descarta', () {
    expect(scopeFromQrToken('no-es-un-token'), isNull);
    expect(scopeFromQrToken(''), isNull);
    expect(scopeFromQrToken('.solo-firma'), isNull);
  });
}
