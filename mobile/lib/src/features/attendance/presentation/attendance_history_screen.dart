import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../data/attendance_history_service.dart';
import '../../../core/i18n/l10n.dart';
import '../domain/attendance_record.dart';
import 'attendance_l10n.dart';

/// Historial personal de asistencia (RF-05, HU-16). Muestra los registros del colaborador
/// (fecha y hora, tipo de evento, centro de trabajo y estado) filtrables por rango de fechas.
class AttendanceHistoryScreen extends ConsumerStatefulWidget {
  const AttendanceHistoryScreen({super.key});

  @override
  ConsumerState<AttendanceHistoryScreen> createState() => _AttendanceHistoryScreenState();
}

class _AttendanceHistoryScreenState extends ConsumerState<AttendanceHistoryScreen> {
  late DateTimeRange _range;
  late Future<List<AttendanceRecord>> _future;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _range = DateTimeRange(start: now.subtract(const Duration(days: 30)), end: now);
    _future = _load();
  }

  Future<List<AttendanceRecord>> _load() {
    return ref.read(attendanceHistoryServiceProvider).myHistory(
          from: _range.start,
          to: _range.end,
        );
  }

  void _reload() => setState(() => _future = _load());

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      initialDateRange: _range,
      firstDate: DateTime(now.year - 5),
      lastDate: now,
    );
    if (picked != null) {
      setState(() {
        _range = picked;
        _future = _load();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    final rangeFormat = DateFormat.yMd(context.intlLocale);
    final stampFormat = DateFormat.yMd(context.intlLocale).add_Hm();
    return Scaffold(
      appBar: AppBar(title: Text(l10n.historyTitle)),
      body: Column(
        children: [
          _RangeBar(
            label: '${rangeFormat.format(_range.start)} — ${rangeFormat.format(_range.end)}',
            onTap: _pickRange,
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => _reload(),
              child: FutureBuilder<List<AttendanceRecord>>(
                future: _future,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (snapshot.hasError) {
                    return _MessageState(
                      icon: Icons.cloud_off_outlined,
                      title: l10n.historyLoadError,
                      subtitle: l10n.historyLoadErrorHint,
                      onRetry: _reload,
                    );
                  }
                  final records = snapshot.data ?? const [];
                  if (records.isEmpty) {
                    return _MessageState(
                      icon: Icons.event_busy_outlined,
                      title: l10n.historyEmpty,
                      subtitle: l10n.historyEmptyHint,
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: records.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, i) => _RecordTile(
                      record: records[i],
                      stampFormat: stampFormat,
                      theme: theme,
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Barra superior con el rango de fechas activo; toca para elegir otro.
class _RangeBar extends StatelessWidget {
  const _RangeBar({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Icon(Icons.date_range, color: scheme.primary),
              const SizedBox(width: 12),
              Expanded(child: Text(label, style: Theme.of(context).textTheme.bodyLarge)),
              Icon(Icons.edit_calendar_outlined, size: 20, color: scheme.onSurfaceVariant),
            ],
          ),
        ),
      ),
    );
  }
}

/// Fila de un registro: tipo de evento, fecha/hora, centro de trabajo y chip de estado.
class _RecordTile extends StatelessWidget {
  const _RecordTile({required this.record, required this.stampFormat, required this.theme});

  final AttendanceRecord record;
  final DateFormat stampFormat;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      title: Text(context.l10n.recordEventType(record), style: theme.textTheme.titleMedium),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 4),
          _IconLine(icon: Icons.schedule, text: stampFormat.format(record.serverTime)),
          const SizedBox(height: 2),
          _IconLine(icon: Icons.place_outlined, text: record.workCenter),
          if (context.l10n.recordRejectionReason(record) != null) ...[
            const SizedBox(height: 2),
            _IconLine(
              icon: Icons.info_outline,
              text: context.l10n.recordRejectionReason(record)!,
              color: theme.colorScheme.error,
            ),
          ],
        ],
      ),
      trailing: _StatusChip(record: record, theme: theme),
    );
  }
}

class _IconLine extends StatelessWidget {
  const _IconLine({required this.icon, required this.text, this.color});

  final IconData icon;
  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final c = color ?? scheme.onSurfaceVariant;
    return Row(
      children: [
        Icon(icon, size: 16, color: c),
        const SizedBox(width: 6),
        Expanded(
          child: Text(text, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: c)),
        ),
      ],
    );
  }
}

/// Chip de estado coloreado: aceptado (verde), rechazado (rojo), en revisión (ámbar).
class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.record, required this.theme});

  final AttendanceRecord record;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final scheme = theme.colorScheme;
    final Color color;
    if (record.isAccepted) {
      color = Colors.green.shade600;
    } else if (record.isRejected) {
      color = scheme.error;
    } else {
      color = Colors.amber.shade800;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        context.l10n.recordStatus(record),
        style: theme.textTheme.labelSmall?.copyWith(color: color, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// Estado vacío o de error con icono, mensaje y reintento opcional.
class _MessageState extends StatelessWidget {
  const _MessageState({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onRetry,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // ListView para que el RefreshIndicator siga funcionando aun sin contenido.
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 96),
          child: Column(
            children: [
              Icon(icon, size: 56, color: theme.colorScheme.onSurfaceVariant),
              const SizedBox(height: 16),
              Text(title, style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Text(
                  subtitle,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ),
              if (onRetry != null) ...[
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh),
                  label: Text(context.l10n.commonRetry),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
