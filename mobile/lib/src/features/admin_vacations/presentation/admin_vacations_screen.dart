import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/l10n.dart';
import '../../../core/ui/nx_ui.dart';
import '../../vacations/presentation/vacations_screen.dart' show vacationStatusLabel;
import '../application/admin_vacations_controller.dart';
import '../domain/admin_vacation_models.dart';

/// Aprobar vacaciones (P10, `vacation:approve`): solicitudes PENDING del equipo, de la más
/// reciente a la más antigua. Tocar una fila abre su hoja con el detalle y la decisión; la lista
/// no tiene botones de decisión.
class AdminVacationsScreen extends ConsumerWidget {
  const AdminVacationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(adminVacationsControllerProvider);
    final controller = ref.read(adminVacationsControllerProvider.notifier);
    final l10n = context.l10n;
    final failed = state.error == AdminVacationsError.load && state.items.isEmpty && !state.loading;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.homeApproveVacationsTitle)),
      body: NxConCarga(
        loading: state.loading,
        label: l10n.commonLoading,
        child: RefreshIndicator(
          onRefresh: controller.load,
          child: NxContenido(
            children: [
              if (failed)
                NxEstadoVacio.error(
                  title: l10n.commonLoadError,
                  description: l10n.commonLoadErrorHint,
                  retryLabel: l10n.commonRetry,
                  onRetry: controller.load,
                )
              else if (state.items.isEmpty && !state.loading)
                NxEstadoVacio(icon: Icons.beach_access_outlined, title: l10n.adminVacationsEmpty)
              else if (state.items.isNotEmpty) ...[
                NxLista(
                  children: [
                    for (final r in state.items)
                      _RequestTile(request: r, onTap: () => _openDetail(context, r, controller)),
                  ],
                ),
                if (state.error == AdminVacationsError.loadMore)
                  NxAviso(tone: NxTone.error, message: l10n.adminVacationsLoadMoreError),
                if (state.hasMore)
                  Center(
                    child: NxBoton(
                      label: l10n.adminVacationsLoadMore,
                      variant: NxBotonVariant.secondary,
                      busy: state.loadingMore,
                      onPressed: controller.loadMore,
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Fila (R1): nombre, periodo y días, motivo en una línea, chip y chevron.
class _RequestTile extends StatelessWidget {
  const _RequestTile({required this.request, required this.onTap});

  final AdminVacationRequest request;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final reason = request.reason?.trim();
    return NxListaFila(
      title: Text(request.displayName, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: [
        Text(
          '${fullIsoDate(context, request.startDate)} – ${fullIsoDate(context, request.endDate)} · '
          '${l10n.vacationsDays(request.days)}',
          style: const TextStyle(fontFeatures: [NxTokens.fontFeatureTabular]),
        ),
        if (reason != null && reason.isNotEmpty) Text(reason, maxLines: 1, overflow: TextOverflow.ellipsis),
      ],
      trailing: NxChip(label: vacationStatusLabel(l10n, request.status), tone: vacationStatusTone(request.status)),
      onTap: onTap,
    );
  }
}

/// Abre la hoja de detalle; al cerrarla, Flutter devuelve el foco a la fila que la abrió.
Future<void> _openDetail(
  BuildContext context,
  AdminVacationRequest request,
  AdminVacationsController controller,
) async {
  final outcome = await showNxHoja<bool>(
    context,
    (_) => _ResolveSheet(request: request, controller: controller),
  );
  if (outcome != null && context.mounted) {
    final l10n = context.l10n;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(outcome ? l10n.adminVacationsApproved : l10n.adminVacationsRejected)),
    );
  }
}

/// Hoja de detalle y resolución (R2–R4). Devuelve por [Navigator.pop] `true` si se aprobó y
/// `false` si se rechazó.
class _ResolveSheet extends StatefulWidget {
  const _ResolveSheet({required this.request, required this.controller});

  final AdminVacationRequest request;
  final AdminVacationsController controller;

  /// Largo máximo de la nota (`vacation_requests.resolution_note`).
  static const noteMaxLength = 1000;

  @override
  State<_ResolveSheet> createState() => _ResolveSheetState();
}

class _ResolveSheetState extends State<_ResolveSheet> {
  final _note = TextEditingController();

  /// Decisión en curso (true = aprobar); su botón muestra la carga.
  bool? _saving;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _resolve(bool approve) async {
    if (_saving != null) return;
    setState(() {
      _saving = approve;
      _error = null;
    });
    final outcome = await widget.controller.resolve(
      widget.request,
      approve: approve,
      note: _note.text.trim(),
    );
    if (!mounted) return;
    final l10n = context.l10n;
    switch (outcome) {
      case ResolveOutcome.resolved:
        Navigator.of(context).pop(approve);
      case ResolveOutcome.alreadyResolved:
        setState(() {
          _saving = null;
          _error = l10n.adminVacationsAlreadyResolved;
        });
      case ResolveOutcome.failed:
        setState(() {
          _saving = null;
          _error = l10n.adminVacationsResolveError;
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.request;
    final l10n = context.l10n;
    final c = NxColors.of(context);
    final code = r.employeeCode;
    return NxHoja(
      title: r.displayName,
      closeLabel: l10n.commonClose,
      subtitle: code == null || code.isEmpty
          ? null
          : Text(code, style: NxTokens.textCode.copyWith(color: c.textSecondary)),
      body: [
        if (_error != null) NxAviso(key: ValueKey(_error), tone: NxTone.error, message: _error!),
        NxDatoBloque(
          label: l10n.adminVacationsPeriod,
          value: '${fullIsoDate(context, r.startDate)} – ${fullIsoDate(context, r.endDate)}',
        ),
        NxDatoBloque(label: l10n.adminVacationsRequestedDays, value: '${r.days}'),
        NxDatoBloque(label: l10n.adminVacationsReason, value: r.reason),
        NxDatoBloque(
          label: l10n.adminVacationsStatus,
          child: Align(
            alignment: Alignment.centerLeft,
            child: NxChip(label: vacationStatusLabel(l10n, r.status), tone: vacationStatusTone(r.status)),
          ),
        ),
        if (r.isPending)
          NxCampo(
            label: l10n.adminVacationsNoteLabel,
            hint: l10n.adminVacationsNoteHint,
            controller: _note,
            maxLength: _ResolveSheet.noteMaxLength,
            minLines: 3,
            maxLines: 6,
            keyboardType: TextInputType.multiline,
            textCapitalization: TextCapitalization.sentences,
          ),
      ],
      footer: r.isPending
          ? Row(
              children: [
                Expanded(
                  child: NxBoton(
                    label: l10n.adminVacationsReject,
                    icon: Icons.close,
                    variant: NxBotonVariant.secondary,
                    busy: _saving == false,
                    block: true,
                    onPressed: () => _resolve(false),
                  ),
                ),
                const SizedBox(width: NxTokens.spaceGapInline),
                Expanded(
                  child: NxBoton(
                    label: l10n.adminVacationsApprove,
                    icon: Icons.check,
                    busy: _saving == true,
                    block: true,
                    onPressed: () => _resolve(true),
                  ),
                ),
              ],
            )
          : null,
    );
  }
}
