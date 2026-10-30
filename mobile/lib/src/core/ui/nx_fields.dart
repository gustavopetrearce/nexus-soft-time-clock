import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/tokens.g.dart';

/// Etiqueta de campo (DS/09 n.º 3): small medium, fuera de la caja; `*` si es obligatorio.
class NxCampoLabel extends StatelessWidget {
  const NxCampoLabel(this.label, {super.key, this.required = false});

  final String label;
  final bool required;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.bodyMedium?.copyWith(
          fontWeight: NxTokens.fontWeightMedium,
          color: NxColors.of(context).textPrimary,
        );
    return Text.rich(
      TextSpan(
        text: label,
        children: [
          if (required) const TextSpan(text: ' *', semanticsLabel: ''),
        ],
      ),
      style: style,
    );
  }
}

/// Campo de texto (n.º 3–5) con la etiqueta encima de la caja, error debajo (`text-caption`,
/// `status-error-fg`) y contador opcional. La etiqueta y el campo se leen juntos.
class NxCampo extends StatelessWidget {
  const NxCampo({
    super.key,
    required this.label,
    this.controller,
    this.focusNode,
    this.required = false,
    this.hint,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.autofillHints,
    this.validator,
    this.onChanged,
    this.onFieldSubmitted,
    this.maxLength,
    this.maxLines = 1,
    this.minLines,
    this.suffix,
    this.errorText,
    this.helperText,
    this.autovalidateMode,
    this.inputFormatters,
    this.textCapitalization = TextCapitalization.none,
  });

  final String label;
  final TextEditingController? controller;
  final FocusNode? focusNode;
  final bool required;
  final String? hint;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final FormFieldValidator<String>? validator;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onFieldSubmitted;

  /// Con valor, muestra el contador `n/máx` (texto largo).
  final int? maxLength;
  final int? maxLines;
  final int? minLines;
  final Widget? suffix;
  final String? errorText;
  final String? helperText;
  final AutovalidateMode? autovalidateMode;
  final List<TextInputFormatter>? inputFormatters;
  final TextCapitalization textCapitalization;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        ExcludeSemantics(child: NxCampoLabel(label, required: required)),
        const SizedBox(height: NxTokens.space1),
        Semantics(
          label: label,
          child: TextFormField(
            controller: controller,
            focusNode: focusNode,
            obscureText: obscureText,
            keyboardType: keyboardType,
            textInputAction: textInputAction,
            autofillHints: autofillHints,
            validator: validator,
            onChanged: onChanged,
            onFieldSubmitted: onFieldSubmitted,
            maxLength: maxLength,
            maxLines: obscureText ? 1 : maxLines,
            minLines: minLines,
            autovalidateMode: autovalidateMode,
            inputFormatters: inputFormatters,
            textCapitalization: textCapitalization,
            style: Theme.of(context).textTheme.bodyLarge,
            decoration: InputDecoration(
              hintText: hint,
              suffixIcon: suffix,
              errorText: errorText,
              helperText: helperText,
              errorMaxLines: 3,
              helperMaxLines: 3,
            ),
          ),
        ),
      ],
    );
  }
}

/// Botón de ícono para mostrar u ocultar una contraseña (con su etiqueta accesible).
class NxMostrarContrasena extends StatelessWidget {
  const NxMostrarContrasena({
    super.key,
    required this.obscured,
    required this.onToggle,
    required this.showLabel,
    required this.hideLabel,
  });

  final bool obscured;
  final VoidCallback onToggle;
  final String showLabel;
  final String hideLabel;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: Icon(obscured ? Icons.visibility_outlined : Icons.visibility_off_outlined),
      tooltip: obscured ? showLabel : hideLabel,
      onPressed: onToggle,
    );
  }
}
