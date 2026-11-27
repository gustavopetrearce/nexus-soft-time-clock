/// Sanción propia del colaborador (espejo de SanctionResponse, V39): amonestación, acta
/// administrativa o suspensión que abrió RR. HH., su supervisor o el administrador. Solo lectura.
class MySanction {
  const MySanction({
    required this.id,
    required this.type,
    required this.reason,
    required this.incidentDate,
    required this.description,
    required this.status,
    this.suspensionStart,
    this.suspensionEnd,
    this.suspensionDays,
    this.issuedByName,
    this.voidReason,
  });

  final String id;

  /// VERBAL_WARNING | WRITTEN_WARNING | ADMINISTRATIVE_RECORD | SUSPENSION
  final String type;

  /// TARDINESS | UNJUSTIFIED_ABSENCE | MISCONDUCT | POLICY_VIOLATION | NEGLIGENCE | OTHER
  final String reason;
  final String incidentDate;
  final String description;

  /// ACTIVE | VOIDED
  final String status;
  final String? suspensionStart;
  final String? suspensionEnd;
  final int? suspensionDays;
  final String? issuedByName;
  final String? voidReason;

  bool get isSuspension => type == 'SUSPENSION';
  bool get isVoided => status == 'VOIDED';

  factory MySanction.fromJson(Map<String, dynamic> j) => MySanction(
        id: j['id'] as String? ?? '',
        type: j['type'] as String? ?? 'VERBAL_WARNING',
        reason: j['reason'] as String? ?? 'OTHER',
        incidentDate: j['incidentDate'] as String? ?? '',
        description: j['description'] as String? ?? '',
        status: j['status'] as String? ?? 'ACTIVE',
        suspensionStart: j['suspensionStart'] as String?,
        suspensionEnd: j['suspensionEnd'] as String?,
        suspensionDays: (j['suspensionDays'] as num?)?.toInt(),
        issuedByName: j['issuedByName'] as String?,
        voidReason: j['voidReason'] as String?,
      );
}
