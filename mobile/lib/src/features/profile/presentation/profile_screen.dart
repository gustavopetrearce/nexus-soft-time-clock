import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/l10n.dart';
import '../../../core/i18n/language_picker.dart';
import '../../../core/i18n/locale_controller.dart';
import '../../../core/ui/nx_ui.dart';
import '../../auth/application/auth_controller.dart';
import '../data/profile_repository.dart';
import '../domain/my_profile.dart';

/// Mi perfil (P31, solo lectura): datos del colaborador en tres grupos, idioma, cambio de
/// contraseña y cierre de sesión. Para cambiar sus datos, el colaborador acude a RR. HH.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  static String? _gender(AppLocalizations l10n, String? code) => switch (code) {
        'FEMALE' => l10n.genderFemale,
        'MALE' => l10n.genderMale,
        'OTHER' => l10n.genderOther,
        'UNDISCLOSED' => l10n.genderUndisclosed,
        _ => code,
      };

  /// Fecha `yyyy-MM-dd` del backend en formato completo; `null` si no hay.
  static String? _date(BuildContext context, String? iso) => iso == null ? null : fullIsoDate(context, iso);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myProfileProvider);
    final l10n = context.l10n;
    final c = NxColors.of(context);
    final text = Theme.of(context).textTheme;
    final languageName = currentLanguageName(l10n, ref.watch(localeControllerProvider));

    return Scaffold(
      appBar: AppBar(title: Text(l10n.profileTitle)),
      body: NxConCarga(
        loading: async.isLoading,
        label: l10n.commonLoading,
        child: RefreshIndicator(
          onRefresh: () async => ref.invalidate(myProfileProvider),
          child: NxContenido(
            children: [
              if (async.hasError && !async.isLoading)
                NxEstadoVacio.error(
                  title: l10n.commonLoadError,
                  description: l10n.commonLoadErrorHint,
                  retryLabel: l10n.commonRetry,
                  onRetry: () => ref.invalidate(myProfileProvider),
                )
              else if (async.hasValue) ...[
                _Header(profile: async.value!),
                _Groups(profile: async.value!, gender: _gender, date: _date),
              ],
              LanguageMenu(
                builder: (context, controller) => NxTarjetaAcceso(
                  icon: Icons.translate,
                  title: l10n.languageTitle,
                  subtitle: languageName,
                  onTap: () => controller.isOpen ? controller.close() : controller.open(),
                ),
              ),
              NxBoton(
                label: l10n.passwordTitle,
                icon: Icons.lock_reset,
                variant: NxBotonVariant.secondary,
                block: true,
                onPressed: () => context.pushNamed('changePassword'),
              ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.lock_outline, size: NxTokens.iconSizeSm, color: c.textSecondary),
                  const SizedBox(width: NxTokens.space2),
                  Expanded(
                    child: Text(l10n.profileReadOnly, style: text.bodyMedium?.copyWith(color: c.textSecondary)),
                  ),
                ],
              ),
              NxBoton(
                label: l10n.profileLogout,
                variant: NxBotonVariant.tertiary,
                block: true,
                onPressed: () => ref.read(authControllerProvider.notifier).logout(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Cabecera (R1): avatar con iniciales, nombre y correo, centrados.
class _Header extends StatelessWidget {
  const _Header({required this.profile});
  final MyProfile profile;

  @override
  Widget build(BuildContext context) {
    final c = NxColors.of(context);
    final text = Theme.of(context).textTheme;
    final name = (profile.fullName ?? '').trim();
    final initials = name.isEmpty
        ? '?'
        : name.split(RegExp(r'\s+')).take(2).map((s) => s.isEmpty ? '' : s[0]).join().toUpperCase();
    return Padding(
      padding: const EdgeInsets.only(top: NxTokens.space2),
      child: Column(
        children: [
          NxAvatar(initials: initials),
          const SizedBox(height: NxTokens.space2 + NxTokens.space1),
          Text(
            name.isEmpty ? context.l10n.profileDefaultName : name,
            style: text.titleLarge,
            textAlign: TextAlign.center,
          ),
          if (profile.email != null)
            Text(profile.email!, style: text.bodyMedium?.copyWith(color: c.textSecondary)),
        ],
      ),
    );
  }
}

/// Datos (R2) en tres grupos, cada uno en su contenedor.
class _Groups extends StatelessWidget {
  const _Groups({required this.profile, required this.gender, required this.date});

  final MyProfile profile;
  final String? Function(AppLocalizations, String?) gender;
  final String? Function(BuildContext, String?) date;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = profile;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        NxGrupo(title: l10n.profilePersonal, children: [
          NxDatoFila(icon: Icons.badge_outlined, label: l10n.profileEmployeeCode, value: p.employeeCode),
          NxDatoFila(icon: Icons.mail_outline, label: l10n.profileEmail, value: p.email),
          NxDatoFila(icon: Icons.cake_outlined, label: l10n.profileBirthDate, value: date(context, p.birthDate)),
          NxDatoFila(icon: Icons.wc_outlined, label: l10n.profileGender, value: gender(l10n, p.gender)),
          NxDatoFila(icon: Icons.call_outlined, label: l10n.profilePhone, value: p.phone),
          NxDatoFila(icon: Icons.location_on_outlined, label: l10n.profileAddress, value: p.address),
        ],),
        const SizedBox(height: NxTokens.space5),
        NxGrupo(title: l10n.profileCompanyData, children: [
          NxDatoFila(
            icon: Icons.event_available_outlined,
            label: l10n.profileHireDate,
            value: date(context, p.hireDate),
          ),
        ],),
        const SizedBox(height: NxTokens.space5),
        NxGrupo(title: l10n.profileEmergency, children: [
          NxDatoFila(icon: Icons.person_outline, label: l10n.profileName, value: p.emergencyContactName),
          NxDatoFila(icon: Icons.call_outlined, label: l10n.profilePhone, value: p.emergencyContactPhone),
        ],),
      ],
    );
  }
}
