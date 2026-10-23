import { translateOr } from '../../../core/i18n/translate-or';

/** Plantilla de rol del sistema (espejo de RoleController.RoleResponse). */
export interface Role {
  code: string;
  name: string;
}

/**
 * Nivel de privilegio por rol (espejo de RoleGrantPolicy en el backend). Un operador solo
 * puede otorgar roles de rango estrictamente inferior al suyo. La frontera real es el
 * servidor; este mapa solo alinea la UI. Rol desconocido → no otorgable (Infinity).
 */
export const ROLE_RANK: Record<string, number> = {
  SUPER_ADMIN: 100,
  COMPANY_ADMIN: 80,
  HR_ADMIN: 60,
  SUPERVISOR: 60,
  AUDITOR: 40,
  EMPLOYEE: 20,
};

export function rankOf(code: string): number {
  return ROLE_RANK[code] ?? Number.POSITIVE_INFINITY;
}

/**
 * Nombre en español de cada rol (espejo de los nombres sembrados en V10). Es el respaldo de
 * `roleLabel`, que traduce con las claves `roles.<CODE>` del idioma activo.
 */
export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Administrador',
  COMPANY_ADMIN: 'Administrador de Empresa',
  HR_ADMIN: 'Administrador RR.HH.',
  SUPERVISOR: 'Supervisor',
  AUDITOR: 'Auditor',
  EMPLOYEE: 'Colaborador',
};

/** Etiqueta legible de un rol; si el código es desconocido, se muestra tal cual. */
export function roleLabel(code: string): string {
  return translateOr(`roles.${code}`, ROLE_LABELS[code] ?? code);
}

/** Lista de roles para filtros (código + etiqueta en español). */
export const ROLE_OPTIONS: { code: string; label: string }[] = Object.entries(ROLE_LABELS).map(
  ([code, label]) => ({ code, label }),
);
