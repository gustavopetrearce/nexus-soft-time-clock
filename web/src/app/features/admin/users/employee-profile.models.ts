/** Género del colaborador (espejo del enum Gender del backend). */
export type Gender = 'FEMALE' | 'MALE' | 'OTHER' | 'UNDISCLOSED';

/** Opciones de género en orden de presentación; la etiqueta sale de `gender.<VALOR>`. */
export const GENDERS: readonly Gender[] = ['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED'];

/**
 * Perfil de empleado: datos personales OPCIONALES (1‑a‑1 con el usuario).
 * Autocontenido (incluye teléfono) para no acoplarse al módulo identity/users.
 */
export interface EmployeeProfile {
  userId?: string;
  birthDate?: string; // yyyy-MM-dd
  hireDate?: string; // yyyy-MM-dd
  gender?: Gender | null;
  phone?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}
