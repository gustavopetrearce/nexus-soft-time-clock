import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/db/app_database.dart';
import '../../../core/i18n/l10n.dart';
import '../../../core/ui/nx_ui.dart';
import '../application/today_attendance.dart';
import '../data/attendance_history_service.dart';
import '../domain/attendance_record.dart';
import 'attendance_l10n.dart';

/// Mi historial (P07, RF-05, HU-16): registros del colaborador en un rango de fechas (por defecto,
/// los últimos 15 días), del más reciente al más antiguo. Lo que sigue en la cola local va primero
/// como «Pendiente de enviar».
class AttendanceHistoryScreen extends ConsumerStatefulWidget {
  const AttendanceHistoryScreen({super.key});

  /// Días del rango por defecto (HIFI/08 R1).
  static const defaultRangeDays = 15;

  @override
  ConsumerState<AttendanceHistoryScreen> createState() => _AttendanceHistoryScreenState();
}

class _History {
  const _History(this.pending, this.records);

  final List<LocalPendingRecord> pending;
  final List<AttendanceRecord> records;

  bool get isEmpty => pending.isEmpty && records.isEmpty;
}

class _AttendanceHistoryScreenState extends ConsumerState<AttendanceHistoryScreen> {
  late DateTime _from;
  late DateTime _to;
  late Future<_History> _future;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _to = DateTime(now.year, now.month, now.day);
    _from = _to.subtract(const Duration(days: AttendanceHistoryScreen.defaultRangeDays - 1));
    _future = _load();
  }

  Future<_History> _load() async {
    final records = await ref.read(attendanceHistoryServiceProvider).myHistory(from: _from, to: _to);
    final end = _to.add(const Duration(days: 1));
    final pending = (await localPendingRecords(ref.read(appDatabaseProvider)))
        .where((p) => !p.deviceTime.isBefore(_from) && p.deviceTime.isBefore(end))
        .toList();
    records.sort((a, b) => b.serverTime.compareTo(a.serverTime));
    return _History(pending, records);
  }

  void _reload() => setState(() => _future = _load());

  /// "Hasta" no acepta un día anterior a "Desde" (y viceversa): lo limitan los propios selectores.
  Future<void> _pick({required bool from}) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: from ? _from : _to,
      firstDate: from ? DateTime(now.year - 5) : _from,
      lastDate: from ? _to : now,
    );
    if (picked == null) return;
    setState(() {
      if (from) {
        _from = picked;
      } else {
        _to = picked;
      }
      _future = _load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.historyTitle)),
      body: FutureBuilder<_History>(
        future: _future,
        builder: (context, snapshot) {
          final loading = snapshot.connectionState == ConnectionState.waiting;
          final data = snapshot.data;
          return NxConCarga(
            loading: loading,
            label: l10n.commonLoading,
            child: RefreshIndicator(
              onRefresh: () async => _reload(),
              child: NxContenido(
                children: [
                  Semantics(
                    container: true,
                    label: l10n.historyRange,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: NxCampoFecha(
                            label: l10n.vacationsFrom,
                            text: fullDate(context, _from),
                            onTap: () => _pick(from: true),
                          ),
                        ),
                        const SizedBox(width: NxTokens.spaceGapRelated),
                        Expanded(
                          child: NxCampoFecha(
                            label: l10n.vacationsTo,
                            text: fullDate(context, _to),
                            onTap: () => _pick(from: false),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (snapshot.hasError && !loading)
                    NxEstadoVacio.error(
                      title: l10n.commonLoadError,
                      description: l10n.commonLoadErrorHint,
                      retryLabel: l10n.commonRetry,
                      onRetry: _reload,
                    )
                  else if (data != null && data.isEmpty && !loading)
                    NxEstadoVacio(icon: Icons.history, title: l10n.historyEmpty)
                  else if (data != null)
                    NxLista(
                      children: [
                        for (final p in data.pending) _PendingTile(record: p),
                        for (final r in data.records) _RecordTile(record: r),
                      ],
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

IconData _eventIcon(String eventType) => switch (eventType) {
      'ENTRADA' => Icons.login,
      'SALIDA' => Icons.logout,
      'INICIO_DESCANSO' => Icons.free_breakfast_outlined,
      'FIN_DESCANSO' => Icons.work_history_outlined,
      'CAMBIO_SITIO' => Icons.location_on_outlined,
      _ => Icons.schedule,
    };

/// Fila de un registro del servidor: evento y hora, fecha y centro, motivo si aplica, chip.
class _RecordTile extends StatelessWidget {
  const _RecordTile({required this.record});

  final AttendanceRecord record;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final note = switch (record.status) {
      'REJECTED' => l10n.rejectionMessage(record.rejectionReason, eventType: record.eventType),
      'PENDING_REVIEW' => l10n.attendanceReviewNote,
      _ => null,
    };
    return NxListaFila(
      leading: _eventIcon(record.eventType),
      title: Text(
        l10n.historyEventAt(l10n.recordEventType(record), DateFormat('HH:mm').format(record.serverTime)),
        style: const TextStyle(fontFeatures: [NxTokens.fontFeatureTabular]),
      ),
      subtitle: [
        Text('${fullDate(context, record.serverTime)} · ${record.workCenter}'),
        if (note != null) Text(note),
      ],
      trailing: NxChip(label: l10n.recordStatus(record), tone: attendanceStatusTone(record.status)),
    );
  }
}

/// Fila de una marcación que aún está en la cola local (hora del dispositivo).
class _PendingTile extends StatelessWidget {
  const _PendingTile({required this.record});

  final LocalPendingRecord record;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final name = l10n.eventTypeName(record.eventType) ?? prettifyCode(record.eventType);
    return NxListaFila(
      leading: _eventIcon(record.eventType),
      title: Text(
        l10n.historyEventAt(name, DateFormat('HH:mm').format(record.deviceTime)),
        style: const TextStyle(fontFeatures: [NxTokens.fontFeatureTabular]),
      ),
      subtitle: [Text(fullDate(context, record.deviceTime))],
      trailing: NxChip(
        label: l10n.recordStatusLocalPending,
        tone: NxTone.info,
        icon: Icons.cloud_off_outlined,
      ),
    );
  }
}
