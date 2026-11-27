import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/l10n.dart';
import '../../../core/ui/nx_ui.dart';
import '../data/vacation_repository.dart';
import '../domain/vacation_models.dart';

/// Mis vacaciones (P08): saldo según la antigüedad, mis solicitudes y la acción fija "Nueva
/// solicitud", que abre la hoja de P09.
class VacationsScreen extends ConsumerWidget {
  const VacationsScreen({super.key});

  void _reload(WidgetRef ref) {
    ref.invalidate(vacationSummaryProvider);
    ref.invalidate(myVacationsProvider);
  }

  Future<void> _openRequest(BuildContext context, WidgetRef ref) async {
    final sent = await showNxHoja<bool>(context, (_) => const VacationRequestSheet());
    if (sent == true && context.mounted) {
      _reload(ref);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.vacationsRequestSent)));
    }
  }

  Future<void> _openCancel(BuildContext context, WidgetRef ref, MyVacationRequest request) async {
    final sent = await showNxHoja<bool>(context, (_) => VacationCancelSheet(request: request));
    if (sent == true && context.mounted) {
      _reload(ref);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.vacationsCancelSent)));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(vacationSummaryProvider);
    final requests = ref.watch(myVacationsProvider);
    final l10n = context.l10n;
    final failed = (summary.hasError || requests.hasError) && !summary.isLoading && !requests.isLoading;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.homeVacationsTitle)),
      body: NxConCarga(
        loading: summary.isLoading || requests.isLoading,
        label: l10n.commonLoading,
        child: RefreshIndicator(
          onRefresh: () async => _reload(ref),
          child: NxContenido(
            children: [
              if (failed)
                NxEstadoVacio.error(
                  title: l10n.commonLoadError,
                  description: l10n.commonLoadErrorHint,
                  retryLabel: l10n.commonRetry,
                  onRetry: () => _reload(ref),
                )
              else ...[
                if (summary.hasValue) _SummaryCard(summary: summary.value!),
                if (requests.hasValue) ...[
                  Semantics(
                    header: true,
                    child: Text(l10n.vacationsMyRequests, style: Theme.of(context).textTheme.titleSmall),
                  ),
                  if (requests.value!.isEmpty)
                    NxEstadoVacio(icon: Icons.beach_access_outlined, title: l10n.vacationsEmpty)
                  else
                    NxLista(children: [
                      for (final r in requests.value!)
                        _RequestTile(
                          request: r,
                          onTap: r.canRequestCancellation ? () => _openCancel(context, ref, r) : null,
                        ),
                    ]),
                ],
              ],
            ],
          ),
        ),
      ),
      bottomNavigationBar: NxAccionFija(
        child: NxBoton(
          label: l10n.vacationsRequestAction,
          icon: Icons.add,
          block: true,
          onPressed: () => _openRequest(context, ref),
        ),
      ),
    );
  }
}

/// Tarjeta de saldo (R1): antigüedad, derecho anual y las tres cifras.
class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.summary});
  final VacationSummary summary;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    final text = Theme.of(context).textTheme;
    final l10n = context.l10n;
    return NxContenedor(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.wb_sunny_outlined, size: NxTokens.iconSizeLg, color: c.actionPrimary),
              const SizedBox(width: NxTokens.spaceGapInline),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(l10n.vacationsYearsOfService(summary.yearsOfService), style: text.titleSmall),
                ),
              ),
            ],
          ),
          const SizedBox(height: NxTokens.space2),
          Text(l10n.vacationsEntitled(summary.entitledDays), style: text.bodyMedium?.copyWith(color: c.textSecondary)),
          const SizedBox(height: NxTokens.space4),
          Row(
            children: [
              _Stat(value: summary.availableDays, label: l10n.vacationsAvailable, color: c.actionPrimary),
              _Stat(value: summary.takenDays, label: l10n.vacationsTaken, color: c.textSecondary),
              _Stat(value: summary.pendingDays, label: l10n.vacationsPending, color: c.statusWarningFg),
            ],
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label, required this.color});
  final int value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    return Expanded(
      child: MergeSemantics(
        child: Column(
          children: [
            Text(
              '$value',
              style: NxTokens.textHeading1.copyWith(
                color: color,
                fontFeatures: const [NxTokens.fontFeatureTabular],
              ),
            ),
            Text(label, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: c.textSecondary)),
          ],
        ),
      ),
    );
  }
}

