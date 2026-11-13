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

  Map<String, dynamic> toJson() => {
        'id': id,
        'code': code,
        'label': label,
        'enabled': enabled,
        'paid': paid,
        if (maxMinutes != null) 'maxMinutes': maxMinutes,
      };
}
