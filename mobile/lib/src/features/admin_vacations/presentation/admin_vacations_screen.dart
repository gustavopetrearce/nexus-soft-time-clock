import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/l10n.dart';

import '../application/admin_vacations_controller.dart';
import '../domain/admin_vacation_models.dart';

/// Bandeja de aprobación de vacaciones (COMPANY_ADMIN / HR_ADMIN). Espejo móvil de
/// la bandeja del portal web: filtra por estado y resuelve (aprobar/rechazar) con nota.
class AdminVacationsScreen extends ConsumerWidget {
  const AdminVacationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(adminVacationsControllerProvider);
    final controller = ref.read(adminVacationsControllerProvider.notifier);
    final l10n = context.l10n;
    final filters = <(String, String)>[
      ('PENDING', l10n.adminVacationsFilterPending),
      ('APPROVED', l10n.adminVacationsFilterApproved),
      ('REJECTED', l10n.adminVacationsFilterRejected),
      ('', l10n.adminVacationsFilterAll),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(l10n.homeApproveVacationsTitle)),
      body: Column(
        children: [
          _FilterBar(
            selected: state.statusFilter,
            filters: filters,
            onSelected: controller.setStatus,
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: controller.load,
              child: _Body(state: state, controller: controller),
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterBar extends StatelessWidget {
  const _FilterBar({required this.selected, required this.filters, required this.onSelected});

  final String selected;
  final List<(String, String)> filters;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          for (final f in filters) ...[
            ChoiceChip(
              label: Text(f.$2),
              selected: selected == f.$1,
              onSelected: (_) => onSelected(f.$1),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.state, required this.controller});

  final AdminVacationsState state;
  final AdminVacationsController controller;

  @override
  Widget build(BuildContext context) {
    if (state.loading) {
      return const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()));
    }
    if (state.error != null && state.items.isEmpty) {
      return _messageList(child: Text(_errorText(context, state.error!), textAlign: TextAlign.center));
    }
    if (state.items.isEmpty) {
      return _messageList(child: _empty(context));
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      itemCount: state.items.length + (state.hasMore ? 1 : 0),
      itemBuilder: (context, index) {
        if (index >= state.items.length) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Center(
              child: state.loadingMore
                  ? const CircularProgressIndicator()
                  : OutlinedButton(onPressed: controller.loadMore, child: Text(context.l10n.adminVacationsLoadMore)),
            ),
          );
        }
        return _RequestCard(
          request: state.items[index],
          onTap: () => _openDetail(context, state.items[index], controller),
        );
      },
    );
  }

  String _errorText(BuildContext context, AdminVacationsError error) => switch (error) {
        AdminVacationsError.load => context.l10n.adminVacationsLoadError,
        AdminVacationsError.loadMore => context.l10n.adminVacationsLoadMoreError,
      };

  // La lista debe poder desplazarse para que RefreshIndicator funcione aun cuando está vacía.
  Widget _messageList({required Widget child}) => ListView(
        padding: const EdgeInsets.fromLTRB(24, 80, 24, 24),
        children: [Center(child: child)],
      );

  Widget _empty(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Icon(Icons.beach_access_outlined, size: 44, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(height: 12),
        Text(context.l10n.adminVacationsEmpty, style: theme.textTheme.bodyMedium),
      ],
    );
  }
}

class _RequestCard extends StatelessWidget {
  const _RequestCard({required this.request, required this.onTap});

  final AdminVacationRequest request;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = statusStyle(request.status, theme, context.l10n);
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: CircleAvatar(
          backgroundColor: s.$2.withValues(alpha: 0.16),
          child: Icon(Icons.beach_access, color: s.$2, size: 20),
        ),
        title: Text(request.displayName, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (request.employeeCode != null && request.employeeCode!.isNotEmpty)
              Text(request.employeeCode!, style: theme.textTheme.bodySmall),
            const SizedBox(height: 2),
            Text('${shortIsoDate(context, request.startDate)} – ${shortIsoDate(context, request.endDate)} · '
                '${context.l10n.vacationsDays(request.days)}'),
            const SizedBox(height: 6),
            _StatusPill(status: request.status),
          ],
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = statusStyle(status, theme, context.l10n);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: s.$2.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(999)),
      child: Text(s.$1, style: theme.textTheme.labelSmall?.copyWith(color: s.$2, fontWeight: FontWeight.w700)),
    );
  }
}