/// Fila de una solicitud (R2): periodo, días, chip de estado y, si aplica, el estado de la
/// cancelación pedida. Tocable solo si aún se puede pedir cancelarla.
class _RequestTile extends StatelessWidget {
  const _RequestTile({required this.request, this.onTap});
  final MyVacationRequest request;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final r = request;
    final denialNote = r.cancelResolutionNote?.trim();
    return NxListaFila(
      title: Text(
        '${fullIsoDate(context, r.startDate)} – ${fullIsoDate(context, r.endDate)}',
        style: const TextStyle(fontFeatures: [NxTokens.fontFeatureTabular]),
      ),
      subtitle: [
        Text(l10n.vacationsDays(r.days)),
        if (r.cancellationPending) Text(l10n.vacationsCancelPending),
        if (r.cancelRequestStatus == 'DENIED')
          Text(denialNote == null || denialNote.isEmpty ? l10n.vacationsCancelDenied : l10n.vacationsCancelDeniedNote(denialNote)),
        if (r.status == 'REJECTED' && (r.resolutionNote ?? '').trim().isNotEmpty) Text(r.resolutionNote!.trim()),
        if (onTap != null) Text(l10n.vacationsCancelHint),
      ],
      trailing: NxChip(label: vacationStatusLabel(l10n, r.status), tone: vacationStatusTone(r.status)),
      onTap: onTap,
    );
  }
}

/// Solicitud de cancelación de unas vacaciones propias, en hoja inferior: motivo obligatorio
/// (reagendar, ya no viaja…). Devuelve `true` por [Navigator.pop] si se envió.
class VacationCancelSheet extends ConsumerStatefulWidget {
  const VacationCancelSheet({super.key, required this.request});
  final MyVacationRequest request;

  static const reasonMaxLength = 500;

  @override
  ConsumerState<VacationCancelSheet> createState() => _VacationCancelSheetState();
}

class _VacationCancelSheetState extends ConsumerState<VacationCancelSheet> {
  final _reason = TextEditingController();
  bool _saving = false;
  bool _attempted = false;
  String? _serverError;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  bool get _missingReason => _reason.text.trim().isEmpty;

