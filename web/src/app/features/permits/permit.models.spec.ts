import { permitPhase, shortTime } from './permit.models';

describe('permit.models', () => {
  const absence = { startDate: '2026-11-16', endDate: '2026-11-20', status: 'APPROVED' as const };

  it('vigencia de un permiso aprobado según hoy (extremos inclusive)', () => {
    expect(permitPhase(absence, '2026-11-15')).toBe('UPCOMING');
    expect(permitPhase(absence, '2026-11-16')).toBe('IN_PROGRESS');
    expect(permitPhase(absence, '2026-11-20')).toBe('IN_PROGRESS');
    expect(permitPhase(absence, '2026-11-21')).toBe('FINISHED');
  });

  it('un permiso cancelado no tiene vigencia', () => {
    expect(permitPhase({ ...absence, status: 'CANCELLED' }, '2026-11-18')).toBeNull();
  });

  it('pendiente y rechazado tampoco tienen vigencia', () => {
    expect(permitPhase({ ...absence, status: 'PENDING' }, '2026-11-18')).toBeNull();
    expect(permitPhase({ ...absence, status: 'REJECTED' }, '2026-11-18')).toBeNull();
  });

  it('acorta la hora a HH:mm', () => {
    expect(shortTime('10:30:00')).toBe('10:30');
    expect(shortTime(undefined)).toBe('');
  });
});
