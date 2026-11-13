import { translateOr } from '../../core/i18n/translate-or';

/** Un registro individual de asistencia (espejo de AttendanceEventDto). */
export interface AttendanceEvent {
  recordId: string;
  serverTime: string; // ISO datetime
  userId: string;
  employeeName?: string;
  employeeCode?: string;
  workSite?: string;
  eventType: string;
  status: string;
  rejectionReason?: string | null;
  /** Hay foto asociada. La URL se pide aparte al abrir el detalle porque caduca en minutos. */
  hasEvidence: boolean;
  biometricVerified: boolean;
  gpsAccuracyM?: number | null;
  distanceToSiteM?: number | null;
  source?: string;
  /**
   * Se registró sin centro de trabajo (QR de empresa), luego sin validación de geocerca. No es lo
   * mismo que un centro borrado: aquel también deja `workSite` vacío pero sí pasó por su geocerca.
   */
  siteless: boolean;
  /** Etiqueta de la categoría del descanso (almuerzo, comida…); nula fuera de descansos o sin categoría. */
  breakType?: string | null;
  /** Cancelación (definitiva): causa en texto libre, cuándo y quién. Nulos si no se canceló. */
  cancelReason?: string | null;
  cancelledAt?: string | null;
  cancelledByName?: string | null;
}

/** Solo una marca que cuenta (o podría contar) se puede cancelar. */
export const CANCELLABLE_STATUSES: readonly string[] = ['ACCEPTED', 'PENDING_REVIEW'];

/** Máximo de la causa de cancelación (columna `cancel_reason`). */
export const CANCEL_REASON_MAX = 500;

/** Respuesta de `POST /attendance/{id}/cancel`. */
export interface CancelledAttendance {
  recordId: string;
  serverTime: string;
  status: 'CANCELLED';
  cancelReason: string;
  cancelledBy: string;
  cancelledAt: string;
}

/** Tipos de evento en el orden en que se ofrecen en los filtros. */
export const EVENT_CODES = ['ENTRADA', 'SALIDA', 'INICIO_DESCANSO', 'FIN_DESCANSO', 'CAMBIO_SITIO'] as const;

/** Etiqueta del tipo de evento en el idioma activo (`attendance.event.<CODE>`); si no existe, el código. */
export function eventLabel(code: string): string {
  return translateOr(`attendance.event.${code}`, code);
}

/** Tipo de evento con la categoría del descanso si la tiene: «Inicio de descanso · Almuerzo». */
export function eventWithBreakLabel(code: string, breakType?: string | null): string {
  const label = eventLabel(code);
  return breakType ? `${label} · ${breakType}` : label;
}

/** Estado del registro en el idioma activo (`attendance.status.<CODE>`). */
export function recordStatusLabel(code: string): string {
  return translateOr(`attendance.status.${code}`, code);
}

/** Motivo de rechazo legible (`attendance.rejection.<CODE>`), p. ej. para el tooltip del estado. */
export function rejectionLabel(code: string): string {
  return translateOr(`attendance.rejection.${code}`, code);
}
