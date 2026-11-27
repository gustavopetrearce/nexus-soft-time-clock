/** Tipo de sanción (espejo de SanctionType). La suspensión lleva inicio y días. */
export type SanctionType = 'VERBAL_WARNING' | 'WRITTEN_WARNING' | 'ADMINISTRATIVE_RECORD' | 'SUSPENSION';

/** Motivo (lista fija); el detalle exacto va en la descripción. */
export type SanctionReason =
  | 'TARDINESS'
  | 'UNJUSTIFIED_ABSENCE'
  | 'MISCONDUCT'
  | 'POLICY_VIOLATION'
  | 'NEGLIGENCE'
  | 'OTHER';

/** Nace vigente; anularla es definitivo. */
export type SanctionStatus = 'ACTIVE' | 'VOIDED';

export const SANCTION_TYPES: readonly SanctionType[] = ['VERBAL_WARNING', 'WRITTEN_WARNING', 'ADMINISTRATIVE_RECORD', 'SUSPENSION'];
export const SANCTION_REASONS: readonly SanctionReason[] = [
  'TARDINESS',
  'UNJUSTIFIED_ABSENCE',
  'MISCONDUCT',
  'POLICY_VIOLATION',
  'NEGLIGENCE',
  'OTHER',
];
export const SANCTION_STATUSES: readonly SanctionStatus[] = ['ACTIVE', 'VOIDED'];

/** Sanción (espejo de SanctionResponse). */
export interface Sanction {
  id: string;
  userId: string;
  userName?: string;
  employeeCode?: string;
  type: SanctionType;
  reason: SanctionReason;
  incidentDate: string; // yyyy-MM-dd
  description: string;
  suspensionStart?: string;
  suspensionDays?: number;
  suspensionEnd?: string;
  status: SanctionStatus;
  issuedByName?: string;
  voidedByName?: string;
  voidedAt?: string;
  voidReason?: string;
  createdAt: string;
}

export interface SanctionFilters {
  type?: SanctionType | '';
  reason?: SanctionReason | '';
  status?: SanctionStatus | '';
  from?: string;
  to?: string;
  search?: string;
}

export interface CreateSanction {
  userId: string;
  type: SanctionType;
  reason: SanctionReason;
  incidentDate: string;
  description: string;
  /** Solo para SUSPENSION. */
  suspensionStart?: string;
  suspensionDays?: number;
}

/** Tono del chip de estado: vigente en aviso (es una sanción en curso), anulada neutra. */
export function sanctionStatusTone(status: SanctionStatus): string {
  return status === 'ACTIVE' ? 'PENDING_REVIEW' : 'INACTIVE';
}

/** Último día de una suspensión (inclusive) a partir del inicio y los días; `''` si faltan datos. */
export function suspensionEnd(start: string | undefined, days: number | undefined): string {
  if (!start || !days || days < 1) return '';
  const [y, m, d] = start.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1, d + days - 1));
  return end.toISOString().slice(0, 10);
}
