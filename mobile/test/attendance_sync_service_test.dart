import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show DatabaseConnection;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus_time_clock/src/core/db/app_database.dart';
import 'package:nexus_time_clock/src/features/attendance/data/attendance_sync_service.dart';
import 'package:nexus_time_clock/src/features/attendance/data/evidence_upload_service.dart';

/// La app no tiene detección de conectividad: lo único que distingue "no hay red" de "el servidor
/// dijo que no" es cómo se clasifica aquí el fallo. Cuando todo caía en el mismo saco, un 403 o un
/// error del servidor se quedaban en la cola para siempre y se le anunciaban al colaborador como
/// falta de conexión, que es justo el síntoma que se reportó.
void main() {
  late AppDatabase db;

  setUp(() {
    db = AppDatabase.forTesting(DatabaseConnection(NativeDatabase.memory()));
  });

  tearDown(() async {
    await db.close();
  });

  const uuid = '11111111-1111-1111-1111-111111111111';

  Future<void> enqueueOne() => db.enqueue(
        uuid,
        jsonEncode({'operationUuid': uuid, 'workSiteId': 'site-1', 'eventType': 'ENTRADA'}),
      );

  AttendanceSyncService serviceThat(_Responder responder) {
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost/api/v1'))
      ..httpClientAdapter = _StubAdapter(responder);
    return AttendanceSyncService(dio, db, EvidenceUploadService(dio, Dio()));
  }

  /// Una respuesta HTTP de error no es falta de red: repetir el mismo cuerpo daría lo mismo.
  test('un 403 cierra la operación como ERROR con el motivo del servidor', () async {
    await enqueueOne();
    final service = serviceThat(
      (_) => _json(403, {'detail': 'No tienes permiso para realizar esta acción.'}),
    );

    await service.syncPending();

    final row = await db.findByUuid(uuid);
    expect(row!.status, 'ERROR');
    expect(row.lastError, contains('HTTP_403'));
    expect(row.lastError, isNot(AttendanceSyncService.offlineMarker));
  });

  /// Estar sin cobertura sí es normal: la operación espera y no gasta intentos.
  test('un fallo de transporte deja la operación PENDING marcada como offline', () async {
    await enqueueOne();
    final service = serviceThat(
      (options) => throw DioException.connectionError(
        requestOptions: options,
        reason: 'sin red',
      ),
    );

    await service.syncPending();

    final row = await db.findByUuid(uuid);
    expect(row!.status, 'PENDING');
    expect(row.lastError, AttendanceSyncService.offlineMarker);
  });

  /// El caso reportado: QR de otra organización. Es un veredicto de negocio, no un fallo de red.
  test('un rechazo del servidor sale de la cola como REJECTED con su motivo', () async {
    await enqueueOne();
    final service = serviceThat(
      (_) => _json(200, {
        'results': [
          {'operationUuid': uuid, 'status': 'REJECTED', 'rejectionReason': 'INVALID_QR'},
        ],
      }),
    );

    await service.syncPending();

    final row = await db.findByUuid(uuid);
    expect(row!.status, 'REJECTED');
    expect(row.lastError, 'INVALID_QR');
  });

  /// Un error por operación puede ser transitorio, pero no eternamente: sin cota, el SYNC_ERROR que
  /// devolvía el backend se reintentaba en silencio en cada marcación y nunca se resolvía.
  test('un error por operación se reintenta pero acaba en ERROR al agotar los intentos', () async {
    await enqueueOne();
    final service = serviceThat(
      (_) => _json(200, {
        'results': [
          {'operationUuid': uuid, 'status': 'ERROR', 'error': 'SYNC_ERROR'},
        ],
      }),
    );

    await service.syncPending();
    expect((await db.findByUuid(uuid))!.status, 'PENDING');

    for (var i = 1; i < AttendanceSyncService.maxAttempts; i++) {
      await service.syncPending();
    }

    final row = await db.findByUuid(uuid);
    expect(row!.status, 'ERROR');
    expect(row.lastError, 'SYNC_ERROR');
  });

  /// Un cuerpo inesperado no puede propagarse: dejaría la pantalla girando y sin mensaje.
  test('una respuesta con forma inesperada no lanza y conserva la operación', () async {
    await enqueueOne();
    final service = serviceThat((_) => _json(200, {'inesperado': true}));

    await service.syncPending();

    final row = await db.findByUuid(uuid);
    expect(row!.status, 'PENDING');
    expect(row.lastError, 'RESPUESTA_INVALIDA');
  });

  /// El estado que consume la pantalla: distingue lo pendiente de lo fallido y expone el motivo.
  test('queueStatus separa lo pendiente de lo fallido e ignora el marcador de offline', () async {
    await enqueueOne();
    await db.incrementAttempts(uuid, AttendanceSyncService.offlineMarker);

    var status = await db.queueStatus();
    expect(status.pending, 1);
    expect(status.failed, 0);
    expect(status.lastIssue, isNull);

    await db.markStatus(uuid, 'ERROR', 'HTTP_403');

    status = await db.queueStatus();
    expect(status.pending, 0);
    expect(status.failed, 1);
    expect(status.lastIssue, 'HTTP_403');
  });
}

typedef _Responder = ResponseBody Function(RequestOptions options);

ResponseBody _json(int status, Map<String, dynamic> body) => ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

/// Adaptador de transporte de mentira: evita depender de una librería de mocks para fijar lo único
/// que estas pruebas necesitan controlar, que es la respuesta del servidor.
class _StubAdapter implements HttpClientAdapter {
  _StubAdapter(this._responder);

  final _Responder _responder;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async =>
      _responder(options);

  @override
  void close({bool force = false}) {}
}
