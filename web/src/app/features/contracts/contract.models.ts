/** Tipo de contrato (espejo de ContractType del backend). */
export type ContractType = 'PROJECT' | 'SHIFT';

/** ACTIVE vigente o futuro · ENDED terminado · CANCELLED capturado por error (definitivo). */
export type ContractStatus = 'ACTIVE' | 'ENDED' | 'CANCELLED';

export const CONTRACT_TYPES: readonly ContractType[] = ['PROJECT', 'SHIFT'];
export const CONTRACT_STATUSES: readonly ContractStatus[] = ['ACTIVE', 'ENDED', 'CANCELLED'];

/** Contrato (espejo de ContractResponse). */
export interface Contract {
  id: string;
  userId: string;
  userName?: string;
  employeeCode?: string;
  type: ContractType;
  projectId?: string;
  projectCode?: string;
  projectName?: string;
  projectStatus?: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
  projectStartsOn?: string;
  projectEndsOn?: string;
  workSiteId?: string;
  startsOn: string; // yyyy-MM-dd
  endsOn?: string; // ausente = indefinido
  status: ContractStatus;
  /** RN-65: ya no cabe en la vigencia del proyecto o el proyecto dejó de estar activo. */
  needsReview: boolean;
  notes?: string;
  createdByName?: string;
  endedByName?: string;
  endedAt?: string;
  cancelledByName?: string;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
}

export interface ContractFilters {
  type?: ContractType | '';
  status?: ContractStatus | '';
  projectId?: string;
  userId?: string;
  activeOn?: string;
  search?: string;
}

export interface CreateContract {
  userId: string;
  type: ContractType;
  projectId?: string;
  workSiteId?: string;
  startsOn: string;
  endsOn?: string;
  notes?: string;
}

export interface UpdateContract {
  workSiteId?: string;
  startsOn: string;
  endsOn?: string;
  notes?: string;
}

export interface ContractOptions {
  collaborators: { id: string; fullName: string; employeeCode?: string }[];
  projects: { id: string; code: string; name: string; status: string; startsOn?: string; endsOn?: string }[];
  workSites: { id: string; code: string; name: string }[];
}

/**
 * Valida un periodo contra la vigencia del proyecto (RN-64), igual que el backend: los extremos
 * vacíos del proyecto no acotan; si el proyecto tiene fin, el contrato debe tenerlo y no rebasarlo.
 */
export function fitsInProject(
  start: string,
  end: string | undefined,
  project: { startsOn?: string; endsOn?: string },
): boolean {
  if (project.startsOn && start < project.startsOn) return false;
  if (project.endsOn && (!end || end > project.endsOn)) return false;
  return true;
}

export { isoToday } from '../permits/permit.models';

/** Vigencia de un contrato no cancelado respecto de hoy. */
export type ContractPhase = 'UPCOMING' | 'IN_PROGRESS' | 'FINISHED';

export function contractPhase(c: Pick<Contract, 'startsOn' | 'endsOn' | 'status'>, today: string): ContractPhase | null {
  if (c.status === 'CANCELLED') return null;
  if (today < c.startsOn) return 'UPCOMING';
  if (c.endsOn && today > c.endsOn) return 'FINISHED';
  return 'IN_PROGRESS';
}

/** Mensaje del backend del módulo HR (`{ error }`) o, si no hay, null. */
export function hrErrorMessage(err: unknown): string | null {
  const body = (err as { error?: unknown } | null)?.error;
  if (body && typeof body === 'object') {
    const msg = (body as { error?: string; detail?: string }).error ?? (body as { detail?: string }).detail;
    return msg?.trim() || null;
  }
  return null;
}
