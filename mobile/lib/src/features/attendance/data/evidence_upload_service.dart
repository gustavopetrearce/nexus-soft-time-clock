import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';

/// Referencia del objeto ya subido al storage.
class UploadedEvidence {
  const UploadedEvidence(this.bucket, this.objectKey);

  final String bucket;
  final String objectKey;
}

/// Sube la evidencia fotográfica directamente al object storage con una URL prefirmada (ADR-008).
///
/// Son dos pasos: el backend emite la clave y la URL firmada, y el archivo viaja del dispositivo
/// al storage sin pasar por el backend.
class EvidenceUploadService {
  EvidenceUploadService(this._api, this._raw);

  /// Cliente autenticado, para pedir el ticket a la API propia.
  final Dio _api;

  /// Cliente SIN interceptores, para el PUT firmado. La firma va en la query-string: añadirle
  /// la cabecera `Authorization` del interceptor haría que el storage rechace la petición.
  final Dio _raw;

  Future<UploadedEvidence?> upload({
    required File file,
    String? workSiteId,
    required String sha256,
    required int sizeBytes,
    required String contentType,
  }) async {
    final ticket = await _api.post<Map<String, dynamic>>(
      '/attendance/evidence/uploads',
      data: {
        // Se omite en una marcación sin centro: el servidor decide entonces un prefijo propio.
        if (workSiteId != null) 'workSiteId': workSiteId,
        'contentType': contentType,
        'sizeBytes': sizeBytes,
        'sha256': sha256,
      },
    );
    final body = ticket.data;
    if (body == null) {
      return null;
    }

    final uploadUrl = body['uploadUrl'] as String;
    final bytes = await file.readAsBytes();
    await _raw.put<void>(
      uploadUrl,
      data: Stream.fromIterable([bytes]),
      options: Options(
        headers: {
          Headers.contentTypeHeader: contentType,
          Headers.contentLengthHeader: bytes.length,
        },
        followRedirects: false,
      ),
    );

    return UploadedEvidence(body['bucket'] as String, body['objectKey'] as String);
  }
}

final evidenceUploadServiceProvider = Provider<EvidenceUploadService>(
  (ref) => EvidenceUploadService(ref.read(dioProvider), Dio()),
);
