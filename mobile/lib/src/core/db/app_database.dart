import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

part 'app_database.g.dart';

/// Cola local de operaciones de asistencia creadas offline (offline-first, RF-21).
/// Cada operación se persiste ANTES de intentar enviarse; nunca se pierde por falta de red.
class PendingAttendanceOps extends Table {
  TextColumn get operationUuid => text()();
  TextColumn get payload => text()(); // JSON del RegisterAttendanceRequest
  TextColumn get status => text().withDefault(const Constant('PENDING'))(); // PENDING/SYNCED/REJECTED/ERROR
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  TextColumn get lastError => text().nullable()();
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();

  // Evidencia fotográfica (RF-18). La foto se captura junto con la marcación pero se sube
  // aparte: aquí queda la ruta del archivo local hasta que la subida tenga éxito, momento en
  // el que se guardan bucket y clave para incorporarlos al payload que se envía.
  TextColumn get evidencePath => text().nullable()();
  TextColumn get evidenceSha256 => text().nullable()();
  TextColumn get evidenceBucket => text().nullable()();
  TextColumn get evidenceKey => text().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {operationUuid};
}

/// Política de registro de cada centro, cacheada para poder exigir la foto estando sin conexión.
/// El servidor sigue siendo autoritativo (RN-53): esto solo evita que el colaborador descubra
/// la exigencia por un rechazo.
class SitePolicyCache extends Table {
  TextColumn get workSiteId => text()();
  BoolColumn get requirePhoto => boolean().withDefault(const Constant(false))();
  BoolColumn get requireBiometric => boolean().withDefault(const Constant(false))();
  IntColumn get gpsAccuracyMaxM => integer().nullable()();
  DateTimeColumn get fetchedAt => dateTime().withDefault(currentDateAndTime)();

  @override
  Set<Column<Object>> get primaryKey => {workSiteId};
}

