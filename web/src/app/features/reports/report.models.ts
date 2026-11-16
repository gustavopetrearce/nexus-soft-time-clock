/**
 * Modelos del reporte de asistencia por colaborador (RF-11).
 * Espejo del contrato JSON expuesto por {@code GET /api/v1/reports/attendance-summary}.
 */

/** Fila del reporte: una por empleado, ya agregada por el backend. */
export interface AttendanceReport {
  employeeNumber: string;
  employeeName: string;
  workCenter: string;
  expectedDays: number;
  attendedDays: number;
  justifiedAbsences: number;
  unjustifiedAbsences: number;
  lateArrivals: number;
  workedHours: number;
  overtimeHours: number;
  totalHours: number;
  active: boolean;
  compliancePercentage: number;
}

/** Proyecto para el filtro de los reportes (GET /reports/projects). */
export interface ReportProject {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
}

/** Horas de un colaborador en un proyecto (GET /reports/hours-by-project); proyecto nulo = sin proyecto. */
export interface ProjectHours {
  employeeNumber: string;
  employeeName: string;
  projectCode: string | null;
  projectName: string | null;
  workedHours: number;
  overtimeHours: number;
  totalHours: number;
}

/** Columnas ordenables/filtrables numéricas (para rangos min/max). */
export type NumericColumn =
  | 'expectedDays'
  | 'attendedDays'
  | 'justifiedAbsences'
  | 'unjustifiedAbsences'
  | 'lateArrivals'
  | 'workedHours'
  | 'overtimeHours'
  | 'totalHours'
  | 'compliancePercentage';

/** Todas las columnas ordenables de la tabla. */
export type SortColumn =
  | 'employeeNumber'
  | 'employeeName'
  | 'workCenter'
  | NumericColumn
  | 'active';

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

export type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

/** Rango numérico opcional (ambos extremos inclusivos). */
export interface NumberRange {
  min: number | null;
  max: number | null;
}

/** Estado completo de filtros aplicables sobre el conjunto ya cargado. */
export interface ReportFilters {
  /** Rango de fechas del reporte (dispara recarga contra el backend). */
  from: string;
  to: string;
  /** Proyecto (CU-09): '' = todos. Recarga contra el backend. */
  projectId: string;
  /** Búsqueda general (sobre nombre, número y centro). */
  search: string;
  /** Filtros de texto por columna. */
  employeeNumber: string;
  employeeName: string;
  workCenter: string;
  /** Filtros de rango numérico (una entrada por columna numérica). */
  ranges: Record<NumericColumn, NumberRange>;
  /** Estado del colaborador. */
  status: StatusFilter;
}

/** Umbral configurable de retardos: a partir de este valor se marca en rojo (RN de presentación). */
export const LATE_THRESHOLD = 3;

const emptyRange = (): NumberRange => ({ min: null, max: null });

/** Fecha ISO (yyyy-MM-dd) desplazada `days` respecto de hoy. */
function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Filtros por defecto: últimos 30 días, sin refinamientos. */
export function defaultFilters(): ReportFilters {
  return {
    from: isoDate(-29),
    to: isoDate(0),
    projectId: '',
    search: '',
    employeeNumber: '',
    employeeName: '',
    workCenter: '',
    ranges: {
      expectedDays: emptyRange(),
      attendedDays: emptyRange(),
      justifiedAbsences: emptyRange(),
      unjustifiedAbsences: emptyRange(),
      lateArrivals: emptyRange(),
      workedHours: emptyRange(),
      overtimeHours: emptyRange(),
      totalHours: emptyRange(),
      compliancePercentage: emptyRange(),
    },
    status: 'ALL',
  };
}

/** Cuenta cuántos filtros (más allá del rango de fechas) están activos, para el indicador visual. */
export function countActiveFilters(f: ReportFilters): number {
  let n = 0;
  if (f.search.trim()) n++;
  if (f.projectId) n++;
  if (f.employeeNumber.trim()) n++;
  if (f.employeeName.trim()) n++;
  if (f.workCenter.trim()) n++;
  if (f.status !== 'ALL') n++;
  for (const key of Object.keys(f.ranges) as NumericColumn[]) {
    const r = f.ranges[key];
    if (r.min !== null || r.max !== null) n++;
  }
  return n;
}
