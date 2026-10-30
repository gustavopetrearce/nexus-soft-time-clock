import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/i18n/l10n.dart';
import '../../../core/i18n/language_picker.dart';
import '../../../core/theme/theme_mode_controller.dart';
import '../../../core/ui/nx_ui.dart';
import '../../attendance/application/attendance_controller.dart';
import '../../attendance/application/today_attendance.dart';
import '../../attendance/presentation/attendance_l10n.dart';
import '../../auth/data/auth_repository.dart';
import '../../profile/data/profile_repository.dart';

/// Inicio (P03): saludo con el último registro del día, accesos a las funciones del colaborador
/// y la acción principal "Registrar asistencia" fija abajo.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  Future<void> _reload(WidgetRef ref) async {
    ref.invalidate(myProfileProvider);
    ref.invalidate(todayAttendanceProvider);
    try {
      await ref.read(myProfileProvider.future);
    } catch (_) {
      // El error lo muestra el estado de la pantalla.
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final c = NxColors.of(context);
    final text = Theme.of(context).textTheme;
    final profile = ref.watch(myProfileProvider);
    final today = ref.watch(todayAttendanceProvider);
    final attendance = ref.watch(attendanceControllerProvider);
    // "Aprobar vacaciones" solo con `vacation:approve` (GET /auth/me). Degrada en silencio: si
    // carga, falla o el usuario no tiene el permiso, el acceso no aparece.
    final canApprove = ref.watch(meProvider).maybeWhen(data: (me) => me.canAdminister, orElse: () => false);
    final brightness = Theme.of(context).brightness;
    final loading = profile.isLoading || today.isLoading;

    final greeting = profile.valueOrNull?.fullName?.trim();
    final last = today.valueOrNull?.lastRecord;
    final noRecordToday = today.hasValue && today.value!.lastEventType == null;

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text(l10n.homeTitle),
        actions: [
          const LanguageButton(),
          IconButton(
            icon: Icon(brightness == Brightness.dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
            tooltip: brightness == Brightness.dark ? l10n.themeToLight : l10n.themeToDark,
            onPressed: () => ref.read(themeModeControllerProvider.notifier).toggle(brightness),
          ),
          IconButton(
            icon: const Icon(Icons.account_circle_outlined, size: NxTokens.iconSizeLg),
            tooltip: l10n.homeProfileTitle,
            onPressed: () => context.push('/profile'),
          ),
          const SizedBox(width: NxTokens.space2),
        ],
      ),
      body: Column(
        children: [
          // Aviso de conexión (R2): visible mientras haya registros en la cola local.
          if (attendance.pendingCount > 0)
            NxAviso(
              tone: NxTone.warning,
              variant: NxAvisoVariant.banner,
              icon: Icons.cloud_off_outlined,
              message: l10n.homeOffline(attendance.pendingCount),
              trailing: _SyncButton(
                busy: attendance.busy,
                tooltip: l10n.homeSyncPending,
                onPressed: () => ref.read(attendanceControllerProvider.notifier).syncNow(),
              ),
            ),
          Expanded(
            child: NxConCarga(
              loading: loading,
              label: l10n.commonLoading,
              child: RefreshIndicator(
                onRefresh: () => _reload(ref),
                child: NxContenido(
                  children: [
                    if (profile.hasError && !profile.isLoading)
                      NxEstadoVacio.error(
                        title: l10n.commonLoadError,
                        description: l10n.commonLoadErrorHint,
                        retryLabel: l10n.commonRetry,
                        onRetry: () => _reload(ref),
                      )
                    else ...[
                      if (noRecordToday) NxAviso(tone: NxTone.info, message: l10n.homeNoRecordToday),
                      NxCabeceraMarca(
                        children: [
                          Text(l10n.homeGreeting, style: text.bodyMedium?.copyWith(color: c.onSurfaceBrand)),
                          if (greeting != null && greeting.isNotEmpty)
                            Text(greeting, style: text.titleLarge?.copyWith(color: c.onSurfaceBrand)),
                          if (last != null)
                            Text(
                              l10n.homeLastRecord(
                                l10n.recordEventType(last),
                                DateFormat('HH:mm').format(last.serverTime),
                                last.workCenter,
                              ),
                              style: text.bodyMedium?.copyWith(
                                color: c.onSurfaceBrand,
                                fontFeatures: const [NxTokens.fontFeatureTabular],
                              ),
                            ),
                        ],
                      ),
                    ],
                    _Accesos(canApprove: canApprove),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: NxAccionFija(
        child: NxBoton(
          label: l10n.homeRegisterTitle,
          icon: Icons.qr_code_2,
          block: true,
          onPressed: () => context.push('/attendance'),
        ),
      ),
    );
  }
}

/// Tarjetas de acceso (R4).
class _Accesos extends StatelessWidget {
  const _Accesos({required this.canApprove});

  final bool canApprove;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final cards = [
      NxTarjetaAcceso(
        icon: Icons.qr_code_2,
        title: l10n.homeRegisterTitle,
        subtitle: l10n.homeRegisterSubtitle,
        onTap: () => context.push('/attendance'),
      ),
      NxTarjetaAcceso(
        icon: Icons.history,
        title: l10n.homeHistoryTitle,
        subtitle: l10n.homeHistorySubtitle,
        onTap: () => context.push('/attendance/history'),
      ),
      NxTarjetaAcceso(
        icon: Icons.person_outline,
        title: l10n.homeProfileTitle,
        subtitle: l10n.homeProfileSubtitle,
        onTap: () => context.push('/profile'),
      ),
      NxTarjetaAcceso(
        icon: Icons.beach_access_outlined,
        title: l10n.homeVacationsTitle,
        subtitle: l10n.homeVacationsSubtitle,
        onTap: () => context.push('/vacations'),
      ),
      if (canApprove)
        NxTarjetaAcceso(
          icon: Icons.fact_check_outlined,
          title: l10n.homeApproveVacationsTitle,
          subtitle: l10n.homeApproveVacationsSubtitle,
          onTap: () => context.push('/admin/vacations'),
        ),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < cards.length; i++) ...[
          if (i > 0) const SizedBox(height: NxTokens.spaceGapRelated),
          cards[i],
        ],
      ],
    );
  }
}

/// Botón de ícono `sync` que fuerza el envío de la cola y gira mientras envía.
class _SyncButton extends StatefulWidget {
  const _SyncButton({required this.busy, required this.tooltip, required this.onPressed});

  final bool busy;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  State<_SyncButton> createState() => _SyncButtonState();
}

class _SyncButtonState extends State<_SyncButton> with SingleTickerProviderStateMixin {
  late final AnimationController _spin =
      AnimationController(vsync: this, duration: NxTokens.motionDurationLoop);

  @override
  void didUpdateWidget(covariant _SyncButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncSpin();
  }

  @override
  void initState() {
    super.initState();
    _syncSpin();
  }

  void _syncSpin() {
    if (widget.busy && !_spin.isAnimating) {
      _spin.repeat();
    } else if (!widget.busy && _spin.isAnimating) {
      _spin.reset();
    }
  }

  @override
  void dispose() {
    _spin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: widget.tooltip,
      color: NxColors.of(context).actionPrimary,
      onPressed: widget.busy ? null : widget.onPressed,
      icon: RotationTransition(
        turns: _spin,
        child: const Icon(Icons.sync, size: NxTokens.iconSizeLg),
      ),
    );
  }
}
