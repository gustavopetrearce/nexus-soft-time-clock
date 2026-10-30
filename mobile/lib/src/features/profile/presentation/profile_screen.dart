import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/i18n/l10n.dart';
import '../../../core/i18n/language_picker.dart';
import '../../../core/i18n/locale_controller.dart';
import '../../../core/ui/nx_ui.dart';
import '../../auth/application/auth_controller.dart';
import '../data/profile_repository.dart';
import '../domain/my_profile.dart';

/// Mi perfil (solo lectura): datos personales del colaborador. Para cambios, RR.HH.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  static String? _gender(AppLocalizations l10n, String? code) => switch (code) {
        'FEMALE' => l10n.genderFemale,
        'MALE' => l10n.genderMale,
        'OTHER' => l10n.genderOther,
        'UNDISCLOSED' => l10n.genderUndisclosed,
        _ => code,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final async = ref.watch(myProfileProvider);
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toLanguageTag();
    final chosen = ref.watch(localeControllerProvider);
    final languageName = currentLanguageName(l10n, chosen);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.profileTitle)),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorView(onRetry: () => ref.invalidate(myProfileProvider)),
        data: (p) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(myProfileProvider),
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              _Header(profile: p),
              const SizedBox(height: 20),
              _Section(title: l10n.profilePersonal, children: [
                _Row(icon: Icons.badge_outlined, label: l10n.profileEmployeeCode, value: p.employeeCode),
                _Row(icon: Icons.mail_outline, label: l10n.profileEmail, value: p.email),
                _Row(icon: Icons.cake_outlined, label: l10n.profileBirthDate, value: _fmt(p.birthDate, locale)),
                _Row(icon: Icons.wc_outlined, label: l10n.profileGender, value: _gender(l10n, p.gender)),
                _Row(icon: Icons.call_outlined, label: l10n.profilePhone, value: p.phone),
                _Row(icon: Icons.place_outlined, label: l10n.profileAddress, value: p.address),
              ],),
              const SizedBox(height: 16),
              _Section(title: l10n.profileCompanyData, children: [
                _Row(icon: Icons.event_available_outlined, label: l10n.profileHireDate, value: _fmt(p.hireDate, locale)),
              ],),
              const SizedBox(height: 16),
              _Section(title: l10n.profileEmergency, children: [
                _Row(icon: Icons.person_outline, label: l10n.profileName, value: p.emergencyContactName),
                _Row(icon: Icons.phone_outlined, label: l10n.profilePhone, value: p.emergencyContactPhone),
              ],),
              const SizedBox(height: 16),
              LanguageMenu(
                builder: (context, controller) => NxTarjetaAcceso(
                  icon: Icons.translate,
                  title: l10n.languageTitle,
                  subtitle: languageName,
                  onTap: () => controller.isOpen ? controller.close() : controller.open(),
                ),
              ),
              const SizedBox(height: 20),
              OutlinedButton.icon(
                onPressed: () => context.pushNamed('changePassword'),
                icon: const Icon(Icons.lock_reset),
                label: Text(l10n.passwordTitle),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Icon(Icons.lock_outline, size: 16, color: theme.colorScheme.onSurfaceVariant),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      l10n.profileReadOnly,
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              NxBoton(
                label: l10n.profileLogout,
                icon: Icons.logout,
                variant: NxBotonVariant.tertiary,
                onPressed: () => ref.read(authControllerProvider.notifier).logout(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Fecha `yyyy-MM-dd` del backend en el formato corto del idioma activo.
  static String? _fmt(String? iso, String locale) {
    if (iso == null || iso.length < 10) return iso;
    final date = DateTime.tryParse(iso.substring(0, 10));
    return date == null ? iso : DateFormat.yMd(locale).format(date);
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.profile});
  final MyProfile profile;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = (profile.fullName ?? '').trim();
    final initials = name.isEmpty
        ? '?'
        : name.split(RegExp(r'\s+')).take(2).map((s) => s.isEmpty ? '' : s[0]).join().toUpperCase();
    return Column(
      children: [
        CircleAvatar(
          radius: 44,
          backgroundColor: theme.colorScheme.primaryContainer,
          child: Text(initials,
              style: theme.textTheme.headlineSmall?.copyWith(color: theme.colorScheme.onPrimaryContainer),),
        ),
        const SizedBox(height: 14),
        Text(name.isEmpty ? context.l10n.profileDefaultName : name,
            style: theme.textTheme.titleLarge, textAlign: TextAlign.center,),
        if (profile.email != null)
          Text(profile.email!, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text(title.toUpperCase(),
              style: theme.textTheme.labelMedium?.copyWith(
                  color: theme.colorScheme.primary, fontWeight: FontWeight.w700, letterSpacing: 0.6,),),
        ),
        Card(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4), child: Column(children: children))),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListTile(
      dense: true,
      leading: Icon(icon, color: theme.colorScheme.onSurfaceVariant),
      title: Text(label, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
      subtitle: Text(
        (value == null || value!.trim().isEmpty) ? '—' : value!,
        style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.onRetry});
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.error_outline, size: 40),
          const SizedBox(height: 12),
          Text(context.l10n.profileLoadError),
          const SizedBox(height: 12),
          FilledButton(onPressed: onRetry, child: Text(context.l10n.commonRetry)),
        ],),
      );
}