Future<void> _openDetail(
  BuildContext context,
  AdminVacationRequest request,
  AdminVacationsController controller,
) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _ResolveSheet(request: request, controller: controller),
  );
}

/// Hoja de detalle + resolución. Para PENDING muestra nota + botones Aprobar/Rechazar;
/// para el resto es solo lectura.
class _ResolveSheet extends StatefulWidget {
  const _ResolveSheet({required this.request, required this.controller});

  final AdminVacationRequest request;
  final AdminVacationsController controller;

  @override
  State<_ResolveSheet> createState() => _ResolveSheetState();
}

class _ResolveSheetState extends State<_ResolveSheet> {
  final _note = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _resolve(bool approve) async {
    setState(() => _saving = true);
    final ok = await widget.controller.resolve(
      widget.request,
      approve: approve,
      note: _note.text.trim(),
    );
    if (!mounted) return;
    final l10n = context.l10n;
    if (ok) {
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(approve ? l10n.adminVacationsApproved : l10n.adminVacationsRejected)),
      );
    } else {
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.adminVacationsResolveError)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final r = widget.request;
    final l10n = context.l10n;
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, 20 + bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(r.displayName, style: theme.textTheme.titleLarge),
          if (r.employeeCode != null && r.employeeCode!.isNotEmpty)
            Text(r.employeeCode!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          const SizedBox(height: 16),
          _detailRow(theme, l10n.adminVacationsPeriod, '${shortIsoDate(context, r.startDate)} – ${shortIsoDate(context, r.endDate)}'),
          _detailRow(theme, l10n.adminVacationsRequestedDays, '${r.days}'),
          if (r.reason != null && r.reason!.isNotEmpty) _detailRow(theme, l10n.adminVacationsReason, r.reason!),
          _detailRow(theme, l10n.adminVacationsStatus, statusStyle(r.status, theme, l10n).$1),
          if (r.resolvedBy != null && r.resolvedBy!.isNotEmpty) _detailRow(theme, l10n.adminVacationsResolvedBy, r.resolvedBy!),
          if (r.resolutionNote != null && r.resolutionNote!.isNotEmpty)
            _detailRow(theme, l10n.adminVacationsNote, r.resolutionNote!),
          if (r.isPending) ...[
            const SizedBox(height: 16),
            TextField(
              controller: _note,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: l10n.adminVacationsNoteLabel,
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _saving ? null : () => _resolve(false),
                    icon: const Icon(Icons.close),
                    label: Text(l10n.adminVacationsReject),
                    style: OutlinedButton.styleFrom(foregroundColor: theme.colorScheme.error),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _saving ? null : () => _resolve(true),
                    icon: _saving
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.check),
                    label: Text(l10n.adminVacationsApprove),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _detailRow(ThemeData theme, String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 130,
              child: Text(label, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            ),
            Expanded(child: Text(value, style: theme.textTheme.bodyMedium)),
          ],
        ),
      );
}

/// Estilo (etiqueta, color) por estado — mismo criterio que la pantalla del colaborador.
(String, Color) statusStyle(String status, ThemeData theme, AppLocalizations l10n) {
  switch (status) {
    case 'APPROVED':
      return (l10n.vacationStatusApproved, Colors.green.shade600);
    case 'REJECTED':
      return (l10n.vacationStatusRejected, theme.colorScheme.error);
    case 'CANCELLED':
      return (l10n.vacationStatusCancelled, theme.colorScheme.onSurfaceVariant);
    default:
      return (l10n.vacationStatusPending, Colors.orange.shade700);
  }
}
