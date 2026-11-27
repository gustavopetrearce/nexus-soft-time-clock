/// Categoría de descanso de la empresa ("Almuerzo", "Comida", "Café"…). No es un tipo de evento:
/// califica el Inicio de descanso; el Fin de descanso la hereda en el servidor.
class BreakType {
  const BreakType({
    required this.id,
    required this.code,
    required this.label,
    required this.enabled,
    required this.paid,
    this.maxMinutes,
  });

  final String id;
  final String code;
  final String label;
  final bool enabled;
  final bool paid;
  final int? maxMinutes;

  factory BreakType.fromJson(Map<String, dynamic> json) => BreakType(
        id: json['id'] as String,
        code: json['code'] as String,
        label: json['label'] as String,
        enabled: json['enabled'] as bool? ?? true,
        paid: json['paid'] as bool? ?? false,
        maxMinutes: json['maxMinutes'] as int?,
      );

  /// Copia con la disponibilidad que devuelve `/attendance/me/break-options` (V38).
  factory BreakType.fromOptionJson(Map<String, dynamic> json) => BreakType.fromJson({...json, 'enabled': true});

  Map<String, dynamic> toJson() => {
        'id': id,
        'code': code,
        'label': label,
        'enabled': enabled,
        'paid': paid,
        if (maxMinutes != null) 'maxMinutes': maxMinutes,
      };
}

/// Disponibilidad de una categoría para la jornada actual (V38): el turno puede no admitirla
/// (`NOT_ALLOWED_FOR_SHIFT`) o ya se usó hoy (`ALREADY_USED`). El servidor sigue decidiendo al
/// registrar; esto solo evita ofrecer lo que se rechazaría.
class BreakOption {
  const BreakOption({required this.type, this.availability = 'AVAILABLE'});

  final BreakType type;

  /// AVAILABLE | NOT_ALLOWED_FOR_SHIFT | ALREADY_USED
  final String availability;

  bool get available => availability == 'AVAILABLE';

  factory BreakOption.fromJson(Map<String, dynamic> json) => BreakOption(
        type: BreakType.fromOptionJson(json),
        availability: json['availability'] as String? ?? 'AVAILABLE',
      );

  BreakOption withAvailability(String value) => BreakOption(type: type, availability: value);
}
