import { translateOr } from '../../core/i18n/translate-or';

/** Tipo de incidencia (enum del backend) en el idioma activo. */
export function incidentTypeLabel(type: string): string {
  return translateOr(`incidents.types.${type}`, type);
}

/** Prioridad (HIGH · MEDIUM · LOW) en el idioma activo. */
export function priorityLabel(priority: string): string {
  return translateOr(`incidents.priorities.${priority}`, priority);
}
