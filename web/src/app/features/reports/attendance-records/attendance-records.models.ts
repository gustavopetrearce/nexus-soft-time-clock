import { AttendanceEventType } from '../../admin/event-types/event-type.models';

/** Estado de un registro de asistencia (coincide con el enum del backend). */
export type AttendanceRecordStatus = 'ACCEPTED' | 'REJECTED' | 'PENDING_REVIEW';

/**
 * Fila del reporte de registros individuales de asistencia (una por marcación). No expone
 * ids/llaves: el empleado se identifica por número + nombre y el centro por su nombre; el tipo
 * de evento y el estado son códigos de enum que el front traduce a etiquetas.
 */
export interface AttendanceRecordReport {
  employeeNumber: string;
  employeeName: string;
  /** Fecha y hora de servidor (ISO-8601). */
  serverTime: string;
  eventType: AttendanceEventType;
  status: AttendanceRecordStatus;
  rejectionReason?: string | null;
  workCenter: string;
}

export type RecordSortColumn = keyof Pick<
  AttendanceRecordReport,
  'employeeNumber' | 'employeeName' | 'serverTime' | 'eventType' | 'status' | 'workCenter'
>;

export interface RecordSortState {
  column: RecordSortColumn;
  direction: 'asc' | 'desc';
}

/**
 * Nombres por defecto del tipo de evento tal como los siembra el backend. Sirven para distinguir
 * una etiqueta personalizada por la empresa (que se muestra tal cual, en cualquier idioma) de la
 * predeterminada (que se traduce con `records.event.<CODE>`).
 */
export const DEFAULT_EVENT_TYPE_LABELS: Record<AttendanceEventType, string> = {
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
  INICIO_DESCANSO: 'Inicio de descanso',
  FIN_DESCANSO: 'Fin de descanso',
  CAMBIO_SITIO: 'Cambio de sitio',
};
