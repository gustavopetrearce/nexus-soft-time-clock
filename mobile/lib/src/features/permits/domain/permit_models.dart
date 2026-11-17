/// Permiso propio del colaborador (espejo de PermitResponse): entrada tarde, salida temprano o
/// falta, registrado por admin/RR. HH./supervisor. El goce de sueldo lo decide RR. HH.
class MyPermit {
  const MyPermit({
    required this.id,
    required this.type,
    required this.reason,
    required this.startDate,
    required this.endDate,
    required this.days,
    required this.status,
    required this.payStatus,
    this.timeAt,
    this.notes,
    this.grantedByName,
  });

  final String id;

  /// LATE_ARRIVAL | EARLY_DEPARTURE | ABSENCE
  final String type;

  /// PERSONAL | INCAPACIDAD | MEDICO | FAMILIAR | TRAMITE | OTRO
  final String reason;
  final String startDate;
  final String endDate;
  final int days;

  /// APPROVED | CANCELLED
  final String status;

  /// PENDING_REVIEW | WITH_PAY | WITHOUT_PAY
  final String payStatus;

  /// "HH:mm:ss" para entrada tarde / salida temprano.
  final String? timeAt;
  final String? notes;
  final String? grantedByName;

  bool get isAbsence => type == 'ABSENCE';

  /// "HH:mm" de la hora autorizada.
  String? get shortTime => timeAt == null || timeAt!.length < 5 ? timeAt : timeAt!.substring(0, 5);

  factory MyPermit.fromJson(Map<String, dynamic> j) => MyPermit(
        id: j['id'] as String? ?? '',
        type: j['type'] as String? ?? 'ABSENCE',
        reason: j['reason'] as String? ?? 'OTRO',
        startDate: j['startDate'] as String? ?? '',
        endDate: j['endDate'] as String? ?? '',
        days: (j['days'] as num?)?.toInt() ?? 0,
        status: j['status'] as String? ?? 'APPROVED',
        payStatus: j['payStatus'] as String? ?? 'PENDING_REVIEW',
        timeAt: j['timeAt'] as String?,
        notes: j['notes'] as String?,
        grantedByName: j['grantedByName'] as String?,
      );
}