@DriftDatabase(tables: [PendingAttendanceOps, SitePolicyCache])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  /// Constructor para pruebas: permite inyectar una base en memoria y verificar las migraciones.
  AppDatabase.forTesting(super.connection);

  @override
  int get schemaVersion => 2;

  /// Sin esta estrategia, una app ya instalada con el esquema v1 fallaría al abrir la base:
  /// las columnas de evidencia y la tabla de políticas no existirían.
  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        onUpgrade: (m, from, to) async {
          if (from < 2) {
            await m.addColumn(pendingAttendanceOps, pendingAttendanceOps.evidencePath);
            await m.addColumn(pendingAttendanceOps, pendingAttendanceOps.evidenceSha256);
            await m.addColumn(pendingAttendanceOps, pendingAttendanceOps.evidenceBucket);
            await m.addColumn(pendingAttendanceOps, pendingAttendanceOps.evidenceKey);
            await m.createTable(sitePolicyCache);
          }
        },
      );

  Future<void> enqueue(
    String operationUuid,
    String payload, {
    String? evidencePath,
    String? evidenceSha256,
  }) {
    return into(pendingAttendanceOps).insert(
      PendingAttendanceOpsCompanion.insert(
        operationUuid: operationUuid,
        payload: payload,
        evidencePath: Value(evidencePath),
        evidenceSha256: Value(evidenceSha256),
      ),
      mode: InsertMode.insertOrIgnore, // idempotente: no duplica el mismo UUID
    );
  }

  /// Anota la referencia devuelta por el storage tras subir la foto, para incorporarla al payload.
  Future<void> markEvidenceUploaded(String operationUuid, String bucket, String key) {
    return (update(pendingAttendanceOps)..where((t) => t.operationUuid.equals(operationUuid)))
        .write(PendingAttendanceOpsCompanion(
      evidenceBucket: Value(bucket),
      evidenceKey: Value(key),
    ),);
  }

  /// Olvida el archivo local una vez que la operación llegó a un estado terminal.
  Future<void> clearEvidencePath(String operationUuid) {
    return (update(pendingAttendanceOps)..where((t) => t.operationUuid.equals(operationUuid)))
        .write(const PendingAttendanceOpsCompanion(evidencePath: Value(null)));
  }

  /// Política cacheada del centro; `null` si nunca se consultó en este dispositivo.
  Future<SitePolicyCacheData?> sitePolicy(String workSiteId) {
    return (select(sitePolicyCache)..where((t) => t.workSiteId.equals(workSiteId))).getSingleOrNull();
  }

  Future<void> saveSitePolicy(
    String workSiteId,
    bool requirePhoto,
    bool requireBiometric,
    int? gpsAccuracyMaxM,
  ) {
    return into(sitePolicyCache).insertOnConflictUpdate(SitePolicyCacheData(
      workSiteId: workSiteId,
      requirePhoto: requirePhoto,
      requireBiometric: requireBiometric,
      gpsAccuracyMaxM: gpsAccuracyMaxM,
      fetchedAt: DateTime.now(),
    ),);
  }

  Future<List<PendingAttendanceOp>> pending() {
    return (select(pendingAttendanceOps)
          ..where((t) => t.status.equals('PENDING'))
          ..orderBy([(t) => OrderingTerm.asc(t.createdAt)]))
        .get();
  }

  Future<int> pendingCount() async {
    final rows = await (select(pendingAttendanceOps)..where((t) => t.status.equals('PENDING'))).get();
    return rows.length;
  }

  /// Estado de la cola para la UI. Además del contador expone las operaciones que quedaron en
  /// firme sin registrarse y el último motivo real de fallo: ese motivo ya se guardaba en
  /// `last_error`, pero al no mostrarse en ninguna pantalla, un rechazo del servidor era
  /// indistinguible de una falta de cobertura.
  Future<SyncQueueStatus> queueStatus() async {
    final rows = await select(pendingAttendanceOps).get();
    bool hasIssue(PendingAttendanceOp r) =>
        (r.status == 'PENDING' || r.status == 'ERROR') &&
        r.lastError != null &&
        r.lastError != 'OFFLINE';

    final withIssue = rows.where(hasIssue).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return SyncQueueStatus(
      pending: rows.where((r) => r.status == 'PENDING').length,
      failed: rows.where((r) => r.status == 'ERROR').length,
      lastIssue: withIssue.isEmpty ? null : withIssue.first.lastError,
    );
  }

  /// Vacía la cola local completa. Se usa al cerrar sesión para que las marcaciones de un
  /// usuario no se atribuyan al siguiente (la tabla es global del dispositivo, sin scope de usuario).
  /// Borra también las fotos pendientes: son datos personales del usuario que cierra sesión y,
  /// sin su operación en la cola, ya no hay nada que las suba.
  Future<void> clearAll() async {
    final rows = await select(pendingAttendanceOps).get();
    for (final row in rows) {
      final path = row.evidencePath;
      if (path != null) {
        try {
          final file = File(path);
          if (file.existsSync()) {
            await file.delete();
          }
        } catch (_) {
          // Un archivo que no se puede borrar no debe impedir el cierre de sesión.
        }
      }
    }
    await delete(pendingAttendanceOps).go();
    await delete(sitePolicyCache).go();
  }

  Future<PendingAttendanceOp?> findByUuid(String operationUuid) {
    return (select(pendingAttendanceOps)..where((t) => t.operationUuid.equals(operationUuid)))
        .getSingleOrNull();
  }

  Future<void> markStatus(String operationUuid, String status, String? error) {
    return (update(pendingAttendanceOps)..where((t) => t.operationUuid.equals(operationUuid)))
        .write(PendingAttendanceOpsCompanion(
      status: Value(status),
      lastError: Value(error),
    ),);
  }

  Future<void> incrementAttempts(String operationUuid, String error) {
    return customUpdate(
      'UPDATE pending_attendance_ops SET attempts = attempts + 1, last_error = ? WHERE operation_uuid = ?',
      variables: [Variable(error), Variable(operationUuid)],
      updates: {pendingAttendanceOps},
    );
  }
}

/// Resumen de la cola local de marcaciones para mostrarlo en pantalla.
class SyncQueueStatus {
  const SyncQueueStatus({required this.pending, required this.failed, this.lastIssue});

  /// Operaciones aún por enviar.
  final int pending;

  /// Operaciones que el servidor rechazó en firme y no se reintentarán.
  final int failed;

  /// Último motivo de fallo distinto de «sin conexión», o `null` si no lo hubo.
  final String? lastIssue;
}

LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    final dir = await getApplicationDocumentsDirectory();
    final file = File(p.join(dir.path, 'nexus_time_clock.sqlite'));
    return NativeDatabase.createInBackground(file);
  });
}

final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});
