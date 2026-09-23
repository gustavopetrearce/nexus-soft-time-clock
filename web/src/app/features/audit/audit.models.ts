/** Entrada de la bitácora de auditoría (RF-12), inmutable/append-only (RN-61). */
export interface AuditEntry {
  id: string;
  /** Nulo cuando la acción la originó el sistema (siembra, jobs), no un usuario. */
  actorUserId?: string;
  actorEmail?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  /** Origen de la acción (RN-60): desde dónde y con qué se hizo. */
  ip?: string;
  userAgent?: string;
  deviceInfo?: string;
  oldValues?: string;
  newValues?: string;
  createdAt: string;
}
