import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/db/app_database.dart';
import '../../../core/network/dio_provider.dart';
import 'evidence_upload_service.dart';

/// Envía la cola local al backend por lotes y aplica el resultado autoritativo del servidor a cada
/// operación (RN-53, RN-54).
///
/// Distinguir *por qué* falló el envío es parte del contrato: la app no tiene detección de
/// conectividad, así que si aquí se tratara cualquier fallo como falta de red —como se hacía— un 403
/// o un error del servidor se quedarían en la cola indefinidamente y se le anunciarían al
/// colaborador como falta de conexión. Solo un fallo de transporte deja la operación PENDING sin
/// coste; que el servidor conteste significa que sí había conexión.
class AttendanceSyncService {
  AttendanceSyncService(this._dio, this._db, this._evidence);

  /// Marca de fallo de transporte; la UI lo traduce a "se sincronizará cuando haya conexión".
  static const String offlineMarker = 'OFFLINE';

  /// Pasados estos intentos un fallo deja de considerarse transitorio y la operación pasa a ERROR:
  /// sin esta cota, un error determinista del servidor se reintenta para siempre en silencio.
  static const int maxAttempts = 5;

  final Dio _dio;
  final AppDatabase _db;
  final EvidenceUploadService _evidence;

  Future<void> syncPending() async {
    final pending = await _db.pending();
    if (pending.isEmpty) {
      return;
    }

    // La evidencia viaja aparte del lote: primero se sube la foto y solo entonces la operación
    // puede enviarse con su referencia. Una subida fallida no arrastra al resto del lote.
    final sent = <String>[];
    final operations = <Map<String, dynamic>>[];
    for (final op in pending) {
      final payload = await _payloadWithEvidence(op);
      if (payload != null) {
        operations.add(payload);
        sent.add(op.operationUuid);
      }
    }
    if (operations.isEmpty) {
      return; // el motivo ya quedó anotado en el last_error de cada operación
    }

    try {
      // Respuesta sin tipar a propósito: el reintento tras 401 del interceptor resuelve un
      // `Response<dynamic>`, y pedir aquí `Response<Map<String, dynamic>>` lo convertiría en un
      // error de cast que escaparía como excepción no-Dio.
      final response = await _dio.post<dynamic>(
        '/sync/attendance',
        data: {'operations': operations},
      );
      final body = response.data;
      final results = body is Map ? body['results'] : null;
      if (results is! List) {
        await _retryLater(sent, 'RESPUESTA_INVALIDA');
        return;
      }
      for (final r in results) {
        if (r is Map) {
          await _applyResult(r);
        }
      }
    } on DioException catch (e) {
      await _applyTransportFailure(sent, e);
    } catch (e) {
      // Nada puede escapar de aquí: el llamador no tiene red de seguridad y una excepción dejaría
      // la pantalla girando sin mensaje y la operación en la cola sin explicación.
      await _retryLater(sent, 'ERROR_INESPERADO: $e');
    }
  }

  /// Aplica a la fila local el veredicto del servidor para una operación del lote.
  Future<void> _applyResult(Map<dynamic, dynamic> r) async {
    final uuid = r['operationUuid'] as String?;
    if (uuid == null) {
      return;
    }
    final error = r['error'] as String?;
    final status = r['status'] as String?;

    if (error != null) {
      // Fallo por operación (RN-54). Puede ser transitorio, así que se reintenta, pero con cota:
      // un error determinista del servidor no se arregla repitiéndolo.
      await _retryLater([uuid], error);
      return;
    }
    if (status == 'ACCEPTED') {
      // Aceptado; si el servidor detectó retardo (RN-16) se anota en la nota para informarlo.
      final late = r['minutesLate'] as int?;
      await _db.markStatus(uuid, 'SYNCED', (late != null && late > 0) ? 'LATE:$late' : null);
      await _discardLocalPhoto(uuid);
      return;
    }
    await _db.markStatus(uuid, 'REJECTED', r['rejectionReason'] as String?);
    await _discardLocalPhoto(uuid);
  }

