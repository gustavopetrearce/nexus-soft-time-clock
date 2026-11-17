/** Tipo de permiso (espejo de PermitType del backend). */
export type PermitType = 'LATE_ARRIVAL' | 'EARLY_DEPARTURE' | 'ABSENCE';

/** Motivo (lista fija). INCAPACIDAD alimenta el reporte de incapacidades. */
export type PermitReason = 'PERSONAL' | 'INCAPACIDAD' | 'MEDICO' | 'FAMILIAR' | 'TRAMITE' | 'OTRO';

/** El permiso nace aprobado; la cancelación es definitiva. */
export type PermitStatus = 'APPROVED' | 'CANCELLED';

/** Goce de sueldo; lo decide RR. HH. (`permit:pay`). */
export type PayStatus = 'PENDING_REVIEW' | 'WITH_PAY' | 'WITHOUT_PAY';

export const PERMIT_TYPES: readonly PermitType[] = ['LATE_ARRIVAL', 'EARLY_DEPARTURE', 'ABSENCE'];
export const PERMIT_REASONS: readonly PermitReason[] = ['PERSONAL', 'INCAPACIDAD', 'MEDICO', 'FAMILIAR', 'TRAMITE', 'OTRO'];
export const PERMIT_STATUSES: readonly PermitStatus[] = ['APPROVED', 'CANCELLED'];
export const PAY_STATUSES: readonly PayStatus[] = ['PENDING_REVIEW', 'WITH_PAY', 'WITHOUT_PAY'];

/** Permiso (espejo de PermitResponse). */
export interface Permit {
  id: string;
  userId: string;
  userName?: string;
  employeeCode?: string;
  type: PermitType;
  reason: PermitReason;
  notes?: string;
  startDate: string; // yyyy-MM-dd
  endDate: string;
  days: number;
  timeAt?: string; // HH:mm[:ss]
  status: PermitStatus;
  grantedBy?: string;
  grantedByName?: string;
  cancelledByName?: string;
  cancelledAt?: string;
  cancelNote?: string;
  payStatus: PayStatus;
  payDecidedByName?: string;
  payDecidedAt?: string;
  payNote?: string;
  createdAt: string;
}

export interface PermitFilters {
  type?: PermitType | '';
  reason?: PermitReason | '';
  payStatus?: PayStatus | '';
  status?: PermitStatus | '';
  from?: string;
  to?: string;
  search?: string;
}

export interface CreatePermit {
  userId: string;
  type: PermitType;
  reason: PermitReason;
  startDate: string;
  endDate?: string;
  timeAt?: string;
  notes?: string;
  /** Solo con `permit:pay`. */
  payStatus?: Exclude<PayStatus, 'PENDING_REVIEW'>;
}

/** Vigencia de un permiso aprobado respecto de hoy; los cancelados no tienen. */
export type PermitPhase = 'UPCOMING' | 'IN_PROGRESS' | 'FINISHED';

export function permitPhase(p: Pick<Permit, 'startDate' | 'endDate' | 'status'>, today = isoToday()): PermitPhase | null {
  if (p.status !== 'APPROVED') return null;
  if (today < p.startDate) return 'UPCOMING';
  if (today > p.endDate) return 'FINISHED';
  return 'IN_PROGRESS';
}

/** Fecha local de hoy en yyyy-MM-dd (no UTC: a las 19:00 en CDMX ya sería mañana). */
export function isoToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "HH:mm" a partir de "HH:mm:ss". */
export function shortTime(t?: string): string {
  return t ? t.slice(0, 5) : '';
}
