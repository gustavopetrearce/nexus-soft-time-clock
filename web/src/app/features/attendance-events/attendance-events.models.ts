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
}

/** Tipos de evento en el orden en que se ofrecen en los filtros. */
export const EVENT_CODES = ['ENTRADA', 'SALIDA', 'INICIO_DESCANSO', 'FIN_DESCANSO', 'CAMBIO_SITIO'] as const;

/** Etiqueta del tipo de evento en el idioma activo (`attendance.event.<CODE>`); si no existe, el código. */
export function eventLabel(code: string): string {
  return translateOr(`attendance.event.${code}`, code);
}

/** Estado del registro en el idioma activo (`attendance.status.<CODE>`). */
export function recordStatusLabel(code: string): string {
  return translateOr(`attendance.status.${code}`, code);
}

/** Motivo de rechazo legible (`attendance.rejection.<CODE>`), p. ej. para el tooltip del estado. */
export function rejectionLabel(code: string): string {
  return translateOr(`attendance.rejection.${code}`, code);
}
