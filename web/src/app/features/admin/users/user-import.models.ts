/** Fila enviada a `POST /users/import` (espejo de UserImportController.ImportRowRequest). */
export interface ImportRowRequest {
  /** Número de fila en el archivo (la 1 es el encabezado). */
  row: number;
  email?: string;
  firstName?: string;
  lastName?: string;
  employeeCode?: string;
  roles: string[];
  phone?: string;
  birthDate?: string;
  hireDate?: string;
  gender?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  scheduleCode?: string;
  shiftName?: string;
  workSiteCode?: string;
  shiftFrom?: string;
  shiftTo?: string;
}

/** Error de una fila (`row = 0`: del archivo completo). */
export interface ImportIssue {
  row: number;
  column?: string | null;
  code: string;
  message: string;
}

export interface ImportedUser {
  row: number;
  userId: string;
  email: string;
  employeeCode?: string | null;
  firstName: string;
  lastName: string;
  roles: string[];
  temporaryPassword: string;
}

export interface ImportResponse {
  dryRun: boolean;
  valid: boolean;
  totalRows: number;
  seatsNeeded: number;
  seatsAvailable: number;
  issues: ImportIssue[];
  created: ImportedUser[];
}
