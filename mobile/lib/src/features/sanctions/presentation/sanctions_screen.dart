import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/l10n.dart';
import '../../../core/ui/nx_ui.dart';
import '../data/sanction_repository.dart';
import '../domain/sanction_models.dart';

/// Mis sanciones (solo lectura): amonestaciones, actas y suspensiones que me abrió RR. HH., mi
/// supervisor o el administrador, con la descripción de los hechos y si siguen vigentes.
class SanctionsScreen extends ConsumerWidget {
  const SanctionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sanctions = ref.watch(mySanctionsProvider);
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.homeSanctionsTitle)),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(mySanctionsProvider),
        child: ListView(
          padding: const EdgeInsets.all(NxTokens.spaceInsetPage),
          children: [
            sanctions.when(
              loading: () => const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator())),
              error: (e, _) => NxEstadoVacio.error(
                title: l10n.commonLoadError,
                description: l10n.commonLoadErrorHint,
                retryLabel: l10n.commonRetry,
                onRetry: () => ref.invalidate(mySanctionsProvider),
              ),
              data: (list) => list.isEmpty
                  ? NxEstadoVacio(icon: Icons.verified_outlined, title: l10n.sanctionsEmpty)
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [for (final s in list) SanctionTile(sanction: s)],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Tarjeta de una sanción: tipo y motivo, fecha (y periodo si es suspensión), estado y hechos.
class SanctionTile extends StatelessWidget {
  const SanctionTile({super.key, required this.sanction});
  final MySanction sanction;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = NxColors.of(context);
    final text = Theme.of(context).textTheme;
    final s = sanction;
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
                Icon(Icons.gavel_outlined, color: s.isVoided ? c.textSecondary : c.actionPrimary),
                const SizedBox(width: NxTokens.space2),
                Expanded(
                  child: Text(
                    '${sanctionTypeLabel(l10n, s.type)} · ${sanctionReasonLabel(l10n, s.reason)}',
                    style: text.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      decoration: s.isVoided ? TextDecoration.lineThrough : null,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: NxTokens.space1),
            Text(
              shortIsoDate(context, s.incidentDate),
              style: text.bodyMedium?.copyWith(color: c.textSecondary, fontFeatures: const [NxTokens.fontFeatureTabular]),
            ),
            if (s.isSuspension && s.suspensionStart != null && s.suspensionEnd != null) ...[
              const SizedBox(height: NxTokens.space1),
              Text(
                l10n.sanctionsSuspensionPeriod(
                  shortIsoDate(context, s.suspensionStart!),
                  shortIsoDate(context, s.suspensionEnd!),
                  s.suspensionDays ?? 0,
                ),
                style: text.bodyMedium?.copyWith(fontFeatures: const [NxTokens.fontFeatureTabular]),
              ),
            ],
            const SizedBox(height: NxTokens.space2),
            NxChip(
              label: s.isVoided ? l10n.sanctionStatusVoided : l10n.sanctionStatusActive,
              tone: s.isVoided ? NxTone.neutral : NxTone.warning,
            ),
            const SizedBox(height: NxTokens.space2),
            Text(s.description, style: text.bodySmall),
            if (s.isVoided && (s.voidReason ?? '').isNotEmpty) ...[
              const SizedBox(height: NxTokens.space1),
              Text(l10n.sanctionsVoidReason(s.voidReason!), style: secondary),
            ],
            if (s.issuedByName != null) ...[
              const SizedBox(height: NxTokens.space1),
              Text(l10n.sanctionsIssuedBy(s.issuedByName!), style: secondary),
            ],
          ],
        ),
      ),
    );
  }
}

String sanctionTypeLabel(AppLocalizations l10n, String type) => switch (type) {
      'WRITTEN_WARNING' => l10n.sanctionTypeWrittenWarning,
      'ADMINISTRATIVE_RECORD' => l10n.sanctionTypeAdministrativeRecord,
      'SUSPENSION' => l10n.sanctionTypeSuspension,
      _ => l10n.sanctionTypeVerbalWarning,
    };

String sanctionReasonLabel(AppLocalizations l10n, String reason) => switch (reason) {
      'TARDINESS' => l10n.sanctionReasonTardiness,
      'UNJUSTIFIED_ABSENCE' => l10n.sanctionReasonUnjustifiedAbsence,
      'MISCONDUCT' => l10n.sanctionReasonMisconduct,
      'POLICY_VIOLATION' => l10n.sanctionReasonPolicyViolation,
      'NEGLIGENCE' => l10n.sanctionReasonNegligence,
      _ => l10n.sanctionReasonOther,
    };
