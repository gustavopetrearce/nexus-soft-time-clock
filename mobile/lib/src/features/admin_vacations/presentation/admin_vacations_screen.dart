import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/l10n.dart';
import '../../../core/ui/nx_ui.dart';
import '../../vacations/presentation/vacations_screen.dart' show vacationStatusLabel;
import '../application/admin_vacations_controller.dart';
import '../domain/admin_vacation_models.dart';

/// Aprobar vacaciones (P10, `vacation:approve`): solicitudes PENDING del equipo y, en otra
/// pestaña, las cancelaciones que pidieron los colaboradores; de la más reciente a la más antigua.
/// Tocar una fila abre su hoja con el detalle y la decisión; la lista no tiene botones de decisión.
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
              SegmentedButton<AdminVacationsTab>(
                segments: [
                  ButtonSegment(value: AdminVacationsTab.pending, label: Text(l10n.adminVacationsTabPending)),
                  ButtonSegment(value: AdminVacationsTab.cancellations, label: Text(l10n.adminVacationsTabCancellations)),
                ],
                selected: {state.tab},
                showSelectedIcon: false,
                onSelectionChanged: (s) => controller.selectTab(s.first),
              ),
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
        if (request.cancellationPending) Text(l10n.adminVacationsCancelRequested, maxLines: 1),
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
  final outcome = await showNxHoja<_Decision>(
    context,
    (_) => _ResolveSheet(request: request, controller: controller),
  );
  if (outcome != null && context.mounted) {
    final l10n = context.l10n;
    final message = switch (outcome) {
      _Decision.approve => l10n.adminVacationsApproved,
      _Decision.reject => l10n.adminVacationsRejected,
      _Decision.acceptCancel => l10n.adminVacationsCancelAccepted,
      _Decision.denyCancel => l10n.adminVacationsCancelDenied,
    };
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}

/// Decisión tomada en la hoja.
enum _Decision { approve, reject, acceptCancel, denyCancel }

/// Hoja de detalle y resolución (R2–R4). Devuelve por [Navigator.pop] la [_Decision] tomada. Con
/// una cancelación pedida suma «Aceptar cancelación» (y, si ya estaba aprobada, «Denegar»).
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

  /// Decisión en curso; su botón muestra la carga.
  _Decision? _saving;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _resolve(_Decision decision) async {
    if (_saving != null) return;
    setState(() {
      _saving = decision;
      _error = null;
    });
    final note = _note.text.trim();
    final c = widget.controller;
    final outcome = switch (decision) {
      _Decision.approve => await c.resolve(widget.request, approve: true, note: note),
      _Decision.reject => await c.resolve(widget.request, approve: false, note: note),
      _Decision.acceptCancel => await c.resolveCancellation(widget.request, accept: true, note: note),
      _Decision.denyCancel => await c.resolveCancellation(widget.request, accept: false, note: note),
    };
    if (!mounted) return;
    final l10n = context.l10n;
    switch (outcome) {
      case ResolveOutcome.resolved:
        Navigator.of(context).pop(decision);
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
        if (r.cancellationPending)
          NxDatoBloque(label: l10n.adminVacationsCancelReason, value: r.cancelRequestReason),
        if (r.isPending || r.cancellationPending)
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
      footer: r.isPending || r.cancellationPending
          ? Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (r.cancellationPending) ...[
                  Row(
                    children: [
                      // Sobre una pendiente, "denegar" es aprobar o rechazar.
                      if (!r.isPending) ...[
                        Expanded(
                          child: NxBoton(
                            label: l10n.adminVacationsCancelDeny,
                            variant: NxBotonVariant.secondary,
                            busy: _saving == _Decision.denyCancel,
                            block: true,
                            onPressed: () => _resolve(_Decision.denyCancel),
                          ),
                        ),
                        const SizedBox(width: NxTokens.spaceGapInline),
                      ],
                      Expanded(
                        child: NxBoton(
                          label: l10n.adminVacationsCancelAccept,
                          icon: Icons.event_busy_outlined,
                          variant: NxBotonVariant.secondary,
                          busy: _saving == _Decision.acceptCancel,
                          block: true,
                          onPressed: () => _resolve(_Decision.acceptCancel),
                        ),
                      ),
                    ],
                  ),
                  if (r.isPending) const SizedBox(height: NxTokens.spaceGapInline),
                ],
                if (r.isPending)
                  Row(
                    children: [
                      Expanded(
                        child: NxBoton(
                          label: l10n.adminVacationsReject,
                          icon: Icons.close,
                          variant: NxBotonVariant.secondary,
                          busy: _saving == _Decision.reject,
                          block: true,
                          onPressed: () => _resolve(_Decision.reject),
                        ),
                      ),
                      const SizedBox(width: NxTokens.spaceGapInline),
                      Expanded(
                        child: NxBoton(
                          label: l10n.adminVacationsApprove,
                          icon: Icons.check,
                          busy: _saving == _Decision.approve,
                          block: true,
                          onPressed: () => _resolve(_Decision.approve),
                        ),
                      ),
                    ],
                  ),
              ],
            )
          : null,
    );
  }
}
