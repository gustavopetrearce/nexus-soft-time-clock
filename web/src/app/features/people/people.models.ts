/** Fila del reporte de Personas: todo lo que sabemos del colaborador + indicadores derivados. */
export interface Person {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  employeeCode?: string;
  status: string;
  roles: string[];
  phone?: string;
  gender?: string;
  birthDate?: string; // yyyy-MM-dd
  hireDate?: string; // yyyy-MM-dd
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  pendingVacations: number;
  /** Años completos de antigüedad (null si no hay fecha de ingreso). */
  yearsOfService: number | null;
  /** Hoy es su cumpleaños. */
  isBirthdayToday: boolean;
  /** Hoy cumple un aniversario en la empresa (mismo día/mes de ingreso, con ≥ 1 año). */
  isAnniversaryToday: boolean;
}

export type ColumnKind =
  | 'person' | 'text' | 'status' | 'roles' | 'date' | 'number'
  | 'gender' | 'birthday' | 'anniversary' | 'vacation';

export type FilterKind = 'text' | 'status' | 'roles' | 'flag' | 'none';

/** Definición de una columna del reporte dinámico (visible/oculta, tipo de celda y de filtro). */
export interface ColumnDef {
  key: string;
  /** Clave de traducción del encabezado. */
  label: string;
  visible: boolean;
  kind: ColumnKind;
  filter: FilterKind;
}

/** Columnas por defecto del reporte (el usuario puede mostrar/ocultar). */
export function defaultColumns(): ColumnDef[] {
  return [
    { key: 'person', label: 'people.col.person', visible: true, kind: 'person', filter: 'text' },
    { key: 'employeeCode', label: 'people.col.employeeCode', visible: true, kind: 'text', filter: 'text' },
    { key: 'status', label: 'people.col.status', visible: true, kind: 'status', filter: 'status' },
    { key: 'roles', label: 'people.col.roles', visible: true, kind: 'roles', filter: 'roles' },
    { key: 'birthday', label: 'people.col.birthday', visible: true, kind: 'birthday', filter: 'flag' },
    { key: 'vacation', label: 'people.col.vacation', visible: true, kind: 'vacation', filter: 'flag' },
    { key: 'anniversary', label: 'people.col.anniversary', visible: true, kind: 'anniversary', filter: 'flag' },
    { key: 'years', label: 'people.col.years', visible: true, kind: 'number', filter: 'text' },
    { key: 'hireDate', label: 'people.col.hireDate', visible: true, kind: 'date', filter: 'text' },
    { key: 'birthDate', label: 'people.col.birthDate', visible: false, kind: 'date', filter: 'text' },
    { key: 'gender', label: 'people.col.gender', visible: false, kind: 'gender', filter: 'text' },
    { key: 'phone', label: 'people.col.phone', visible: false, kind: 'text', filter: 'text' },
    { key: 'address', label: 'people.col.address', visible: false, kind: 'text', filter: 'text' },
    { key: 'emergency', label: 'people.col.emergency', visible: false, kind: 'text', filter: 'text' },
  ];
}
