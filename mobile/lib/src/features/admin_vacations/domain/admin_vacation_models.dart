/// Solicitud de vacaciones vista por un administrador (espejo de VacationRequestResponse
/// del backend). Incluye datos del colaborador para la bandeja de aprobación.
class AdminVacationRequest {
  const AdminVacationRequest({
    required this.id,
    required this.userId,
    required this.startDate,
    required this.endDate,
    required this.days,
    required this.status,
    this.userName,
    this.employeeCode,
    this.reason,
    this.resolutionNote,
    this.resolvedBy,
    this.resolvedAt,
    this.createdAt,
    this.cancelRequestStatus,
    this.cancelRequestReason,
  });

  final String id;
  final String userId;
  final String? userName;
  final String? employeeCode;
  final String startDate;
  final String endDate;
  final int days;
  final String status;
  final String? reason;
  final String? resolutionNote;
  final String? resolvedBy;
  final String? resolvedAt;
  final String? createdAt;

  /// null | PENDING | ACCEPTED | DENIED: cancelación pedida por el colaborador.
  final String? cancelRequestStatus;
  final String? cancelRequestReason;

  bool get isPending => status == 'PENDING';
  bool get cancellationPending => cancelRequestStatus == 'PENDING';

  /// Nombre a mostrar: prioriza el nombre del colaborador, cae al id si no viene.
  String get displayName => (userName != null && userName!.isNotEmpty) ? userName! : userId;

  factory AdminVacationRequest.fromJson(Map<String, dynamic> j) => AdminVacationRequest(
        id: j['id'] as String? ?? '',
        userId: j['userId'] as String? ?? '',
        userName: j['userName'] as String?,
        employeeCode: j['employeeCode'] as String?,
        startDate: j['startDate'] as String? ?? '',
        endDate: j['endDate'] as String? ?? '',
        days: (j['days'] as num?)?.toInt() ?? 0,
        status: j['status'] as String? ?? 'PENDING',
        reason: j['reason'] as String?,
        resolutionNote: j['resolutionNote'] as String?,
        resolvedBy: j['resolvedBy'] as String?,
        resolvedAt: j['resolvedAt'] as String?,
        createdAt: j['createdAt'] as String?,
        cancelRequestStatus: j['cancelRequestStatus'] as String?,
        cancelRequestReason: j['cancelRequestReason'] as String?,
      );
}

/// Envelope de paginación del backend ({content, page, size, totalElements, totalPages}).
class PagedVacations {
  const PagedVacations({
    required this.content,
    required this.page,
    required this.totalElements,
    required this.totalPages,
  });

  final List<AdminVacationRequest> content;
  final int page;
  final int totalElements;
  final int totalPages;

  factory PagedVacations.fromJson(Map<String, dynamic> j) => PagedVacations(
        content: (j['content'] as List<dynamic>? ?? const [])
            .cast<Map<String, dynamic>>()
            .map(AdminVacationRequest.fromJson)
            .toList(),
        page: (j['page'] as num?)?.toInt() ?? 0,
        totalElements: (j['totalElements'] as num?)?.toInt() ?? 0,
        totalPages: (j['totalPages'] as num?)?.toInt() ?? 0,
      );
}
