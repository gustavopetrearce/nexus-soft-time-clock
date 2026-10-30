import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/i18n/l10n.dart';
import '../../../core/services/biometric_service.dart';
import '../../../core/services/location_service.dart';
import '../../../core/ui/nx_ui.dart';
import '../application/attendance_controller.dart';
import '../application/attendance_message.dart';
import '../application/today_attendance.dart';
import '../data/evidence_capture_service.dart';
import '../data/event_type_service.dart';
import '../data/site_policy_service.dart';
import '../domain/qr_token.dart';
import 'attendance_l10n.dart';
import 'qr_scanner_screen.dart';

/// Registro de asistencia (P04, offline-first). El colaborador toca un evento y escanea el QR
/// firmado con la cámara (P05): de ahí se obtiene el token crudo y se deriva el ámbito. No hay
/// entrada manual de datos.
///
/// El QR puede ser de un centro (validación de geocerca habitual) o de empresa, en cuyo caso no
/// hay centro ni geocerca y la foto pasa a ser obligatoria.
class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

/// Aviso que queda en pantalla hasta el siguiente intento (HIFI/08 R6).
class _Notice {
  const _Notice(this.tone, this.text, {this.icon, this.retryEvent});

  final NxTone tone;
  final String text;
  final IconData? icon;

  /// Evento a repetir con "Reintentar" (vuelve a P05); `null` si no aplica.
  final String? retryEvent;
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  static const _uuid = Uuid();

  /// Evento en curso desde que se leyó el QR hasta el veredicto; su botón muestra "Registrando…".
  String? _activeEvent;
  _Notice? _notice;

  /// Umbral de precisión del último centro escaneado (su política), para el tono del indicador.
  int? _accuracyMaxM;

