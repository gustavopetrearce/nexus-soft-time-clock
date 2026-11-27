import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/l10n.dart';
import '../../../core/ui/nx_ui.dart';
import '../data/permit_repository.dart';
import '../domain/permit_models.dart';

/// Mis permisos: entradas tarde, salidas temprano y faltas que me registró mi supervisor, RR. HH.
/// o el administrador, con su goce de sueldo y estatus. La acción fija "Solicitar incapacidad"
/// abre una hoja con fechas y observaciones obligatorias; la solicitud queda pendiente hasta que
/// el personal la aprueba o rechaza.
class PermitsScreen extends ConsumerWidget {
  const PermitsScreen({super.key});

  Future<void> _openRequest(BuildContext context, WidgetRef ref) async {
    final sent = await showNxHoja<bool>(context, (_) => const IncapacityRequestSheet());
    if (sent == true && context.mounted) {
      ref.invalidate(myPermitsProvider);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.incapacityRequestSent)));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final permits = ref.watch(myPermitsProvider);
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.homePermitsTitle)),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(myPermitsProvider),
        child: ListView(
          padding: const EdgeInsets.all(NxTokens.spaceInsetPage),
          children: [
            permits.when(
              loading: () => const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator())),
              error: (e, _) => NxEstadoVacio.error(
                title: l10n.commonLoadError,
                description: l10n.commonLoadErrorHint,
                retryLabel: l10n.commonRetry,
                onRetry: () => ref.invalidate(myPermitsProvider),
              ),
              data: (list) => list.isEmpty
                  ? NxEstadoVacio(icon: Icons.event_busy_outlined, title: l10n.permitsEmpty, description: l10n.permitsEmptyHint)
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [for (final p in list) PermitTile(permit: p)],
                    ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: NxAccionFija(
        child: NxBoton(
          label: l10n.incapacityRequestAction,
          icon: Icons.personal_injury_outlined,
          block: true,
          onPressed: () => _openRequest(context, ref),
        ),
      ),
    );
  }
}

/// Tarjeta de un permiso: tipo y motivo, periodo u hora autorizada, estatus, goce y observaciones.
class PermitTile extends StatelessWidget {
  const PermitTile({super.key, required this.permit});
  final MyPermit permit;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = NxColors.of(context);
    final text = Theme.of(context).textTheme;
    final p = permit;
    final inactive = p.status == 'CANCELLED' || p.status == 'REJECTED';
    final when = p.isAbsence
        ? (p.startDate == p.endDate
            ? shortIsoDate(context, p.startDate)
            : '${shortIsoDate(context, p.startDate)} – ${shortIsoDate(context, p.endDate)}')
        : '${shortIsoDate(context, p.startDate)} · ${p.shortTime ?? ''}';
    final secondary = text.bodySmall?.copyWith(color: c.textSecondary);
    return Card(
      margin: const EdgeInsets.only(bottom: NxTokens.spaceGapRelated),
      child: Padding(
        padding: const EdgeInsets.all(NxTokens.spaceInsetCard),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(_icon(p.type), color: inactive ? c.textSecondary : c.actionPrimary),
                const SizedBox(width: NxTokens.space2),
                Expanded(
                  child: Text(
                    '${_typeLabel(l10n, p.type)} · ${_reasonLabel(l10n, p.reason)}',
                    style: text.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      decoration: inactive ? TextDecoration.lineThrough : null,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: NxTokens.space1),
            Text(
              p.isAbsence ? '$when · ${l10n.vacationsDays(p.days)}' : when,
              style: text.bodyMedium?.copyWith(color: c.textSecondary, fontFeatures: const [NxTokens.fontFeatureTabular]),
            ),
            const SizedBox(height: NxTokens.space2),
            Wrap(
              spacing: NxTokens.space2,
              runSpacing: NxTokens.space1,
              children: [
                NxChip(label: permitStatusLabel(l10n, p.status), tone: permitStatusTone(p.status)),
                // Una solicitud pendiente o rechazada aún no tiene goce que mostrar.
                if (p.status == 'APPROVED' || p.status == 'CANCELLED') NxChip(label: _payLabel(l10n, p.payStatus), tone: _payTone(p.payStatus)),
              ],
            ),
            if (p.notes != null && p.notes!.isNotEmpty) ...[
              const SizedBox(height: NxTokens.space2),
              Text(l10n.permitsNotes(p.notes!), style: text.bodySmall),
            ],
            if (p.resolutionNote != null && p.resolutionNote!.isNotEmpty) ...[
              const SizedBox(height: NxTokens.space1),
              Text(l10n.permitsResolutionNote(p.resolutionNote!), style: secondary),
            ],
            if (p.status == 'CANCELLED' && p.cancelNote != null && p.cancelNote!.isNotEmpty) ...[
              const SizedBox(height: NxTokens.space1),
              Text(l10n.permitsResolutionNote(p.cancelNote!), style: secondary),
            ],
            if (p.status == 'REJECTED' && p.resolvedByName != null) ...[
              const SizedBox(height: NxTokens.space1),
              Text(l10n.permitsRejectedBy(p.resolvedByName!), style: secondary),
            ] else if (p.grantedByName != null) ...[
              const SizedBox(height: NxTokens.space1),
              Text(l10n.permitsGrantedBy(p.grantedByName!), style: secondary),
            ],
          ],
        ),
      ),
    );
  }

  static IconData _icon(String type) => switch (type) {
        'LATE_ARRIVAL' => Icons.login,
        'EARLY_DEPARTURE' => Icons.logout,
        _ => Icons.event_busy_outlined,
      };

  static String _typeLabel(AppLocalizations l10n, String type) => switch (type) {
        'LATE_ARRIVAL' => l10n.permitTypeLateArrival,
        'EARLY_DEPARTURE' => l10n.permitTypeEarlyDeparture,
        _ => l10n.permitTypeAbsence,
      };

  static String _reasonLabel(AppLocalizations l10n, String reason) => switch (reason) {
        'PERSONAL' => l10n.permitReasonPersonal,
        'INCAPACIDAD' => l10n.permitReasonIncapacidad,
        'MEDICO' => l10n.permitReasonMedico,
        'FAMILIAR' => l10n.permitReasonFamiliar,
        'TRAMITE' => l10n.permitReasonTramite,
        _ => l10n.permitReasonOtro,
      };

  static String _payLabel(AppLocalizations l10n, String pay) => switch (pay) {
        'WITH_PAY' => l10n.permitPayWith,
        'WITHOUT_PAY' => l10n.permitPayWithout,
        _ => l10n.permitPayPending,
      };

  static NxTone _payTone(String pay) => switch (pay) {
        'WITH_PAY' => NxTone.success,
        'WITHOUT_PAY' => NxTone.neutral,
        _ => NxTone.warning,
      };
}

