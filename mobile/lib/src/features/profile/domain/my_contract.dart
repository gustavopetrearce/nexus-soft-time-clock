/// Contrato propio del colaborador (iteración 14): el vigente hoy o el próximo por empezar.
/// Espejo de MeContractResponse; solo lectura en la app.
class MyContract {
  const MyContract({
    required this.type,
    this.projectCode,
    this.projectName,
    this.startsOn,
    this.endsOn,
    this.current = false,
  });

  /// PROJECT | SHIFT.
  final String type;
  final String? projectCode;
  final String? projectName;

  /// Fechas `yyyy-MM-dd`; [endsOn] nulo = indefinido.
  final String? startsOn;
  final String? endsOn;

  /// Falso si aún no empieza (es el próximo contrato, no el vigente).
  final bool current;

  bool get isProject => type == 'PROJECT';

  /// "CÓDIGO · nombre", o nulo si no es por proyecto.
  String? get projectLabel {
    if (projectCode == null) return null;
    return projectName == null ? projectCode : '$projectCode · $projectName';
  }

  factory MyContract.fromJson(Map<String, dynamic> j) => MyContract(
        type: j['type'] as String? ?? 'SHIFT',
        projectCode: j['projectCode'] as String?,
        projectName: j['projectName'] as String?,
        startsOn: j['startsOn'] as String?,
        endsOn: j['endsOn'] as String?,
        current: j['current'] as bool? ?? false,
      );
}
