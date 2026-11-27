export type ScheduleStatus = 'ACTIVE' | 'INACTIVE';

export const SCHEDULE_STATUSES: ScheduleStatus[] = ['ACTIVE', 'INACTIVE'];

export interface Schedule {
  id: string;
  code: string;
  name: string;
  timezone?: string;
  status: ScheduleStatus;
}

export interface CreateSchedule {
  code: string;
  name: string;
  timezone?: string;
}

export interface UpdateSchedule {
  name: string;
  timezone?: string;
  status: ScheduleStatus;
}

export interface Shift {
  id: string;
  scheduleId: string;
  name: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  breakMinutes: number;
  lateToleranceMin: number;
  earlyToleranceMin: number;
  windowBeforeMin: number;
  windowAfterMin: number;
  /** V38: el turno solo admite las categorías de `allowedBreakTypeIds` (ninguna = sin descansos). */
  breaksRestricted?: boolean;
  allowedBreakTypeIds?: string[];
}

export interface ShiftRequest {
  name: string;
  startTime: string;
  endTime: string;
  crossesMidnight?: boolean;
  breakMinutes?: number;
  lateToleranceMin?: number;
  earlyToleranceMin?: number;
  windowBeforeMin?: number;
  windowAfterMin?: number;
  breaksRestricted?: boolean;
  allowedBreakTypeIds?: string[];
}

export interface Assignment {
  id: string;
  userId: string;
  shiftId: string;
  workSiteId?: string;
  validFrom: string;
  validTo?: string;
}

export interface AssignmentRequest {
  userId: string;
  shiftId: string;
  workSiteId?: string;
  validFrom: string;
  validTo?: string;
}
