import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/l10n.dart';
import '../../../core/i18n/language_picker.dart';
import '../../../core/ui/nx_ui.dart';
import '../application/auth_controller.dart';
import '../domain/auth_models.dart';

/// Inicio de sesión de la app (P02, RF-01). Formulario validado al salir de cada campo y al
/// enviar; el token se guarda en almacenamiento seguro y la navegación la resuelve el redirect
/// del router.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _companyController = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _companyController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (ref.read(authControllerProvider).loading || !_formKey.currentState!.validate()) {
      return;
    }
    await ref.read(authControllerProvider.notifier).login(
          Credentials(
            email: _emailController.text.trim(),
            password: _passwordController.text,
            companyCode: _companyController.text.trim(),
          ),
        );
    if (mounted && ref.read(authControllerProvider).isAuthenticated) {
      context.go('/');
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authControllerProvider);
    final c = NxColors.of(context);
    final l10n = context.l10n;
    final error = switch (state.error) {
      AuthError.accountLocked => l10n.loginAccountLocked,
      AuthError.invalidCredentials => l10n.loginInvalidCredentials,
      null => null,
    };

    return Scaffold(
      // Selector de idioma accesible antes de iniciar sesión.
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        shape: const Border(),
        automaticallyImplyLeading: false,
        actions: const [LanguageButton(), SizedBox(width: NxTokens.space2)],
      ),
      body: SafeArea(
        top: false,
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(NxTokens.spaceInsetPage),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: NxTokens.containerMaxReadable),
              child: NxContenedor(
                child: Form(
                  key: _formKey,
                  child: AutofillGroup(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Align(alignment: Alignment.centerLeft, child: NxLockup(name: l10n.appTitle)),
                        const SizedBox(height: NxTokens.space4 + NxTokens.spaceGapRelated),
                        Semantics(
                          header: true,
                          child: Text(l10n.loginTitle,
                              style: Theme.of(context).textTheme.titleLarge?.copyWith(color: c.textPrimary),),
                        ),
                        if (error != null) ...[
                          const SizedBox(height: NxTokens.spaceGapRelated),
                          NxAviso(tone: NxTone.error, message: error),
                        ],
                        const SizedBox(height: NxTokens.spaceGapRelated),
                        NxCampo(
                          label: l10n.loginEmail,
                          required: true,
                          controller: _emailController,
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          autofillHints: const [AutofillHints.email],
                          autovalidateMode: AutovalidateMode.onUnfocus,
                          validator: (v) {
                            final value = v?.trim() ?? '';
                            if (value.isEmpty) return l10n.commonRequired;
                            return value.contains('@') ? null : l10n.loginEmailInvalid;
                          },
                        ),
                        const SizedBox(height: NxTokens.spaceGapRelated),
                        NxCampo(
                          label: l10n.loginPassword,
                          required: true,
                          controller: _passwordController,
                          obscureText: _obscure,
                          textInputAction: TextInputAction.next,
                          autofillHints: const [AutofillHints.password],
                          autovalidateMode: AutovalidateMode.onUnfocus,
                          validator: (v) => (v == null || v.isEmpty) ? l10n.commonRequired : null,
                          suffix: NxMostrarContrasena(
                            obscured: _obscure,
                            onToggle: () => setState(() => _obscure = !_obscure),
                            showLabel: l10n.passwordShow,
                            hideLabel: l10n.passwordHide,
                          ),
                        ),
                        const SizedBox(height: NxTokens.spaceGapRelated),
                        NxCampo(
                          label: l10n.loginCompany,
                          controller: _companyController,
                          textInputAction: TextInputAction.done,
                          textCapitalization: TextCapitalization.characters,
                          onFieldSubmitted: (_) => _submit(),
                        ),
                        const SizedBox(height: NxTokens.spaceGapRelated),
                        NxBoton(
                          label: l10n.loginSubmit,
                          busy: state.loading,
                          block: true,
                          onPressed: _submit,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