  void _snack(String text) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _register(String eventType) async {
    if (_activeEvent != null) return; // bloquea el doble envío
    setState(() => _notice = null);

    // 1) Abrir la cámara y esperar el QR válido (o null si el colaborador cancela).
    final raw = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const QrScannerScreen()),
    );
    if (!mounted || raw == null) {
      return;
    }

    // 2) Derivar el ámbito del token firmado. El escáner ya descarta los ilegibles; esto es la
    //    última red. Un QR de empresa es válido y no lleva centro: registra sin geocerca.
    final scope = scopeFromQrToken(raw);
    final l10n = context.l10n;
    if (scope == null) {
      setState(() => _notice = _Notice(NxTone.error, l10n.attendanceInvalidQr, retryEvent: eventType));
      return;
    }
    final workSiteId = scope.workSiteId;
    setState(() => _activeEvent = eventType);

    try {
      // 3) ¿Hace falta foto? Con centro manda su política (HU-13 CA1), consultada al backend y
      //    cacheada para poder exigirla también sin conexión. Sin centro se exige siempre: es la
      //    evidencia que sustituye a la geocerca, y el servidor la reclamará igualmente.
      bool requirePhoto = true;
      if (workSiteId != null) {
        final policy = await ref.read(sitePolicyServiceProvider).forSite(workSiteId);
        if (!mounted) return;
        requirePhoto = policy.requirePhoto;
        _accuracyMaxM = policy.gpsAccuracyMaxM;
      }

      // 4) Evidencia fotográfica. Si se exige, sin foto no hay registro: enviarlo sería gastarle al
      //    colaborador un intento que el servidor rechazará con PHOTO_REQUIRED.
      CapturedEvidence? evidence;
      if (requirePhoto) {
        evidence = await ref.read(evidenceCaptureServiceProvider).capture(_uuid.v4());
        if (!mounted) return;
        if (evidence == null) {
          setState(() => _notice = _Notice(
                NxTone.info,
                scope.isCompanyWide ? l10n.attendancePhotoRequiredSiteless : l10n.attendancePhotoRequiredSite,
                icon: Icons.photo_camera_outlined,
                retryEvent: eventType,
              ),);
          return;
        }
      }

      // 5) Autenticación biométrica local (HU-14). Es oportunista: el backend rechaza si el
      //    centro la exige y no fue exitosa. Si el dispositivo no la soporta, devuelve false.
      final biometricOk = await ref.read(biometricServiceProvider).authenticate(l10n.attendanceBiometricPrompt);
      if (!mounted) return;

      // 6) Registrar (GPS → cola local → sincronización) con el token crudo. El try es la última
      //    red: sin él, un fallo antes de encolar (GPS, identidad del dispositivo, base local)
      //    dejaba el botón en carga y sin ningún aviso de por qué.
      await ref.read(attendanceControllerProvider.notifier).register(
            eventType: eventType,
            workSiteId: workSiteId,
            qrToken: raw,
            biometricVerified: biometricOk,
            evidencePath: evidence?.file.path,
            evidenceSha256: evidence?.sha256,
          );
      final result = ref.read(attendanceControllerProvider).message;
      if (!mounted || result == null) return;
      _showResult(result, eventType);
    } catch (e) {
      if (mounted) {
        setState(() => _notice = _Notice(NxTone.error, l10n.attendanceUnexpected('$e'), retryEvent: eventType));
      }
    } finally {
      if (mounted) setState(() => _activeEvent = null);
    }
  }

  /// Resultado del registro: Snackbar si quedó registrado o a salvo; Aviso persistente si se
  /// rechazó o quedó en revisión (con "Reintentar" cuando volver a intentarlo tiene sentido).
  void _showResult(AttendanceMessage result, String eventType) {
    final text = context.l10n.attendanceMessageText(result);
    if (!result.persistent) {
      _snack(text);
      return;
    }
    setState(() => _notice = switch (result) {
          InReviewMessage() => _Notice(NxTone.warning, text, icon: Icons.warning_amber_outlined),
          _ => _Notice(NxTone.error, text, retryEvent: eventType),
        },);
  }

  Future<void> _syncNow() async {
    await ref.read(attendanceControllerProvider.notifier).syncNow();
    final message = ref.read(attendanceControllerProvider).message;
    if (mounted && message != null) _snack(context.l10n.attendanceMessageText(message));
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(attendanceControllerProvider);
    final today = ref.watch(todayAttendanceProvider).valueOrNull;
    final l10n = context.l10n;
    final c = NxColors.of(context);
    final next = today?.nextEvent ?? 'ENTRADA';
    final notice = _notice;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.attendanceTitle),
        actions: [
          IconButton(
            tooltip: l10n.attendanceSyncTooltip(state.pendingCount),
            color: c.actionPrimary,
            onPressed: state.busy ? null : _syncNow,
            icon: Badge(
              isLabelVisible: state.pendingCount > 0,
              label: Text('${state.pendingCount}'),
              child: const Icon(Icons.sync, size: NxTokens.iconSizeLg),
            ),
          ),
          const SizedBox(width: NxTokens.space2),
        ],
      ),
      body: NxContenido(
        children: [
          NxAviso(
            tone: NxTone.info,
            variant: NxAvisoVariant.instruccion,
            icon: Icons.qr_code_2,
            message: l10n.attendanceInstructions,
            liveRegion: false,
          ),
          if (notice != null)
            NxAviso(
              key: ObjectKey(notice),
              tone: notice.tone,
              icon: notice.icon,
              message: notice.text,
              liveRegion: true,
              action: notice.retryEvent == null
                  ? null
                  : Align(
                      alignment: Alignment.centerLeft,
                      child: NxBoton(
                        label: l10n.commonRetry,
                        variant: NxBotonVariant.secondary,
                        onPressed: () => _register(notice.retryEvent!),
                      ),
                    ),
            ),
          Wrap(
            spacing: NxTokens.spaceGapGroup,
            runSpacing: NxTokens.space1,
            children: [
              _GpsIndicator(accuracyMaxM: _accuracyMaxM),
              if (today?.lastRecord != null)
                NxIndicador(icon: Icons.domain_outlined, label: today!.lastRecord!.workCenter),
            ],
          ),
          _EventButtons(
            next: next,
            activeEvent: _activeEvent,
            onRegister: _register,
          ),
          _PendingStatus(count: state.pendingCount, failed: state.failedCount, issue: state.lastIssue),
        ],
      ),
    );
  }
}

