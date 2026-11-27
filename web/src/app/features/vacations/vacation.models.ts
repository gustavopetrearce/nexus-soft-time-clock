/**
 * Estados de una solicitud de vacaciones (espejo de VacationStatus del backend). REJECTED es una
 * negativa de la empresa; CANCELLED, una cancelación aceptada a petición del colaborador.
 */
export type VacationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/** Solicitud de cancelación del colaborador: en revisión, aceptada o denegada. */
export type CancellationStatus = 'PENDING' | 'ACCEPTED' | 'DENIED';

/** Solicitud de vacaciones (espejo de VacationRequestResponse). */
export interface VacationRequest {
  id: string;
  userId: string;
  userName?: string;
  employeeCode?: string;
  startDate: string; // ISO date (yyyy-MM-dd)
  endDate: string;
  days: number;
  reason?: string;
  status: VacationStatus;
  resolutionNote?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolvedByName?: string;
  cancelRequestStatus?: CancellationStatus | null;
  cancelRequestReason?: string;
  cancelRequestedAt?: string;
  cancelResolvedByName?: string;
  cancelResolvedAt?: string;
  cancelResolutionNote?: string;
  /** El colaborador aún puede pedir cancelarla (lo decide el backend). */
  canRequestCancellation?: boolean;
  createdAt: string;
}

/** Decisión sobre una cancelación pedida. */
export type CancellationResolution = 'ACCEPTED' | 'DENIED';

/** Resolución posible desde el panel (aprobar o rechazar). */
export type VacationResolution = 'APPROVED' | 'REJECTED';

/** Cuerpo del PATCH de resolución. */
export interface ResolveVacation {
  resolution: VacationResolution;
  note?: string;
}

/** Alta de una solicitud (para uso futuro desde el panel/app). */
export interface CreateVacationRequest {
  userId?: string; // opcional: si lo omite el backend, se asume el usuario autenticado
  startDate: string;
  endDate: string;
  reason?: string;
}