  Future<void> _submit() async {
    if (_saving) return;
    setState(() => _attempted = true);
    if (_missingReason) return;
    setState(() {
      _saving = true;
      _serverError = null;
    });
    try {
      await ref.read(vacationRepositoryProvider).requestCancellation(widget.request.id, reason: _reason.text.trim());
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      final l10n = context.l10n;
      setState(() {
        _saving = false;
        // 409: ya se resolvió, ya empezó o ya hay una cancelación en revisión.
        _serverError = e is DioException && e.response?.statusCode == 409 ? l10n.vacationsCancelConflict : l10n.vacationsCancelError;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final r = widget.request;
    return NxHoja(
      title: l10n.vacationsCancelTitle,
      closeLabel: l10n.commonClose,
      body: [
        if (_serverError != null) NxAviso(key: ValueKey(_serverError), tone: NxTone.error, message: _serverError!),
        NxDatoBloque(
          label: l10n.adminVacationsPeriod,
          value: '${fullIsoDate(context, r.startDate)} – ${fullIsoDate(context, r.endDate)}',
        ),
        NxDatoBloque(
          label: l10n.adminVacationsStatus,
          child: Align(
            alignment: Alignment.centerLeft,
            child: NxChip(label: vacationStatusLabel(l10n, r.status), tone: vacationStatusTone(r.status)),
          ),
        ),
        Text(l10n.vacationsCancelExplain, style: Theme.of(context).textTheme.bodyMedium),
        NxCampo(
          label: l10n.vacationsCancelReasonLabel,
          hint: l10n.vacationsCancelReasonHint,
          required: true,
          controller: _reason,
          errorText: _attempted && _missingReason ? l10n.vacationsCancelReasonRequired : null,
          onChanged: (_) {
            if (_attempted) setState(() {});
          },
          maxLength: VacationCancelSheet.reasonMaxLength,
          minLines: 3,
          maxLines: 6,
          keyboardType: TextInputType.multiline,
          textCapitalization: TextCapitalization.sentences,
        ),
      ],
      footer: NxBoton(
        label: l10n.vacationsCancelSubmit,
        busy: _saving,
        block: true,
        onPressed: _submit,
      ),
    );
  }
}

/// Etiqueta de `vacation_requests.status` en el idioma activo.
String vacationStatusLabel(AppLocalizations l10n, String status) => switch (status) {
      'APPROVED' => l10n.vacationStatusApproved,
      'REJECTED' => l10n.vacationStatusRejected,
      'CANCELLED' => l10n.vacationStatusCancelled,
      _ => l10n.vacationStatusPending,
    };

/// Nueva solicitud (P09), en hoja inferior: fechas, motivo opcional y envío. Devuelve `true` por
/// [Navigator.pop] si se registró.
class VacationRequestSheet extends ConsumerStatefulWidget {
  const VacationRequestSheet({super.key});

  /// Largo máximo del motivo (`vacation_requests.reason`, E1/10).
  static const reasonMaxLength = 500;

  @override
  ConsumerState<VacationRequestSheet> createState() => _VacationRequestSheetState();
}

class _VacationRequestSheetState extends ConsumerState<VacationRequestSheet> {
  DateTime? _start;
  DateTime? _end;
  final _reason = TextEditingController();
  bool _saving = false;
  bool _attempted = false;
  String? _serverError;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  /// Fin ≥ inicio (RN-H1): se valida al elegir cualquiera de las dos y al enviar.
  bool get _invalidPeriod => _start != null && _end != null && _end!.isBefore(_start!);

  Future<void> _pick(bool isStart) async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: (isStart ? _start : _end) ?? _start ?? today,
      firstDate: today,
      lastDate: DateTime(now.year + 2, 12, 31),
    );
    if (picked != null) {
      setState(() {
        if (isStart) {
          _start = picked;
        } else {
          _end = picked;
        }
        _serverError = null;
      });
    }
  }

  String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _submit() async {
    if (_saving) return;
    setState(() => _attempted = true);
    if (_start == null || _end == null || _invalidPeriod) return;
    setState(() {
      _saving = true;
      _serverError = null;
    });
    try {
      await ref.read(vacationRepositoryProvider).request(
            startDate: _iso(_start!),
            endDate: _iso(_end!),
            reason: _reason.text.trim(),
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      final l10n = context.l10n;
      setState(() {
        _saving = false;
        // 409: traslape con otra solicitud (RN-H2). Lo escrito se conserva.
        _serverError = e is DioException && e.response?.statusCode == 409
            ? l10n.vacationsOverlap
            : l10n.vacationsRequestError;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final error = _invalidPeriod ? l10n.vacationsEndBeforeStart : _serverError;
    return NxHoja(
      title: l10n.vacationsRequestTitle,
      closeLabel: l10n.commonClose,
      body: [
        if (error != null) NxAviso(key: ValueKey(error), tone: NxTone.error, message: error),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: NxCampoFecha(
                label: l10n.vacationsFrom,
                required: true,
                text: _start == null ? null : fullDate(context, _start!),
                placeholder: l10n.vacationsChooseDate,
                errorText: _attempted && _start == null ? l10n.commonRequired : null,
                onTap: () => _pick(true),
              ),
            ),
            const SizedBox(width: NxTokens.spaceGapRelated),
            Expanded(
              child: NxCampoFecha(
                label: l10n.vacationsTo,
                required: true,
                text: _end == null ? null : fullDate(context, _end!),
                placeholder: l10n.vacationsChooseDate,
                errorText: _attempted && _end == null ? l10n.commonRequired : null,
                onTap: () => _pick(false),
              ),
            ),
          ],
        ),
        NxCampo(
          label: l10n.vacationsReasonOptional,
          hint: l10n.vacationsReasonHint,
          controller: _reason,
          maxLength: VacationRequestSheet.reasonMaxLength,
          minLines: 3,
          maxLines: 6,
          keyboardType: TextInputType.multiline,
          textCapitalization: TextCapitalization.sentences,
        ),
      ],
      footer: NxBoton(
        label: l10n.vacationsSubmit,
        busy: _saving,
        block: true,
        onPressed: _submit,
      ),
    );
  }
}
