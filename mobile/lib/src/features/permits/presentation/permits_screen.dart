import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/l10n.dart';
import '../../../core/ui/nx_ui.dart';
import '../data/permit_repository.dart';
import '../domain/permit_models.dart';

/// Mis permisos (solo lectura): entradas tarde, salidas temprano y faltas que me registró mi
/// supervisor, RR. HH. o el administrador, con su goce de sueldo y estatus.
class PermitsScreen extends ConsumerWidget {
  const PermitsScreen({super.key});

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
    );
  }
}

/// Tarjeta de un permiso: tipo y motivo, periodo u hora autorizada, goce y estatus.
class PermitTile extends StatelessWidget {
  const PermitTile({super.key, required this.permit});
  final MyPermit permit;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = NxColors.of(context);
    final text = Theme.of(context).textTheme;
    final p = permit;
    final cancelled = p.status == 'CANCELLED';
    final when = p.isAbsence
        ? (p.startDate == p.endDate
            ? shortIsoDate(context, p.startDate)
            : '${shortIsoDate(context, p.startDate)} – ${shortIsoDate(context, p.endDate)}')
        : '${shortIsoDate(context, p.startDate)} · ${p.shortTime ?? ''}';
    return Card(
      margin: const EdgeInsets.only(bottom: NxTokens.spaceGapRelated),
      child: Padding(
        padding: const EdgeInsets.all(NxTokens.spaceInsetCard),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(_icon(p.type), color: cancelled ? c.textSecondary : c.actionPrimary),
                const SizedBox(width: NxTokens.space2),
                Expanded(
                  child: Text(
                    '${_typeLabel(l10n, p.type)} · ${_reasonLabel(l10n, p.reason)}',
                    style: text.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      decoration: cancelled ? TextDecoration.lineThrough : null,
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
                if (cancelled)
                  NxChip(label: l10n.permitStatusCancelled, tone: NxTone.neutral)
                else
                  NxChip(label: l10n.permitStatusApproved, tone: NxTone.success),
                NxChip(label: _payLabel(l10n, p.payStatus), tone: _payTone(p.payStatus)),
              ],
            ),
            if (p.grantedByName != null) ...[
              const SizedBox(height: NxTokens.space2),
              Text(l10n.permitsGrantedBy(p.grantedByName!), style: text.bodySmall?.copyWith(color: c.textSecondary)),
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
