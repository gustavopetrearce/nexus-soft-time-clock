import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/l10n.dart';
import '../../../core/ui/nx_ui.dart';
import '../application/auth_controller.dart';
import '../data/auth_repository.dart';

/// Cambiar contraseña (P32, RF-01): la actual se valida en el servidor y la confirmación al salir
/// del campo. Al guardar se cierran todas las sesiones y se vuelve al login (RN-41).
class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  /// Largo mínimo de la contraseña nueva.
  static const minLength = 8;

  @override
  ConsumerState<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _currentController = TextEditingController();
  final _newController = TextEditingController();
  final _confirmController = TextEditingController();

  bool _obscureCurrent = true;
  bool _obscureNew = true;
  bool _obscureConfirm = true;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _currentController.dispose();
    _newController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_saving || !_formKey.currentState!.validate()) {
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).changePassword(
            _currentController.text,
            _newController.text,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.l10n.passwordUpdated)),
      );
      // El cambio revoca las sesiones activas (incluida esta): el redirect del router
      // lleva a /login al cerrar sesión.
      await ref.read(authControllerProvider.notifier).logout();
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.response?.statusCode == 401 ? context.l10n.passwordWrongCurrent : context.l10n.passwordFailed;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = context.l10n.passwordFailed);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  NxMostrarContrasena _toggle(bool obscured, VoidCallback onToggle) => NxMostrarContrasena(
        obscured: obscured,
        onToggle: onToggle,
        showLabel: context.l10n.passwordShow,
        hideLabel: context.l10n.passwordHide,
      );

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.passwordTitle)),
      body: Form(
        key: _formKey,
        child: NxContenido(
          children: [
            if (_error != null) NxAviso(key: ValueKey(_error), tone: NxTone.error, message: _error!),
            NxCampo(
              label: l10n.passwordCurrent,
              required: true,
              controller: _currentController,
              obscureText: _obscureCurrent,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.password],
              autovalidateMode: AutovalidateMode.onUnfocus,
              validator: (v) => (v == null || v.isEmpty) ? l10n.commonRequired : null,
              suffix: _toggle(_obscureCurrent, () => setState(() => _obscureCurrent = !_obscureCurrent)),
            ),
            NxCampo(
              label: l10n.passwordNew,
              required: true,
              controller: _newController,
              obscureText: _obscureNew,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.newPassword],
              helperText: l10n.passwordMinLength,
              autovalidateMode: AutovalidateMode.onUnfocus,
              validator: (v) {
                if (v == null || v.isEmpty) return l10n.commonRequired;
                return v.length < ChangePasswordScreen.minLength ? l10n.passwordMinLength : null;
              },
              suffix: _toggle(_obscureNew, () => setState(() => _obscureNew = !_obscureNew)),
            ),
            NxCampo(
              label: l10n.passwordConfirm,
              required: true,
              controller: _confirmController,
              obscureText: _obscureConfirm,
              textInputAction: TextInputAction.done,
              autofillHints: const [AutofillHints.newPassword],
              autovalidateMode: AutovalidateMode.onUnfocus,
              onFieldSubmitted: (_) => _submit(),
              validator: (v) {
                if (v == null || v.isEmpty) return l10n.commonRequired;
                return v != _newController.text ? l10n.passwordMismatch : null;
              },
              suffix: _toggle(_obscureConfirm, () => setState(() => _obscureConfirm = !_obscureConfirm)),
            ),
          ],
        ),
      ),
      bottomNavigationBar: NxAccionFija(
        child: NxBoton(
          label: l10n.passwordSave,
          busy: _saving,
          block: true,
          onPressed: _submit,
        ),
      ),
    );
  }
}