/// Indicador de GPS (R1): precisión en m, en warning si supera el umbral del centro.
class _GpsIndicator extends ConsumerWidget {
  const _GpsIndicator({required this.accuracyMaxM});

  final int? accuracyMaxM;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final reading = ref.watch(gpsReadingProvider).valueOrNull;
    final accuracy = reading?.accuracyM;
    final limit = accuracyMaxM?.toDouble() ?? LocationService.defaultAccuracyMaxM;
    if (reading != null && !reading.enabled) {
      return NxIndicador(icon: Icons.location_disabled_outlined, label: l10n.attendanceGpsOff, tone: NxTone.warning);
    }
    if (accuracy == null) {
      return NxIndicador(icon: Icons.my_location_outlined, label: l10n.attendanceGpsSearching);
    }
    return NxIndicador(
      icon: Icons.my_location_outlined,
      label: l10n.attendanceGps(accuracy.round()),
      tone: accuracy > limit ? NxTone.warning : null,
    );
  }
}

/// Botones de evento (R4): Entrada y Salida a 6 + 6, primary el que toca; los intermedios
/// habilitados por la empresa (HU-12 CA1) debajo, a ancho completo.
class _EventButtons extends ConsumerWidget {
  const _EventButtons({required this.next, required this.activeEvent, required this.onRegister});

  final String next;
  final String? activeEvent;
  final Future<void> Function(String eventType) onRegister;

  static IconData _iconFor(String eventType) => switch (eventType) {
        'ENTRADA' => Icons.login,
        'SALIDA' => Icons.logout,
        'INICIO_DESCANSO' => Icons.free_breakfast_outlined,
        'FIN_DESCANSO' => Icons.work_history_outlined,
        'CAMBIO_SITIO' => Icons.location_on_outlined,
        _ => Icons.more_horiz,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final intermediate = ref.watch(enabledIntermediateEventTypesProvider).valueOrNull ?? const [];

    Widget button(String code, String label) => NxBoton(
          label: label,
          icon: _iconFor(code),
          variant: code == next ? NxBotonVariant.primary : NxBotonVariant.secondary,
          busy: activeEvent == code,
          busyLabel: l10n.attendanceRegistering,
          block: true,
          onPressed: () => onRegister(code),
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: button('ENTRADA', l10n.eventEntrada)),
            const SizedBox(width: NxTokens.spaceGapRelated),
            Expanded(child: button('SALIDA', l10n.eventSalida)),
          ],
        ),
        for (final t in intermediate) ...[
          const SizedBox(height: NxTokens.spaceGapRelated),
          button(t.eventType, l10n.eventTypeLabel(t.eventType, t.label)),
        ],
      ],
    );
  }
}

/// Pendientes (R5): siempre visible, con 0 cuando está al día; con fallidos, en tono error.
class _PendingStatus extends StatelessWidget {
  const _PendingStatus({required this.count, required this.failed, required this.issue});

  final int count;

  /// Marcaciones que el servidor rechazó en firme; no se reintentan solas.
  final int failed;

  /// Último motivo real de fallo. Se muestra porque, sin él, un 403 o un error del servidor se
  /// veían igual que una falta de cobertura y el colaborador esperaba una sincronización que
  /// nunca iba a llegar.
  final String? issue;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final hasFailures = failed > 0;
    final tone = hasFailures ? NxTone.error : NxTone.info;
    final c = NxColors.of(context);
    return NxAviso(
      tone: tone,
      variant: NxAvisoVariant.fila,
      liveRegion: false,
      icon: hasFailures
          ? Icons.error_outline
          : count == 0
              ? Icons.cloud_done_outlined
              : Icons.cloud_upload_outlined,
      message: hasFailures ? l10n.attendanceFailedOps : l10n.attendancePendingOps,
      action: issue == null
          ? null
          : Text(issue!, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: tone.fg(c))),
      trailing: Text(
        '${hasFailures ? failed : count}',
        style: Theme.of(context).textTheme.titleLarge?.copyWith(
              color: tone.fg(c),
              fontFeatures: const [NxTokens.fontFeatureTabular],
            ),
      ),
    );
  }
}
