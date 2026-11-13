/** Tipos de evento de asistencia (deben coincidir con el enum del backend). */
export type AttendanceEventType =
  | 'ENTRADA'
  | 'SALIDA'
  | 'INICIO_DESCANSO'
  | 'FIN_DESCANSO'
  | 'CAMBIO_SITIO';

/** Configuración por empresa de un tipo de evento (HU-12 CA1). */
export interface EventTypeSetting {
  eventType: AttendanceEventType;
  enabled: boolean;
  label: string;
}

/** ENTRADA y SALIDA son núcleo: siempre habilitadas y no configurables. */
export const CORE_EVENT_TYPES: AttendanceEventType[] = ['ENTRADA', 'SALIDA'];

export function isCore(type: AttendanceEventType): boolean {
  return CORE_EVENT_TYPES.includes(type);
}

/** Categoría de descanso de la empresa (V30): califica INICIO_DESCANSO/FIN_DESCANSO. */
export interface BreakType {
  id: string | null;
  /** Identificador estable para integraciones: mayúsculas, números y guion bajo. */
  code: string;
  label: string;
  enabled: boolean;
  /** El tramo de descanso cuenta como trabajado en los reportes. */
  paid: boolean;
  maxMinutes: number | null;
  sortOrder: number;
}

/** Sugiere un código a partir de la etiqueta: «Café de la tarde» → «CAFE_DE_LA_TARDE». */
export function codeFromLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
}
