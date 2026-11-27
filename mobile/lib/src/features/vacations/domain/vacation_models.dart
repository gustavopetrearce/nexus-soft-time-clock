/// Resumen de vacaciones del colaborador (espejo de MeVacationSummaryResponse).
class VacationSummary {
  const VacationSummary({
    required this.yearsOfService,
    required this.entitledDays,
    required this.takenDays,
    required this.pendingDays,
    required this.availableDays,
  });

  final int yearsOfService;
  final int entitledDays;
  final int takenDays;
  final int pendingDays;
  final int availableDays;

  factory VacationSummary.fromJson(Map<String, dynamic> j) => VacationSummary(
        yearsOfService: (j['yearsOfService'] as num?)?.toInt() ?? 0,
        entitledDays: (j['entitledDays'] as num?)?.toInt() ?? 0,
        takenDays: (j['takenDays'] as num?)?.toInt() ?? 0,
        pendingDays: (j['pendingDays'] as num?)?.toInt() ?? 0,
        availableDays: (j['availableDays'] as num?)?.toInt() ?? 0,
      );
}

/// Una solicitud de vacaciones del colaborador (espejo de VacationRequestResponse). Puede llevar
/// una solicitud de cancelación propia (`cancelRequest*`): PENDING mientras RR. HH. la revisa,
/// ACCEPTED (status pasa a CANCELLED) o DENIED.
class MyVacationRequest {
  const MyVacationRequest({
    required this.id,
    required this.startDate,
    required this.endDate,
    required this.days,
    required this.status,
    this.reason,
    this.resolutionNote,
    this.cancelRequestStatus,
    this.cancelRequestReason,
    this.cancelResolutionNote,
    this.canRequestCancellation = false,
  });

  final String id;
  final String startDate;
  final String endDate;
  final int days;
  final String status;
  final String? reason;
  final String? resolutionNote;

  /// null | PENDING | ACCEPTED | DENIED
  final String? cancelRequestStatus;
  final String? cancelRequestReason;
  final String? cancelResolutionNote;

  /// Aún se puede pedir cancelarla (pendiente, o aprobada que no empieza); lo decide el backend.
  final bool canRequestCancellation;

  bool get cancellationPending => cancelRequestStatus == 'PENDING';

  factory MyVacationRequest.fromJson(Map<String, dynamic> j) => MyVacationRequest(
        id: j['id'] as String? ?? '',
        startDate: j['startDate'] as String? ?? '',
        endDate: j['endDate'] as String? ?? '',
        days: (j['days'] as num?)?.toInt() ?? 0,
        status: j['status'] as String? ?? 'PENDING',
        reason: j['reason'] as String?,
        resolutionNote: j['resolutionNote'] as String?,
        cancelRequestStatus: j['cancelRequestStatus'] as String?,
        cancelRequestReason: j['cancelRequestReason'] as String?,
        cancelResolutionNote: j['cancelResolutionNote'] as String?,
        canRequestCancellation: j['canRequestCancellation'] as bool? ?? false,
      );
}