/// Etiqueta de `permits.status` en el idioma activo.
String permitStatusLabel(AppLocalizations l10n, String status) => switch (status) {
      'PENDING' => l10n.permitStatusPending,
      'REJECTED' => l10n.permitStatusRejected,
      'CANCELLED' => l10n.permitStatusCancelled,
      _ => l10n.permitStatusApproved,
    };

NxTone permitStatusTone(String status) => switch (status) {
      'PENDING' => NxTone.warning,
      'REJECTED' => NxTone.error,
      'CANCELLED' => NxTone.neutral,
      _ => NxTone.success,
    };

/// Solicitud de incapacidad, en hoja inferior: fechas y observaciones obligatorias (el motivo
/// exacto). Devuelve `true` por [Navigator.pop] si se registró.
class IncapacityRequestSheet extends ConsumerStatefulWidget {
  const IncapacityRequestSheet({super.key});

  /// Largo máximo de `permits.notes`.
  static const notesMaxLength = 500;

  /// Una incapacidad suele avisarse después de empezar: se admiten fechas pasadas hasta este límite.
  static const maxDaysBack = 60;

  @override
  ConsumerState<IncapacityRequestSheet> createState() => _IncapacityRequestSheetState();
}

class _IncapacityRequestSheetState extends ConsumerState<IncapacityRequestSheet> {
  DateTime? _start;
  DateTime? _end;
  final _notes = TextEditingController();
  bool _saving = false;
  bool _attempted = false;
  String? _serverError;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  bool get _invalidPeriod => _start != null && _end != null && _end!.isBefore(_start!);
  bool get _missingNotes => _notes.text.trim().isEmpty;

  Future<void> _pick(bool isStart) async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: (isStart ? _start : _end) ?? _start ?? today,
      firstDate: today.subtract(const Duration(days: IncapacityRequestSheet.maxDaysBack)),
      lastDate: DateTime(now.year + 1, 12, 31),
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
    if (_start == null || _end == null || _invalidPeriod || _missingNotes) return;
    setState(() {
      _saving = true;
      _serverError = null;
    });
    try {
      await ref.read(permitRepositoryProvider).requestIncapacity(
            startDate: _iso(_start!),
            endDate: _iso(_end!),
            notes: _notes.text.trim(),
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      final l10n = context.l10n;
      setState(() {
        _saving = false;
        // 409: se traslapa con otra falta o solicitud. Lo escrito se conserva.
        _serverError = e is DioException && e.response?.statusCode == 409
            ? l10n.incapacityOverlap
            : l10n.incapacityRequestError;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final error = _invalidPeriod ? l10n.vacationsEndBeforeStart : _serverError;
    return NxHoja(
      title: l10n.incapacityRequestTitle,
      closeLabel: l10n.commonClose,
      body: [
        if (error != null) NxAviso(key: ValueKey(error), tone: NxTone.error, message: error),
        Text(l10n.incapacityRequestHint, style: Theme.of(context).textTheme.bodyMedium),
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
          label: l10n.incapacityNotesLabel,
          hint: l10n.incapacityNotesHint,
          required: true,
          controller: _notes,
          errorText: _attempted && _missingNotes ? l10n.incapacityNotesRequired : null,
          onChanged: (_) {
            if (_attempted) setState(() {});
          },
          maxLength: IncapacityRequestSheet.notesMaxLength,
          minLines: 3,
          maxLines: 6,
          keyboardType: TextInputType.multiline,
          textCapitalization: TextCapitalization.sentences,
        ),
      ],
      footer: NxBoton(
        label: l10n.incapacitySubmit,
        busy: _saving,
        block: true,
        onPressed: _submit,
      ),
    );
  }
}