  /// Traduce un [DioException] a estado local: sin respuesta es un fallo de transporte (sin red);
  /// con respuesta, el servidor contestó y hay que decir con qué código.
  Future<void> _applyTransportFailure(List<String> uuids, DioException e) async {
    final status = e.response?.statusCode;
    if (status == null) {
      // Sin cota de intentos: estar sin cobertura es una condición normal de la app offline-first
      // y no debe consumir los reintentos de la operación.
      for (final uuid in uuids) {
        await _db.incrementAttempts(uuid, offlineMarker);
      }
      return;
    }
    final detail = _problemDetail(e.response?.data);
    final label = detail == null ? 'HTTP_$status' : 'HTTP_$status: $detail';
    if (_isTerminal(status)) {
      for (final uuid in uuids) {
        await _db.markStatus(uuid, 'ERROR', label);
      }
      return;
    }
    await _retryLater(uuids, label);
  }

  /// Deja las operaciones PENDING para otro intento, o las cierra como ERROR si ya se agotaron.
  Future<void> _retryLater(List<String> uuids, String reason) async {
    for (final uuid in uuids) {
      await _db.incrementAttempts(uuid, reason);
      final row = await _db.findByUuid(uuid);
      if (row != null && row.attempts >= maxAttempts) {
        await _db.markStatus(uuid, 'ERROR', reason);
      }
    }
  }

  /// 4xx atribuibles a la petición: repetir el mismo cuerpo daría el mismo resultado. 408 y 429 sí
  /// se reintentan, y todo 5xx también.
  bool _isTerminal(int status) => status >= 400 && status < 500 && status != 408 && status != 429;

  /// Mensaje legible de un ProblemDetail (RFC 7807), que es lo que devuelve el backend.
  String? _problemDetail(dynamic body) {
    if (body is! Map) {
      return null;
    }
    final detail = body['detail'] ?? body['code'] ?? body['title'];
    return detail is String && detail.isNotEmpty ? detail : null;
  }

  /// Devuelve el payload de la operación listo para enviarse, subiendo antes su foto si hace falta.
  ///
  /// Devuelve `null` si la subida falla: esa operación se queda fuera del lote y se reintenta,
  /// porque enviarla sin evidencia haría que un centro con foto obligatoria la rechace en firme.
  /// El motivo queda siempre anotado en la fila; antes se salía en silencio y la marcación se
  /// quedaba pendiente sin que nada explicara por qué.
  Future<Map<String, dynamic>?> _payloadWithEvidence(PendingAttendanceOp op) async {
    final payload = jsonDecode(op.payload) as Map<String, dynamic>;

    final path = op.evidencePath;
    if (path == null || op.evidenceKey != null) {
      return payload; // sin foto, o ya subida en un intento anterior
    }

    final file = File(path);
    if (!file.existsSync()) {
      // El archivo se perdió (limpieza del sistema, borrado manual). Se envía sin evidencia y que
      // el servidor decida: si el centro la exige, responderá PHOTO_REQUIRED con su motivo.
      await _db.clearEvidencePath(op.operationUuid);
      return payload;
    }

    try {
      final uploaded = await _evidence.upload(
        file: file,
        workSiteId: payload['workSiteId'] as String?,
        sha256: op.evidenceSha256 ?? '',
        sizeBytes: file.lengthSync(),
        contentType: 'image/jpeg',
      );
      if (uploaded == null) {
        await _retryLater([op.operationUuid], 'evidencia: respuesta vacía del servidor');
        return null;
      }
      await _db.markEvidenceUploaded(op.operationUuid, uploaded.bucket, uploaded.objectKey);
      payload['evidenceBucket'] = uploaded.bucket;
      payload['evidenceKey'] = uploaded.objectKey;
      if (op.evidenceSha256 != null) {
        payload['evidenceHash'] = op.evidenceSha256;
      }
      return payload;
    } on DioException catch (e) {
      await _applyTransportFailure([op.operationUuid], e);
      return null;
    } catch (e) {
      await _retryLater([op.operationUuid], 'evidencia: $e');
      return null;
    }
  }

  /// Tras un veredicto definitivo el archivo local ya no hace falta.
  Future<void> _discardLocalPhoto(String operationUuid) async {
    final row = await _db.findByUuid(operationUuid);
    final path = row?.evidencePath;
    if (path == null) {
      return;
    }
    try {
      final file = File(path);
      if (file.existsSync()) {
        await file.delete();
      }
    } catch (_) {
      // Un archivo que no se puede borrar no debe romper la sincronización.
    }
    await _db.clearEvidencePath(operationUuid);
  }
}

final attendanceSyncServiceProvider = Provider<AttendanceSyncService>(
  (ref) => AttendanceSyncService(
    ref.read(dioProvider),
    ref.read(appDatabaseProvider),
    ref.read(evidenceUploadServiceProvider),
  ),
);
